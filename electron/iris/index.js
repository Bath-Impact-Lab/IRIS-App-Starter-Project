'use strict';

const crypto = require('crypto');
const { ipcMain } = require('electron');
const { getIrisCliPath } = require('./config');
const { ProcessManager } = require('./processManager');
const { MonitorManager } = require('./monitorManager');
const { getTargetWindow, sendMockData, sendToWindow } = require('./utils');

const processManager = new ProcessManager();
const monitorManager = new MonitorManager();

function registerIrisIpc() {
  ipcMain.handle('start-iris', (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startStandard({
      sessionId,
      options,
      onMockData: () => sendMockData(targetWindow),
      onData: (data) => sendToWindow(targetWindow, 'iris-data', data),
    });
  });

  ipcMain.handle('start-iris-stream', async (event, options) => {
    const sessionId = crypto.randomUUID();
    const targetWindow = getTargetWindow(event);

    return processManager.startStream({
      sessionId,
      options,
      onMockData: () => sendMockData(targetWindow),
      onFrame: (frame) => sendToWindow(targetWindow, 'iris-data', frame),
      onCliOutput: (payload) => sendToWindow(targetWindow, 'iris-cli-output', payload),
    });
  });

  ipcMain.handle('stop-iris', (_event, sessionId) => processManager.stop(sessionId));
}

module.exports = {
  registerIrisIpc,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
