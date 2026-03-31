'use strict';

const { BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getTargetWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
}

function sendToWindow(targetWindow, channel, payload) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return false;
  }

  targetWindow.webContents.send(channel, payload);
  return true;
}

function writeTempConfigFile(configObj) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-'));
  const cfgPath = path.join(tmpDir, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(configObj, null, 2), { encoding: 'utf8' });
  return { tmpDir, cfgPath };
}

function sendMockData(targetWindow) {
  try {
    const positionsPath = path.join(__dirname, '..', '..', 'public', 'assets', 'mock-halpe26-stream.json');
    const positions = JSON.parse(fs.readFileSync(positionsPath, 'utf8'));
    sendToWindow(targetWindow, 'iris-data', positions);
  } catch (err) {
    console.error('Failed to load mock data:', err);
  }
}

module.exports = {
  getTargetWindow,
  sendMockData,
  sendToWindow,
  writeTempConfigFile,
};
