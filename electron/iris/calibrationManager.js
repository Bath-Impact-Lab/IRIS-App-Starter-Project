'use strict';

const path = require('path');
const pty = require('node-pty');
const { getIrisCliPath } = require('./config');

class CalibrationManager {
  constructor() {
    this.activeChildren = {
      intrinsics: null,
      extrinsics: null,
    };
  }

  cancelIntrinsics() {
    this.cancel('intrinsics');
    return { ok: true };
  }

  cancelExtrinsics() {
    this.cancel('extrinsics');
    return { ok: true };
  }

  cancel(type) {
    const child = this.activeChildren[type];
    if (!child) {
      return;
    }

    console.log(`[${type}] cancelled by user`);
    try {
      child.kill();
    } catch {
      // Ignore missing process errors.
    }
    this.activeChildren[type] = null;
  }

  calculateIntrinsics({ cameraIndex, rotation, onOutput, onComplete }) {
    return this.runCalibration({
      type: 'intrinsics',
      args: ['calculate-intrinsics', '--camera', String(cameraIndex), '--rotate', String(rotation)],
      startDelayMs: 5000,
      timeoutMs: 25000,
      onOutput,
      onComplete,
      matchSuccess: (line) => line.match(/Intrinsics saved to:\s*(.+)/i),
      buildSuccessPayload: (match) => ({ idx: cameraIndex, path: match?.[1]?.trim() || 'None' }),
      buildFailurePayload: () => ({ idx: cameraIndex, path: 'None' }),
    });
  }

  calculateExtrinsics({ cameraIndices, rotation, onOutput, onComplete }) {
    const cameraArg = Array.isArray(cameraIndices) ? cameraIndices.join(',') : String(cameraIndices);

    return this.runCalibration({
      type: 'extrinsics',
      args: ['calculate-extrinsics', '--cameras', cameraArg, '--rotate', String(rotation)],
      startDelayMs: 5000,
      timeoutMs: 50000,
      onOutput,
      onComplete,
      matchSuccess: (line) => line.match(/(extrinsics saved.*|saved to:\s*.+)/i),
      buildSuccessPayload: (_match, line) => ({ ok: true, message: line }),
      buildFailurePayload: (reason) => ({ ok: false, error: reason }),
    });
  }

  async runCalibration({
    type,
    args,
    startDelayMs = 0,
    timeoutMs,
    onOutput,
    onComplete,
    matchSuccess,
    buildSuccessPayload,
    buildFailurePayload,
  }) {
    this.cancel(type);

    const exePath = getIrisCliPath();
    console.log(`[${type}] waiting ${startDelayMs}ms before spawning: ${exePath} ${args.join(' ')}`);

    // Wait in the main process so the OS/MSMF driver has time to fully release
    // the camera after the Electron renderer stopped its MediaStream tracks.
    if (startDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, startDelayMs));
    }

    console.log(`[${type}] spawning now`);

    let child;
    try {
      child = pty.spawn(exePath, args, {
        name: 'xterm-color',
        cols: 220,
        rows: 30,
        cwd: path.dirname(exePath),
        env: process.env,
      });
      this.activeChildren[type] = child;
    } catch (err) {
      console.error(`[${type}] pty spawn error:`, err);
      onOutput(`[error] ${err.message}`);
      onComplete(buildFailurePayload(err.message));
      return { ok: false, error: err.message };
    }

    let inactivityTimer;
    let completed = false;
    let buffer = '';

    const setInactive = () => {
      if (this.activeChildren[type] === child) {
        this.activeChildren[type] = null;
      }
    };

    const stopChild = () => {
      try {
        // On Windows, node-pty's child.kill() runs conpty_console_list_agent.js to
        // enumerate the console process list before terminating. If iris_cli has
        // already exited naturally this causes "AttachConsole failed" noise.
        // Killing by PID directly bypasses that ConPTY path entirely.
        if (process.platform === 'win32' && child.pid) {
          process.kill(child.pid);
        } else {
          child.kill();
        }
      } catch {
        // Ignore: process may have already exited.
      }
    };

    const finalize = (payload) => {
      if (completed) return;
      completed = true;
      clearTimeout(inactivityTimer);
      setInactive();
      onComplete(payload);
    };

    const handleLine = (rawLine) => {
      const line = rawLine.trim();
      if (!line) return false;

      console.log(`[${type}] ${line}`);
      onOutput(line);

      const match = matchSuccess(line);
      if (!match) return false;

      stopChild();
      finalize(buildSuccessPayload(match, line));
      return true;
    };

    const flushBuffer = (flushRemainder = false) => {
      const normalized = flushRemainder
        ? `${buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')}\n`
        : buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      const lines = normalized.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (handleLine(line)) return true;
      }
      return false;
    };

    const resetTimer = () => {
      if (completed) return;
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (completed) return;
        stopChild();
        onOutput(`[timeout] No new data for ${timeoutMs / 1000}s - process killed.`);
        finalize(buildFailurePayload('timeout'));
      }, timeoutMs);
    };

    resetTimer();

    child.onData((data) => {
      buffer += data.toString();
      if (!flushBuffer()) resetTimer();
    });

    child.onExit(({ exitCode }) => {
      clearTimeout(inactivityTimer);
      setInactive();
      if (completed) return;
      if (flushBuffer(true)) return;
      const reason = exitCode == null ? 'cancelled' : `exited with code ${exitCode}`;
      finalize(buildFailurePayload(reason));
    });

    return { ok: true };
  }
}

module.exports = { CalibrationManager };
