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
      timeoutMs: 50000,
      onOutput,
      onComplete,
      matchSuccess: (line) => line.match(/(extrinsics saved.*|saved to:\s*.+)/i),
      buildSuccessPayload: (_match, line) => ({ ok: true, message: line }),
      buildFailurePayload: (reason) => ({ ok: false, error: reason }),
    });
  }

  runCalibration({
    type,
    args,
    timeoutMs,
    onOutput,
    onComplete,
    matchSuccess,
    buildSuccessPayload,
    buildFailurePayload,
  }) {
    this.cancel(type);

    const exePath = getIrisCliPath();
    console.log(`[${type}] spawning: ${exePath} ${args.join(' ')}`);

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
        child.kill();
      } catch {
        // Ignore missing process errors.
      }
    };

    const finalize = (payload) => {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(inactivityTimer);
      setInactive();
      onComplete(payload);
    };

    const handleLine = (rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        return false;
      }

      console.log(`[${type}] ${line}`);
      onOutput(line);

      const match = matchSuccess(line);
      if (!match) {
        return false;
      }

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
        if (handleLine(line)) {
          return true;
        }
      }

      return false;
    };

    const resetTimer = () => {
      if (completed) {
        return;
      }

      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (completed) {
          return;
        }

        stopChild();
        onOutput(`[timeout] No new data for ${timeoutMs / 1000}s - process killed.`);
        finalize(buildFailurePayload('timeout'));
      }, timeoutMs);
    };

    resetTimer();

    child.onData((data) => {
      buffer += data.toString();
      if (!flushBuffer()) {
        resetTimer();
      }
    });

    child.onExit(({ exitCode }) => {
      clearTimeout(inactivityTimer);
      setInactive();

      if (completed) {
        return;
      }

      if (flushBuffer(true)) {
        return;
      }

      const reason = exitCode == null ? 'cancelled' : `exited with code ${exitCode}`;
      finalize(buildFailurePayload(reason));
    });

    return { ok: true };
  }
}

module.exports = { CalibrationManager };
