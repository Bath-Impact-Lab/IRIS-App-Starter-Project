'use strict';

const readline = require('readline');
const { app, ipcMain } = require('electron')
const crypto = require('crypto')
const path = require('path')
const { spawn, execFile } = require('child_process')
const { BrowserWindow } = require('electron')
const fs = require('fs')
const os = require('os')

const workers = new Map()

function buildConfigFromOptions(opts = {}) {
  const run_id = opts.run_id || `run-${Date.now()}`;
  const devices = {
    gpu: 0,
    cuda_streams: 2,
    nvenc: false,
  };
  const buffers = {
    frame_capacity: 256,
    pose_capacity: 256,
    export_shm: false,
    camera_count: opts.cameras?.length,
    camera_slots: 1,
    camera_width: opts.camera_width ?? 1920,
    camera_height: opts.camera_height ?? 1080,
  };

  const capture = (opts.cameras || []).map((c, index) => ({
    name: `cap${index}`,
    params: {
      camera_id: index,
      width: c.width,
      height: c.height,
      rotate: c.rotation,
      format: 'BGR8',
      fps: c.fps,
      use_camera: true,
      device_id: 0,
      batching: true,
      batch_cameras: opts.cameras.map((_, idx) => idx),
    }
  }));

  const output = {
    name: 'output',
    params: {
      shm_name: "iris_shm_ipc",
      capacity: 120,
      frame_width: opts.camera_width ?? 1920,
      frame_height: opts.camera_height ?? 1080,
      num_cameras: opts.cameras.length,
    }
  };

  return { run_id, devices, buffers, capture, output }
}

function writeTempConfigFile(configObj) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-'))
  const cfgPath = path.join(tmpDir, 'config.json')
  fs.writeFileSync(cfgPath, JSON.stringify(configObj, null, 2), { encoding: 'utf8' })
  return { tmpDir, cfgPath }
}

async function killProcessTree(sessionId) {
  const entry = workers.get(sessionId)
  if (!entry) return false
  const { child } = entry

  return new Promise((resolve) => {
    const onExit = () => resolve(true)

    try { child.kill('SIGTERM'); } catch { }

    if (process.platform === 'win32') {
      const pid = child.pid
      if (pid) {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {
          resolve(true)
        })
        return
      }
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { }
    }

    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { }
      resolve(true)
    }, 1000)

    child.once('exit', onExit)
    child.once('close', onExit)
  })
}

function registerIrisIpc() {  
  ipcMain.handle('start-iris', (event, options) => {
    const sessionId = crypto.randomUUID()
    const cfgObj = buildConfigFromOptions(options)
    const paths = writeTempConfigFile(cfgObj)
    const cfgPath = paths.cfgPath
    const tmpDir = paths.tmpDir
    if (fs.existsSync(path.join(__dirname, "..", "iris_runtime_bundle", "exe file"))) {
      try {
        const args = ['--config', cfgPath]
        //waiting for iris stuff to be done to implement
        let exePath = path.join(__dirname, "..", "iris_runtime_bundle", "exe file")
        if (app.isPackaged) {
          exePath = path.join(process.resourcesPath, "app.asar.unpacked", "iris_runtime_bundle", "exe file")
        }

        const exe = exePath
        const exeDir = path.dirname(exePath)
        //might be changed
        const child = spawn(exe, args, {
          cwd: exeDir,
          env: {IRIS_SPEC_PATH: cfgPath}, 
          windowHide: true,
          detached: process.platform !== 'win32',
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        console.log(`[iris:${sessionId}] START pid=${child.pid}`)
        console.log(`[iris:${sessionId}] exe=${exe} args=${JSON.stringify(args)}`)

        child.stdout.on('data', (d) => {
          //pass IRIS data to frontend to render
          const targetWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send('iris-data', d);
          }
        })

        child.stderr.on('data', (d) => {
          console.log(`[iris:${sessionId}] stderr: ${d.toString().trim()}`)
        })

        child.on('error', (err) => {
          console.error(`[iris:${sessionId}] PROCESS ERROR`, err)
        })
      
        workers.set(sessionId, { child, tmpDir, cfgPath })

        const cleanup = () => {
          const entry = workers.get(sessionId)
          if (!entry) return;

          console.log(`[iris:${sessionId}] cleanup triggered`)

          try {
            if (entry.tmpDir && fs.existsSync(entry.tmpDir)) {
              console.log(`[iris:${sessionId}] removing tmpDir=${entry.tmpDir}`)
              try { fs.rmSync(entry.tmpDir, { recursive: true, force: true }); } catch { }
            }
          } finally {
            console.log(`[iris:${sessionId}] removed worker entry`)
            workers.delete(sessionId);
          }
        }

        child.once('exit', (code, signal) => {
          console.log(`[iris:${sessionId}] EXIT code=${code} signal=${signal}`)
          cleanup()
        })

        child.once('close', (code, signal) => {
          console.log(`[iris:${sessionId}] CLOSE code=${code} signal=${signal}`)
          cleanup()
        })

        // Choose target window: current sender or focused
        const targetWindow =
          BrowserWindow.fromWebContents(event.sender) ||
          BrowserWindow.getFocusedWindow()

        return {
          ok: true,
          sessionId,
          configPath: cfgPath,
          pipeStarted: false,
        };
      }
      catch {
        console.log("failed")
      }
    }
    else {
      const positions = require("./../public/assets/position 2.json")
      const targetWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('iris-data', positions)
      }
    }
  })
  
  ipcMain.handle('stop-iris', (event, Id) =>{
    const sessionId = String(Id);
    const entry = workers.get(sessionId);
    if (!entry) return { ok: false, error: 'not_found' };

    console.log(`[iris:${sessionId}] stop requested (via stdin)`);

    const { child } = entry;
    let ok = false;

    if (child.stdin && !child.stdin.destroyed) {
      try {
        // 1) Simulate user pressing Enter (empty line)
        child.stdin.write('\n');

        // 2) Also close stdin to give EOF, in case the runtime
        //    is treating EOF as shutdown too.
        child.stdin.end();

        ok = true;
      } catch (err) {
        console.error(`[iris:${sessionId}] failed to write to stdin`, err);
        ok = false;
      }
    } else {
      console.warn(`[iris:${sessionId}] stdin not available or already destroyed`);
    }

    // Give 10s to exit gracefully, then force kill if still around
    setTimeout(async () => {
      const stillExists = workers.get(sessionId);
      if (stillExists) {
        console.warn(`[iris:${sessionId}] process didn't exit gracefully, force killing...`);
        await killProcessTree(sessionId);
      }
    }, 10000);

    // Let 'exit' / 'close' handlers do cleanup and workers.delete(...)
    return { ok };
  })
}

module.exports = { registerIrisIpc }
