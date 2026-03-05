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

  const detection = {
    name: "det0",
    params: {
      device_id: 0,
      batch_size: 4,
      rtmdet_engine_path: "models/rtmdet_t_bs4_fp16.trt",
      rtmdet_input_width: 640,
      rtmdet_input_height: 640,
      rtmdet_conf_threshold: 0.7,
      rtmdet_iou_threshold: 0.45,
      detection_skip_enabled: true,
      detection_skip_frames: 20,
      reid_enabled: true,
      osnet_engine_path: "models/osnet_x05_fp16.trt",
      reid_min_detection_conf: 0.55
    }
  }

  const global_reid_tracking = {
    name: "global_track",
    params: {
      single_person_mode: false,
      max_age: 200,
      min_hits: 1,
      min_detection_confidence: 0.5,
      appearance_threshold: 0.45,
      cross_camera_unconfirmed_threshold: 0.55,
      use_motion_prediction: false
    }
  }

  const pose_estimation =  {
    name: "pose0",
    params: {
      device_id: 0,
      batch: 16,
      engine: "models/rtmpose_bs16_fp16.trt",
      input_w: 192,
      input_h: 256,
      split_ratio: 2.0
    }
  }

  const triangulation = {
    name: "tri0",
    params: {
      pose_sources: "pose0",
      calibration_dir: "calibration_output",
      extrinsics_file: "calibration_output/extrinsics.json",
      camera_ids: [0, 1, 2, 3],
      compute_reprojection: true,
      store_reprojection_error: true,
      gate_by_reprojection_error: true,
      max_reprojection_error_px: 50.0,
      smoothing: {
        enabled: true,
        freq: 100.0,
        min_cutoff: 1.0,
        beta: 0.5,
        d_cutoff: 1.0,
        cleanup_interval: 300
      }
    }
  }
  
  const online_calibration = {
    name: "online_calib",
    type: "OnlineCalibration",
    inputs: {
      PoseBatch: "triangulation.PoseBatch"
    },
    params: {
      window_size: 300,
      min_joint_conf: 0.6,
      learning_rate: 0.01,
      num_epochs: 100,
      huber_delta: 10.0
    }
  }

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

  return { 
    run_id, 
    devices, 
    buffers, 
    capture, 
    detection, 
    global_reid_tracking, 
    pose_estimation, 
    triangulation, 
    online_calibration, 
    output 
  }
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
    if (fs.existsSync(path.join(__dirname, "..", "IRIS", "bin", "iris_cli.exe"))) {
      try {
        const args = ["run", cfgPath]
        //waiting for iris stuff to be done to implement
        let exePath = path.join(__dirname, "..", "IRIS", "bin", "iris_cli.exe")

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
      const positions = require("./../public/assets/mock-halpe26-stream.json")
      const targetWindow = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('iris-data', positions)
      }
    }
  })
  
  ipcMain.handle('stop-iris', (event, Id) => {
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

ipcMain.handle('calculate-intrinsics', (event, device_id, rotation) => {
  let exePath = path.join(__dirname, "..", "IRIS", "bin", "iris_cli.exe")
  let args = ["show-cameras", "-v"]
  const child = spawn(exePath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  
  child.stdout.on('data', (d) => {
    const data = d.toString().trim()
    
    const ids = [...data.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);

    const devices_detected = []

    ids.forEach(id => {
      devices_detected.push(id.replaceAll("-", ""))
    })
    console.log(devices_detected.includes(device_id), device_id)

  })
  const ok = true
  return {ok} 
})

module.exports = { registerIrisIpc }
