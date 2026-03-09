'use strict';

const readline = require('readline');
const { app, ipcMain, BrowserWindow } = require('electron');
const crypto = require('crypto');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');
const net = require('net');

// ── Configuration & State ─────────────────────────────────────────────────────
const IRIS_CLI_EXE = 'C:\\Users\\Sam\\Documents\\Iris\\build\\bin\\iris_cli.exe';
const PIPE_NAME = '\\\\.\\pipe\\iris_ipc'; // Windows named pipe path

const workers = new Map();
let activeIntrinsicsChild = null;
let activeExtrinsicsChild = null;
let monitorProcess = null;

// ── Utility Functions ─────────────────────────────────────────────────────────
function getTargetWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
}

function buildConfigFromOptions(opts = {}) {
  const run_id = opts.run_id || `run-${Date.now()}`;
  const width = opts.camera_width ?? 1920;
  const height = opts.camera_height ?? 1080;
  const cameras = opts.cameras || [];

  return {
    run_id,
    devices: { gpu: 0, cuda_streams: 2, nvenc: false },
    buffers: {
      frame_capacity: 256,
      pose_capacity: 256,
      export_shm: false,
      camera_count: cameras.length,
      camera_slots: 1,
      camera_width: width,
      camera_height: height,
    },
    capture: cameras.map((c, index) => ({
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
        batch_cameras: cameras.map((_, idx) => idx),
      }
    })),
    detection: {
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
    },
    global_reid_tracking: {
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
    },
    pose_estimation: {
      name: "pose0",
      params: {
        device_id: 0,
        batch: 16,
        engine: "models/rtmpose_bs16_fp16.trt",
        input_w: 192,
        input_h: 256,
        split_ratio: 2.0
      }
    },
    triangulation: {
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
    },
    online_calibration: {
      name: "online_calib",
      type: "OnlineCalibration",
      inputs: { PoseBatch: "triangulation.PoseBatch" },
      params: {
        window_size: 300,
        min_joint_conf: 0.6,
        learning_rate: 0.01,
        num_epochs: 100,
        huber_delta: 10.0
      }
    },
    output: {
      name: 'output',
      params: {
        shm_name: "iris_shm_ipc",
        capacity: 120,
        frame_width: width,
        frame_height: height,
        num_cameras: cameras.length,
      }
    }
  };
}

function writeTempConfigFile(configObj) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-'));
  const cfgPath = path.join(tmpDir, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(configObj, null, 2), { encoding: 'utf8' });
  return { tmpDir, cfgPath };
}

async function killProcessTree(sessionId) {
  const entry = workers.get(sessionId);
  if (!entry) return false;
  const { child } = entry;

  return new Promise((resolve) => {
    const onExit = () => resolve(true);
    try { child.kill('SIGTERM'); } catch { }

    if (process.platform === 'win32' && child.pid) {
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve(true));
      return;
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { }
    }

    setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { }
      resolve(true);
    }, 1000);

    child.once('exit', onExit);
    child.once('close', onExit);
  });
}

function createPipeServer(event) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((stream) => {
      console.log('[pipe] Client connected to IRIS pipe');
      
      let buffer = '';

      stream.on('data', (data) => {
        // Accumulate chunk into the string buffer
        buffer += data.toString('utf8');
        
        // Process line by line
        let boundary = buffer.indexOf('\n');
        while (boundary !== -1) {
          const line = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 1);
          
          if (line) {
            try {
              const parsedData = JSON.parse(line);
              
              // Get the frontend window and send the JSON frame
              const targetWindow = getTargetWindow(event);
              if (targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.webContents.send('iris-data', parsedData);
              }
            } catch (e) {
              console.error('[pipe] JSON parse error on stream line:', e.message);
            }
          }
          // Find the next newline
          boundary = buffer.indexOf('\n');
        }
      });

      stream.on('end', () => console.log('[pipe] Client disconnected'));
      stream.on('error', (err) => console.error('[pipe] stream error:', err));
    });

    server.on('error', (err) => {
      console.error('[pipe] Server error:', err);
      reject(err);
    });

    server.listen(PIPE_NAME, () => {
      console.log(`[pipe] Server listening on ${PIPE_NAME}`);
      resolve(server);
    });
  });
}

// Unified process spawner for standard & stream runs
function spawnIrisWorker(sessionId, args, cfgPath, tmpDir, event, pipeServer = null) {
  let exePath = app.isPackaged 
    ? path.join(process.resourcesPath, "app.asar.unpacked", "iris_runtime_bundle", "iris_cli.exe") // Fixed literal "exe file" bug here
    : IRIS_CLI_EXE;

  try {
    const child = spawn(exePath, args, {
      cwd: path.dirname(exePath),
      env: { ...process.env, IRIS_SPEC_PATH: cfgPath },
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log(`[iris:${sessionId}] START pid=${child.pid}`);
    console.log(`[iris:${sessionId}] exe=${exePath} args=${JSON.stringify(args)}`);

    child.stdout.on('data', (d) => {
      const targetWindow = getTargetWindow(event);
      if (!targetWindow || targetWindow.isDestroyed()) return;
      if (pipeServer) {
        targetWindow.webContents.send('iris-cli-output', { channel: 'stdout', line: d.toString() });
      } else {
        targetWindow.webContents.send('iris-data', d);
      }
    });

    child.stderr.on('data', (d) => console.log(`[iris:${sessionId}] stderr: ${d.toString().trim()}`));
    child.on('error', (err) => console.error(`[iris:${sessionId}] PROCESS ERROR`, err));

    workers.set(sessionId, { child, tmpDir, cfgPath, pipeServer });

    const cleanup = () => {
      const entry = workers.get(sessionId);
      if (!entry) return;

      console.log(`[iris:${sessionId}] cleanup triggered`);
      if (entry.pipeServer) {
        entry.pipeServer.close(() => console.log(`[iris:${sessionId}] pipe server closed`));
      }

      if (entry.tmpDir && fs.existsSync(entry.tmpDir)) {
        try { fs.rmSync(entry.tmpDir, { recursive: true, force: true }); } catch { }
      }
      
      workers.delete(sessionId);
    };

    child.once('exit', (code, signal) => {
      console.log(`[iris:${sessionId}] EXIT code=${code} signal=${signal}`);
      cleanup();
    });

    child.once('close', (code, signal) => {
      console.log(`[iris:${sessionId}] CLOSE code=${code} signal=${signal}`);
      cleanup();
    });

    return { ok: true, sessionId, configPath: cfgPath, pipeStarted: !!pipeServer };
  } catch (error) {
    console.error("Failed to start IRIS process:", error);
    if (pipeServer) pipeServer.close();
    return { ok: false, error: error.message };
  }
}

function sendMockData(event) {
  try {
    const positions = require("./../public/assets/mock-halpe26-stream.json");
    const targetWindow = getTargetWindow(event);
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send('iris-data', positions);
    }
  } catch(err) {
    console.error("Failed to load mock data:", err);
  }
}

// ── Main IPC Registration ─────────────────────────────────────────────────────
function registerIrisIpc() {
  
  ipcMain.handle('start-iris', (event, options) => {
    const sessionId = crypto.randomUUID();
    if (!fs.existsSync(IRIS_CLI_EXE)) {
      sendMockData(event);
      return { ok: false, error: 'Executable not found, using mock data' };
    }

    const { tmpDir, cfgPath } = writeTempConfigFile(buildConfigFromOptions(options));
    return spawnIrisWorker(sessionId, ["run", cfgPath], cfgPath, tmpDir, event);
  });

  ipcMain.handle('start-iris-stream', async (event, options) => {
    const sessionId = crypto.randomUUID();
    if (!fs.existsSync(IRIS_CLI_EXE)) {
      sendMockData(event);
      return { ok: false, error: 'Executable not found, using mock data' };
    }

    const { tmpDir, cfgPath } = writeTempConfigFile(buildConfigFromOptions(options));
    const args = ["monitor", "--shm-name", 'iris_shm_ipc', '--pipe', PIPE_NAME, '--fps', '30'];
    
    try {
      // Spin up the pipe server just before opening the stream
      const pipeServer = await createPipeServer(event);
      return spawnIrisWorker(sessionId, args, cfgPath, tmpDir, event, pipeServer);
    } catch (err) {
      console.error("Failed to start pipe server", err);
      return { ok: false, error: "Pipe server failed to start" };
    }
  });

  // Consolidated stop handler
  ipcMain.handle('stop-iris', (event, Id) => {
    const sessionId = String(Id);
    const entry = workers.get(sessionId);
    if (!entry) return { ok: false, error: 'not_found' };

    console.log(`[iris:${sessionId}] stop requested`);
    const { child } = entry;
    let ok = false;

    if (child.stdin && !child.stdin.destroyed) {
      try {
        child.stdin.write('\n');
        child.stdin.end();
        ok = true;
      } catch (err) {
        console.error(`[iris:${sessionId}] failed to write to stdin`, err);
      }
    }

    // Force kill fallback
    setTimeout(async () => {
      if (workers.has(sessionId)) {
        console.warn(`[iris:${sessionId}] process didn't exit gracefully, force killing...`);
        await killProcessTree(sessionId);
      }
    }, 10000);

    return { ok };
  });

  // ── Callibration Endpoints ──────────────────────────────────────────────────
  ipcMain.handle('cancel-intrinsics', () => {
    if (activeIntrinsicsChild) {
      console.log('[Intrinsics] cancelled by user');
      try { activeIntrinsicsChild.kill(); } catch { }
      activeIntrinsicsChild = null;
    }
    return { ok: true };
  });

  ipcMain.handle('cancel-extrinsics', () => {
    if (activeExtrinsicsChild) {
      console.log('[extrinsics] cancelled by user');
      try { activeExtrinsicsChild.kill(); } catch { }
      activeExtrinsicsChild = null;
    }
    return { ok: true };
  });

  ipcMain.handle('calculate-intrinsics', async (event, index) => {
    return handleCalibrationPTY('intrinsics', index, ['calculate-intrinsics', '--camera', String(index)], event, 25000);
  });

  ipcMain.handle('calculate-extrinsics', async (event, cameraIndices) => {
    const cameraArg = Array.isArray(cameraIndices) ? cameraIndices.join(',') : String(cameraIndices);
    return handleCalibrationPTY('extrinsics', null, ['calculate-extrinsics', '--cameras', cameraArg], event, 50000);
  });

  // ── Monitor (Recording) Endpoints ───────────────────────────────────────────
  ipcMain.handle('start-monitor', async (event, outputDir) => {
    if (monitorProcess) {
      try { monitorProcess.kill(); } catch { }
      monitorProcess = null;
    }

    try {
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    } catch (err) {
      return { ok: false, error: err.message };
    }

    try {
      monitorProcess = spawn(IRIS_CLI_EXE, ['monitor', '--output-dir', outputDir], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      monitorProcess.stdout.on('data', (d) => console.log('[monitor] ' + d.toString().trim()));
      monitorProcess.stderr.on('data', (d) => console.log('[monitor stderr] ' + d.toString().trim()));
      monitorProcess.on('exit', () => { monitorProcess = null; });
      return { ok: true, outputDir };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('stop-monitor', async () => {
    if (!monitorProcess) return { ok: true };
    return new Promise((resolve) => {
      const proc = monitorProcess;
      monitorProcess = null;
      const done = () => resolve({ ok: true });

      if (process.platform === 'win32' && proc.pid) {
        execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, done);
      } else {
        try { proc.kill('SIGTERM'); } catch { }
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch { } done(); }, 3000);
        proc.once('exit', done);
      }
    });
  });
}

// Helper to DRY out PTY processes (Intrinsics / Extrinsics)
function handleCalibrationPTY(type, index, args, event, timeoutMs) {
  let inactivityTimer;
  let completed = false;
  const targetWindow = getTargetWindow(event);

  function sendOutput(line) {
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send('iris-cli-output', { channel: type, cameraIndex: index, line });
    }
  }

  let child;
  try {
    child = pty.spawn(IRIS_CLI_EXE, args, {
      name: 'xterm-color',
      cols: 220,
      rows: 30,
      cwd: path.dirname(IRIS_CLI_EXE),
      env: process.env,
    });
    if (type === 'intrinsics') activeIntrinsicsChild = child;
    else activeExtrinsicsChild = child;
  } catch (err) {
    sendOutput(`[error] ${err.message}`);
    return { ok: false };
  }

  function resetTimer() {
    if (completed) return;
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      if (completed) return;
      child.kill();
      sendOutput(`[timeout] No new data for ${timeoutMs/1000}s — process killed.`);
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(`${type}-complete`, { idx: index, path: "None", ok: false, error: 'timeout' });
      }
    }, timeoutMs);
  }

  resetTimer();

  child.onData((data) => {
    const str = data.toString();
    str.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').forEach(line => {
      if (line.trim()) { console.log(`[${type}] ${line.trim()}`); sendOutput(line.trim()); }
    });

    if (str.toLowerCase().includes("saved to:")) {
      completed = true;
      clearTimeout(inactivityTimer);
      child.kill();
      const match = str.match(/saved to:\s*(.+)/i);
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(`${type}-complete`, { idx: index, path: match ? match[1].trim() : "None", ok: true });
      }
    } else {
      resetTimer();
    }
  });

  child.onExit(() => {
    clearTimeout(inactivityTimer);
    if (type === 'intrinsics') activeIntrinsicsChild = null;
    else activeExtrinsicsChild = null;
    if (!completed) {
      completed = true;
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(`${type}-complete`, { idx: index, path: "None", ok: false });
      }
    }
  });

  return { ok: true };
}

module.exports = { registerIrisIpc, IRIS_CLI_EXE };