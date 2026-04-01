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

function registerIrisIpc() {
  ipcMain.handle('start-iris', (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startStandard({
      sessionId,
      options, 
      onData: (data) => sendToWindow(targetWindow, 'iris-data', data),
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
 
  ipcMain.handle('get-extrinsics', async () => {
    const irisCliDir = path.dirname(getIrisCliPath());
    const outputDir = path.join(irisCliDir, 'output', 'triangulation_da3_startup');
    
    // DA3 calibration typically writes to extrinsics.json or cameras.json
    const extrinsicsPath = path.join(outputDir, 'extrinsics.json');
    const camerasPath = path.join(outputDir, 'cameras.json');
    
    const targetPath = fs.existsSync(extrinsicsPath) ? extrinsicsPath : 
                       fs.existsSync(camerasPath) ? camerasPath : null;

    if (!targetPath) {
      return { ok: false, error: `Extrinsics file not found in ${outputDir}` };
    }

    try {
      const rawData = fs.readFileSync(targetPath, 'utf8');
      return { ok: true, data: JSON.parse(rawData), path: targetPath };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle('get-scene', async () => {
    const irisCliDir = path.dirname(getIrisCliPath());
    const scenePath = path.join(irisCliDir, 'output', 'triangulation_da3_startup', 'scene.ply');

    if (!fs.existsSync(scenePath)) {
      return { ok: false, error: `scene.ply not found at ${scenePath}` };
    }

    try { 
      const buffer = fs.readFileSync(scenePath);
      return { 
        ok: true, 
        data: buffer, 
        path: scenePath,
        fileUrl: `file:///${scenePath.replace(/\\/g, '/')}`
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
 
}

module.exports = {
  registerIrisIpc,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};