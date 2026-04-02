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

function resolveOutputDir(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  const irisCliDir = path.dirname(getIrisCliPath());
  return path.join(irisCliDir, 'output', 'triangulation_da3_startup');
}

function resolveProjectDirectory(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    return null;
  }

  return path.dirname(projectPath.trim());
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

  ipcMain.handle('stop-iris', (_event, sessionId) => processManager.stop(sessionId));

  ipcMain.handle('get-hardware-cameras', async () => {
    const irisCliPath = getIrisCliPath();

    if (!fs.existsSync(irisCliPath)) {
      return { ok: false, error: 'IRIS executable not found.' };
    }

    return new Promise((resolve) => {
      execFile(irisCliPath, ['show-cameras'], { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          console.error('[iris_cli] show-cameras error:', stderr || error.message);
          resolve({ ok: false, error: stderr || error.message });
          return;
        }

        const cameras = [];
        const regex = /\[(\d+)\]\s+(.+)/g;
        let match;

        while ((match = regex.exec(stdout)) !== null) {
          cameras.push({
            id: parseInt(match[1], 10),
            name: match[2].trim(),
          });
        }

        resolve({ ok: true, data: cameras });
      });
    });
  });
 
  ipcMain.handle('get-extrinsics', async (_event, outputDirArg) => {
    const outputDir = resolveOutputDir(outputDirArg);

    const extrinsicsPath = path.join(outputDir, 'extrinsics.json');
    const camerasPath = path.join(outputDir, 'cameras.json');

    const targetPath = fs.existsSync(extrinsicsPath)
      ? extrinsicsPath
      : fs.existsSync(camerasPath)
        ? camerasPath
        : null;

    if (!targetPath) {
      return null;
    }

    try {
      const rawData = fs.readFileSync(targetPath, 'utf8');
      return JSON.parse(rawData);
    } catch (error) {
      console.warn('[iris] Failed to read extrinsics from', targetPath, error);
      return null;
    }
  });

  ipcMain.handle('get-scene', async (_event, outputDirArg) => {
    const outputDir = resolveOutputDir(outputDirArg);
    const scenePath = path.join(outputDir, 'scene.ply');

    if (!fs.existsSync(scenePath)) {
      return null;
    }

    try { 
      fs.accessSync(scenePath, fs.constants.R_OK);
      return `file:///${scenePath.replace(/\\/g, '/')}`;
    } catch (error) {
      console.warn('[iris] Failed to resolve scene file at', scenePath, error);
      return null;
    }
  });

  ipcMain.handle('start-iris-record', async (event, options = {}) => {
    const targetWindow = getTargetWindow(event);
    const projectDir = resolveProjectDirectory(options.projectPath);

    if (!projectDir) {
      return { ok: false, error: 'A saved project path is required to start recording.' };
    }

    return monitorManager.start({
      outputDir: projectDir,
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
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
