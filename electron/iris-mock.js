#!/usr/bin/env node
// Simple IRIS mock process: reads JSON lines on stdin, writes JSON lines on stdout.
// Messages are { type: string, payload?: any }
'use strict';

const readline = require('readline');
const { app, ipcMain } = require('electron')


const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let running = true;
let poseTimer = null;
const POSE_INTERVAL_MS = parseInt(process.env.IRIS_POSE_INTERVAL_MS || '1000', 10); // configurable, default 1s

function send(obj){
  try { process.stdout.write(JSON.stringify(obj) + '\n'); } catch {}
}

function startPose(){
  if (poseTimer) return;
  poseTimer = setInterval(() => {
    send({ type: 'pose-frame', payload: { ts: Date.now(), note: 'mock-pose' } });
  }, POSE_INTERVAL_MS);
}

function stopPose(){ if (poseTimer) { clearInterval(poseTimer); poseTimer = null; } }

rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'ping':
      send({ type: 'pong', payload: { ts: Date.now() } });
      startPose();
      break;
    case 'camera-info':
    case 'camera-list':
      // Acknowledge and ensure pose streaming
      send({ type: 'ack', payload: { for: msg.type, ts: Date.now() } });
      startPose();
      break;
    case 'shutdown':
      send({ type: 'ack', payload: { for: 'shutdown' } });
      stopPose();
      running = false; rl.close(); process.exit(0);
      break;
    default:
      send({ type: 'warn', payload: { msg: 'unknown message', got: msg.type } });
  }
});

process.on('SIGINT', () => { stopPose(); process.exit(0); });

// Send an initial hello so the UI can mark connected immediately
send({ type: 'hello', payload: { ts: Date.now(), note: 'iris-mock ready' } });


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
      num_cameras: opts.cameras.length(),
    }
  };

  return { run_id, devices, buffers, capture, output };
}

function registerIrisIpc() {  
  ipcMain.handle('start-iris', (event, options) =>{
    console.log(options)
  })
  
  ipcMain.handle('stop-iris', (event, Id) =>{
    console.log(Id)
  })
}