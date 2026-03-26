'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { buildConfigFromOptions, getIrisCliPath } = require('./config');
const { writeTempConfigFile } = require('./utils');
const { createPipeServer } = require('./pipeServer');
const { VideoStreamer } = require('./videoStreamer');

const execFileAsync = promisify(execFile);

function waitForChildExit(child, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      child.off('exit', finish);
      child.off('close', finish);
      resolve(true);
    };

    const timer = setTimeout(finish, timeoutMs);
    child.once('exit', finish);
    child.once('close', finish);
  });
}

function buildPipeName(prefix, sessionId) {
  const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `\\\\.\\pipe\\${prefix}_${safeSessionId}`;
}

class ProcessManager {
  constructor() {
    this.workers = new Map();
    this._lastStopTimestamp = 0;
  }

  getExecutablePath() {
    return getIrisCliPath();
  }

  hasExecutable() {
    return fs.existsSync(this.getExecutablePath());
  }

  async startStandard({ sessionId, options, onMockData, onData }) {
    if (!this.hasExecutable()) {
      onMockData();
      return { ok: false, error: 'Executable not found, using mock data' };
    }

    const { tmpDir, cfgPath } = writeTempConfigFile(buildConfigFromOptions(options));
    return this.spawnWorker({
      sessionId,
      args: ['run', cfgPath],
      cfgPath,
      tmpDir,
      onStdout: onData,
    });
  }

  async startStream({ sessionId, options, onMockData, onFrame, onCliOutput }) {
    if (!this.hasExecutable()) {
      onMockData();
      return { ok: false, error: 'Executable not found, using mock data' };
    }

    const { tmpDir, cfgPath } = writeTempConfigFile(buildConfigFromOptions(options));
    const posePipeName = buildPipeName('iris_pose', sessionId);
    const videoPipeName = buildPipeName('iris_video', sessionId);
    const videoStreamer = new VideoStreamer();
    let pipeServer = null;

    try {
      pipeServer = await createPipeServer({
        pipeName: posePipeName,
        onFrame,
      });

      const wsPort = await videoStreamer.start(videoPipeName);
      const args = [
        'monitor',
        '--shm-name', 'iris_shm_ipc',
        '--pipe', posePipeName,
        '--video-pipe', videoPipeName,
        '--fps', '30',
      ];

      return this.spawnWorker({
        sessionId,
        args,
        cfgPath,
        tmpDir,
        pipeServer,
        videoStreamer,
        wsUrl: `ws://127.0.0.1:${wsPort}`,
        onStdout: (data) => onCliOutput({ channel: 'stdout', line: data.toString() }),
      });
    } catch (err) {
      console.error('Failed to start stream servers', err);
      if (pipeServer) {
        pipeServer.close();
      }
      await videoStreamer.stop();
      if (fs.existsSync(tmpDir)) {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup.
        }
      }
      return { ok: false, error: 'Stream servers failed to start' };
    }
  }

  async startFull({ sessionId, options, onMockData, onFrame, onCliOutput }) {
    // Guard against rapid stop→start cycles that cause Windows camera driver lockouts
    if (this._lastStopTimestamp) {
      const elapsed = Date.now() - this._lastStopTimestamp;
      if (elapsed < 500) {
        await new Promise((r) => setTimeout(r, 500 - elapsed));
      }
    }

    if (!this.hasExecutable()) {
      onMockData();
      return { ok: false, error: 'Executable not found, using mock data' };
    }

    const { tmpDir, cfgPath } = writeTempConfigFile(buildConfigFromOptions(options));
    const posePipeName = buildPipeName('iris_pose', sessionId);
    const videoPipeName = buildPipeName('iris_video', sessionId);

    const engineSessionId = `${sessionId}_engine`;
    const monitorSessionId = `${sessionId}_monitor`;

    // 1. Spawn the Engine (producer)
    const engineResult = this.spawnWorker({
      sessionId: engineSessionId,
      args: ['run', cfgPath],
      cfgPath,
      tmpDir,
      onStdout: (data) => onCliOutput({ channel: 'engine', line: data.toString() }),
    });

    if (!engineResult.ok) {
      return engineResult;
    }

    // 2. Spawn the Monitor (consumer) — it waits for SHM automatically
    const videoStreamer = new VideoStreamer();
    let pipeServer = null;

    try {
      pipeServer = await createPipeServer({
        pipeName: posePipeName,
        onFrame,
      });

      const wsPort = await videoStreamer.start(videoPipeName);

      const monitorResult = this.spawnWorker({
        sessionId: monitorSessionId,
        args: [
          'monitor',
          '--shm-name', 'iris_shm_ipc',
          '--pipe', posePipeName,
          '--video-pipe', videoPipeName,
          '--fps', '30',
        ],
        cfgPath,
        tmpDir: null,
        pipeServer,
        videoStreamer,
        wsUrl: `ws://127.0.0.1:${wsPort}`,
        onStdout: (data) => onCliOutput({ channel: 'monitor', line: data.toString() }),
      });

      // Link lifecycle: if engine dies, kill monitor
      const engineEntry = this.workers.get(engineSessionId);
      if (engineEntry) {
        engineEntry.child.once('exit', () => {
          console.log(`[iris:${engineSessionId}] engine exited, stopping monitor`);
          this.stop(monitorSessionId).catch(() => {});
        });
      }

      return {
        ...monitorResult,
        engineSessionId,
        monitorSessionId,
        baseSessionId: sessionId,
      };
    } catch (err) {
      console.error('Failed to start full pipeline', err);
      await this.stop(engineSessionId).catch(() => {});
      if (pipeServer) {
        pipeServer.close();
      }
      await videoStreamer.stop();
      return { ok: false, error: err.message };
    }
  }

  async stopFull(baseSessionId) {
    const engineId = `${baseSessionId}_engine`;
    const monitorId = `${baseSessionId}_monitor`;

    const results = await Promise.allSettled([
      this.workers.has(monitorId) ? this.stop(monitorId) : Promise.resolve({ ok: true }),
      this.workers.has(engineId) ? this.stop(engineId) : Promise.resolve({ ok: true }),
    ]);

    this._lastStopTimestamp = Date.now();
    console.log(`[ProcessManager] stopFull(${baseSessionId}) complete`);
    return { ok: true, baseSessionId, results: results.map((r) => r.value || r.reason) };
  }

  async stopAll() {
    const sessionIds = [...this.workers.keys()];
    console.log(`[ProcessManager] stopAll — killing ${sessionIds.length} workers`);
    await Promise.allSettled(sessionIds.map((id) => this.stop(id)));
  }

  resolveSessionId(requestedSessionId) {
    const sessionId = requestedSessionId == null ? '' : String(requestedSessionId);

    if (this.workers.has(sessionId)) {
      return sessionId;
    }

    if (this.workers.size === 1) {
      return this.workers.keys().next().value;
    }

    return null;
  }

  async stop(requestedSessionId) {
    const sessionId = this.resolveSessionId(requestedSessionId);
    if (!sessionId) {
      return { ok: false, error: 'not_found' };
    }

    const entry = this.workers.get(sessionId);
    if (!entry) {
      return { ok: false, error: 'not_found' };
    }

    console.log(`[iris:${sessionId}] stop requested`);
    const { child } = entry;

    if (child.stdin && !child.stdin.destroyed && !child.stdin.writableEnded) {
      try {
        child.stdin.write('\n');
        child.stdin.end();
      } catch (err) {
        console.error(`[iris:${sessionId}] failed to write to stdin`, err);
        this.killProcessTree(sessionId).catch((killErr) => {
          console.error(`[iris:${sessionId}] force kill failed`, killErr);
        });
      }
    } else {
      this.killProcessTree(sessionId).catch((killErr) => {
        console.error(`[iris:${sessionId}] force kill failed`, killErr);
      });
    }

    setTimeout(() => {
      if (this.workers.has(sessionId)) {
        console.warn(`[iris:${sessionId}] process didn't exit gracefully, force killing...`);
        this.killProcessTree(sessionId).catch((killErr) => {
          console.error(`[iris:${sessionId}] delayed force kill failed`, killErr);
        });
      }
    }, 10000);

    this._lastStopTimestamp = Date.now();
    return { ok: true, sessionId };
  }

  async killProcessTree(sessionId) {
    const entry = this.workers.get(sessionId);
    if (!entry) {
      return false;
    }

    const { child } = entry;
    const exitPromise = waitForChildExit(child);

    try {
      child.kill('SIGTERM');
    } catch {
      // Ignore missing process errors.
    }

    if (process.platform === 'win32' && child.pid) {
      try {
        await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      } catch {
        // Ignore failures from already-exited processes.
      }

      await exitPromise;
      return true;
    }

    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Best-effort process-group termination.
      }
    }

    await exitPromise;

    try {
      child.kill('SIGKILL');
    } catch {
      // Ignore missing process errors.
    }

    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Best-effort process-group termination.
      }
    }

    return true;
  }

  spawnWorker({ sessionId, args, cfgPath, tmpDir, onStdout, pipeServer = null, videoStreamer = null, wsUrl = null }) {
    const exePath = this.getExecutablePath();

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

      child.stdout.on('data', (data) => onStdout(data));
      child.stderr.on('data', (data) => console.log(`[iris:${sessionId}] stderr: ${data.toString().trim()}`));
      child.on('error', (err) => console.error(`[iris:${sessionId}] PROCESS ERROR`, err));

      this.workers.set(sessionId, { child, tmpDir, cfgPath, pipeServer, videoStreamer, wsUrl });

      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) {
          return;
        }

        cleanedUp = true;
        const currentEntry = this.workers.get(sessionId);
        if (!currentEntry) {
          return;
        }

        console.log(`[iris:${sessionId}] cleanup triggered`);
        if (currentEntry.pipeServer) {
          currentEntry.pipeServer.close(() => console.log(`[iris:${sessionId}] pipe server closed`));
        }
        if (currentEntry.videoStreamer) {
          void currentEntry.videoStreamer.stop();
        }

        if (currentEntry.tmpDir && fs.existsSync(currentEntry.tmpDir)) {
          try {
            fs.rmSync(currentEntry.tmpDir, { recursive: true, force: true });
          } catch {
            // Best-effort cleanup.
          }
        }

        this.workers.delete(sessionId);
      };

      child.once('exit', (code, signal) => {
        console.log(`[iris:${sessionId}] EXIT code=${code} signal=${signal}`);
        cleanup();
      });

      child.once('close', (code, signal) => {
        console.log(`[iris:${sessionId}] CLOSE code=${code} signal=${signal}`);
        cleanup();
      });

      return { ok: true, sessionId, configPath: cfgPath, pipeStarted: Boolean(pipeServer), wsUrl };
    } catch (error) {
      console.error('Failed to start IRIS process:', error);
      if (pipeServer) {
        pipeServer.close();
      }
      if (videoStreamer) {
        void videoStreamer.stop();
      }
      return { ok: false, error: error.message };
    }
  }
}

module.exports = { ProcessManager };
