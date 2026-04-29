'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path'); // Ensure path is imported
const { ipcMain } = require('electron');
const { getIrisCliPath } = require('./config');
const { ProcessManager } = require('./processManager');
const { MonitorManager } = require('./monitorManager');
const { getTargetWindow, sendToWindow } = require('./utils');
const { execFile } = require('child_process');

const processManager = new ProcessManager();
const monitorManager = new MonitorManager();

function resolveOutputDir() {
  const irisCliDir = path.dirname(getIrisCliPath());
  return path.join(irisCliDir, 'output', 'triangulation_da3_startup');
}

function registerIrisIpc() {
  ipcMain.handle('start-iris', (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startStandard({
      sessionId,
      options,
      onCliOutput: (payload) => sendToWindow(targetWindow, 'iris-cli-output', payload),
    });
  });

  ipcMain.handle('start-iris-stream', async (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startStream({
      sessionId,
      options,
      onFrame: (frame) => sendToWindow(targetWindow, 'iris-data', frame),
      onCliOutput: (payload) => sendToWindow(targetWindow, 'iris-cli-output', payload),
    });
  });

  ipcMain.handle('start-iris-full', async (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startFull({
      sessionId,
      options,
      onMockData: () => sendMockData(targetWindow),
      onFrame: (frame) => sendToWindow(targetWindow, 'iris-data', frame),
      onCliOutput: (payload) => sendToWindow(targetWindow, 'iris-cli-output', payload),
    });
  });

  ipcMain.handle('stop-iris', (_event, sessionId) => processManager.stop(sessionId));
 
  ipcMain.handle('get-extrinsics', async (_event,) => {
    const outputDir = resolveOutputDir();

    const extrinsicsPath = path.join(outputDir, 'extrinsics.json');

    const targetPath = extrinsicsPath;
    const time = Date.now()

    if (!targetPath) {
      return null;
    }

    try {
      const rawData = fs.readFileSync(targetPath, 'utf8');
      fs.stat(targetPath, (err, stats) => {
        if (time - stats.mtimeMs > 20000) {
          console.log('[iris] Extrinsics is too old, restart and try again.')
          return null
        }
      })
      return JSON.parse(rawData);
    } catch (error) {
      console.warn('[iris] Failed to read extrinsics from', targetPath, error);
      return null;
    }
  });

  ipcMain.handle('get-scene', async (_event,) => {
    const outputDir = resolveOutputDir();
    const scenePath = path.join(outputDir, 'scene.ply');
    const time = Date.now()

    if (!fs.existsSync(scenePath)) {
      return null;
    }

    try { 
      fs.accessSync(scenePath, fs.constants.R_OK);
      fs.stat(scenePath, (err, stats) => {
        if (time - stats.mtimeMs > 20000) {
          console.log('[iris] Scene is too old, restart and try again.')
          return null
        }
      })
      return `file:///${scenePath.replace(/\\/g, '/')}`;
    } catch (error) {
      console.warn('[iris] Failed to resolve scene file at', scenePath, error);
      return null;
    }
  });

  ipcMain.handle('start-iris-record', async (event, options = {}) => {
    const targetWindow = getTargetWindow(event);
    const outputDir = resolveRecordingOutputDir(options.projectPath);

    if (!outputDir) {
      return { ok: false, error: 'A saved project path is required to start recording.' };
    }

    return monitorManager.start({
      outputDir,
      shmName: options.shmName,
      fps: options.fps,
      pipePath: options.pipePath,
      pipeId: options.pipeId,
      savePoses: options.savePoses,
      drawBboxes: options.drawBboxes,
      drawKeypoints: options.drawKeypoints,
      verbose: options.verbose,
      onStdout: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'record:stdout', line: data.toString() }),
      onStderr: (data) => sendToWindow(targetWindow, 'iris-cli-output', { channel: 'record:stderr', line: data.toString() }),
    });
  });

  ipcMain.handle('stop-iris-record', async () => monitorManager.stop());
 
}

module.exports = {
  registerIrisIpc,
  processManager,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
