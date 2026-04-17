'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path'); // Ensure path is imported
const { dialog, ipcMain } = require('electron');
const { getDa3StartupCalibrationOutputDir, getIrisCliPath } = require('./config');
const { ProcessManager } = require('./processManager');
const { MonitorManager } = require('./monitorManager');
const { getTargetWindow, sendToWindow } = require('./utils');
const { execFile } = require('child_process');

const processManager = new ProcessManager();
const monitorManager = new MonitorManager();
const INVALID_PATH_SEGMENT_RE = /[<>:"/\\|?*\x00-\x1f]/g;
const PROJECT_MOTIONS_DIRECTORY_NAME = 'motions';
const VIDEO_FILE_FILTERS = [
  {
    name: 'Video Files',
    extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'wmv', 'webm', 'mpg', 'mpeg'],
  },
  {
    name: 'All Files',
    extensions: ['*'],
  },
];

function resolveOutputDir(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return getDa3StartupCalibrationOutputDir();
}

function resolveProjectDirectory(projectPath) {
  if (typeof projectPath !== 'string' || projectPath.trim().length === 0) {
    return null;
  }

  return path.dirname(projectPath.trim());
}

function sanitizePathSegment(value, fallback = 'Untitled Project') {
  const cleaned = typeof value === 'string'
    ? value.replace(INVALID_PATH_SEGMENT_RE, ' ').replace(/\s+/g, ' ').trim()
    : '';

  return cleaned || fallback;
}

function getProjectMotionsDir(projectPath) {
  const projectDir = resolveProjectDirectory(projectPath);
  return projectDir ? path.join(projectDir, PROJECT_MOTIONS_DIRECTORY_NAME) : null;
}

function isPathInside(parentPath, childPath) {
  if (!parentPath || !childPath) return false;
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveMotionOutputDir(options = {}) {
  const motionsDir = getProjectMotionsDir(options.projectPath);
  if (!motionsDir) {
    return null;
  }

  const baseName = sanitizePathSegment(options.sessionName, 'Motion');
  return path.join(motionsDir, baseName);
}

function resolveUniqueDestinationPath(directory, fileName) {
  const parsed = path.parse(fileName);
  let candidatePath = path.join(directory, fileName);
  let suffix = 2;

  while (fs.existsSync(candidatePath)) {
    candidatePath = path.join(directory, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  }

  return candidatePath;
}

function copyLatestExtrinsicsToMotionDir(targetDir) {
  if (typeof targetDir !== 'string' || targetDir.trim().length === 0) {
    return false;
  }

  const sourcePath = path.join(getDa3StartupCalibrationOutputDir(), 'extrinsics.json');
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(targetDir, 'extrinsics.json'));
    return true;
  } catch (error) {
    console.warn('[iris] Failed to copy extrinsics into motion directory:', error);
    return false;
  }
}

function clearMotionDirectory(targetDir) {
  if (typeof targetDir !== 'string' || targetDir.trim().length === 0) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    fs.rmSync(path.join(targetDir, entry.name), { recursive: true, force: true });
  }
}

function registerIrisIpc() {
  let activeRecordingOutputDir = null;

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
    const outputDir = resolveMotionOutputDir(options);

    if (!outputDir) {
      return { ok: false, error: 'A saved project path is required to start recording.' };
    }

    try {
      clearMotionDirectory(outputDir);
    } catch (error) {
      return { ok: false, error: error.message };
    }

    const result = await monitorManager.start({
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

    if (result?.ok) {
      activeRecordingOutputDir = outputDir;
      copyLatestExtrinsicsToMotionDir(outputDir);
    }

    return result;
  });

  ipcMain.handle('stop-iris-record', async () => {
    const outputDir = activeRecordingOutputDir;
    activeRecordingOutputDir = null;
    const result = await monitorManager.stop();

    if (result?.ok && outputDir) {
      copyLatestExtrinsicsToMotionDir(outputDir);
      return { ...result, outputDir };
    }

    return result;
  });

  ipcMain.handle('link-recordings', async (event, options = {}) => {
    const targetWindow = getTargetWindow(event);
    const outputDir = resolveMotionOutputDir(options);

    if (!outputDir) {
      return { ok: false, error: 'A saved project path is required to link recordings.' };
    }

    const selection = await dialog.showOpenDialog(targetWindow, {
      title: 'Link Recordings',
      properties: ['openFile', 'multiSelections'],
      filters: VIDEO_FILE_FILTERS,
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    try {
      clearMotionDirectory(outputDir);
      const copiedFiles = [];

      for (const sourcePath of selection.filePaths) {
        const destinationPath = resolveUniqueDestinationPath(outputDir, path.basename(sourcePath));
        await fs.promises.copyFile(sourcePath, destinationPath);
        copiedFiles.push(destinationPath);
      }

      copyLatestExtrinsicsToMotionDir(outputDir);

      return { ok: true, outputDir, copiedFiles };
    } catch (error) {
      console.error('[link-recordings] Failed to import recordings:', error);
      return { ok: false, error: error.message };
    }
  });
 
}

module.exports = {
  registerIrisIpc,
  IRIS_CLI_EXE: getIrisCliPath(),
  getIrisCliPath,
};
