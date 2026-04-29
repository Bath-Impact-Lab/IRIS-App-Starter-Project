'use strict';

const crypto = require('crypto');
const { ipcMain } = require('electron');
const { getIrisCliPath } = require('./config');
const { ProcessManager } = require('./processManager');
const { CalibrationManager } = require('./calibrationManager');
const { MonitorManager } = require('./monitorManager');
const { getTargetWindow, sendMockData, sendToWindow } = require('./utils');

const processManager = new ProcessManager();
const calibrationManager = new CalibrationManager();
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

  ipcMain.handle('stop-iris-full', (_event, baseSessionId) => processManager.stopFull(baseSessionId));

  ipcMain.handle('cancel-intrinsics', () => calibrationManager.cancelIntrinsics());
  ipcMain.handle('cancel-extrinsics', () => calibrationManager.cancelExtrinsics());

  ipcMain.handle('calculate-intrinsics', (event, index, rotation) => {
    const targetWindow = getTargetWindow(event);

    return calibrationManager.calculateIntrinsics({
      cameraIndex: index,
      rotation,
      onOutput: (line) => sendToWindow(targetWindow, 'iris-cli-output', {
        channel: 'intrinsics',
        cameraIndex: index,
        line,
      }),
      onComplete: (payload) => sendToWindow(targetWindow, 'intrinsics-complete', payload),
    });
  });

  ipcMain.handle('calculate-extrinsics', (event, cameraIndices, rotation) => {
    const targetWindow = getTargetWindow(event);

    return calibrationManager.calculateExtrinsics({
      cameraIndices,
      rotation,
      onOutput: (line) => sendToWindow(targetWindow, 'iris-cli-output', {
        channel: 'extrinsics',
        line,
      }),
      onComplete: (payload) => sendToWindow(targetWindow, 'extrinsics-complete', payload),
    });
  });

  ipcMain.handle('start-monitor', (_event, outputDir) => monitorManager.start(outputDir));
  ipcMain.handle('stop-monitor', () => monitorManager.stop());
}

module.exports = {
  registerIrisIpc,
  processManager,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
