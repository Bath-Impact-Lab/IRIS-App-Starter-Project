'use strict';

const crypto = require('crypto');
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

  ipcMain.handle('get-hardware-cameras', async (event) => {
    const irisCliPath = getIrisCliPath(); // Your existing helper
    
    return new Promise((resolve) => {
        execFile(irisCliPath, ['show-cameras'], (error, stdout, stderr) => {
            if (error) {
                console.error('[iris_cli] show-cameras error:', stderr);
                resolve({ ok: false, error: stderr || error.message });
                return;
            }
             
            const cameras = [];
            const regex = /\[(\d+)\]\s+(.+)/g;
            let match;
            
            while ((match = regex.exec(stdout)) !== null) {
                cameras.push({
                    id: parseInt(match[1], 10),
                    name: match[2].trim()
                });
            }
            
            resolve({ ok: true, data: cameras });
        });
    });
});
}

module.exports = {
  registerIrisIpc,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
