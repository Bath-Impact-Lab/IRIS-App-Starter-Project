#!/usr/bin/env node
// Simple IRIS mock process: reads JSON lines on stdin, writes JSON lines on stdout.
// Messages are { type: string, payload?: any }
const readline = require('readline');

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
