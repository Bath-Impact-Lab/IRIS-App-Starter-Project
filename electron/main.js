
const dotenv = require('dotenv');

const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog } = require('electron');
const { registerIrisIpc, getIrisCliPath } = require('./iris');
const { MOCK_EXTRINSICS } = require('./mockExtrinsics');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile, exec } = require('child_process')

dotenv.config({ path: path.join(__dirname, '..', '.env') });

let mainWindow;
let mockTimer = null;
const PROJECT_DIRECTORY_NAME = 'ReCapture Projects';
const PROJECT_EXTENSION = 'recapture.json';

function startIrisMockProcess() {
    const runtimeExists = fs.existsSync(getIrisCliPath());
    if (runtimeExists) return;

    const positionsPath = path.join(__dirname, '..', 'public', 'assets', 'mock-halpe26-stream.json');
    if (!fs.existsSync(positionsPath)) {
        console.warn('[mock] mock-halpe26-stream.json not found, skipping mock process');
        return;
    }

    const positions = JSON.parse(fs.readFileSync(positionsPath, 'utf8'));
    if (!Array.isArray(positions) || positions.length === 0) return;

    console.log(`[mock] starting mock pose stream (${positions.length} frames @ 30fps)`);

    let frame = 0;
    mockTimer = setInterval(() => {
        const win = mainWindow || BrowserWindow.getFocusedWindow();
        if (!win || win.isDestroyed()) return;
        win.webContents.send('iris-data', positions[frame]);
        frame = (frame + 1) % positions.length;
    }, 1000 / 30);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        frame: false,
        autoHideMenuBar: true,
        title: process.env.VITE_APP_TITLE || 'IRIS Starter',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#111418' : '#ffffff',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        }
    });

    const devServer = process.env.VITE_DEV_SERVER_URL;
    if (devServer) {
        mainWindow.loadURL(devServer);
        if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    } else {
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const sendWindowState = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('window-state', {
            isMaximized: mainWindow.isMaximized(),
        });
    };

    mainWindow.on('maximize', sendWindowState);
    mainWindow.on('unmaximize', sendWindowState);
    mainWindow.on('enter-full-screen', sendWindowState);
    mainWindow.on('leave-full-screen', sendWindowState);
    mainWindow.once('ready-to-show', sendWindowState);
}

app.whenReady().then(() => {

    registerIrisIpc();

    createWindow();
    // startIrisMockProcess();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-external', async (event, url) => {
    console.log('[Main] Received open-external request for:', url);
    try {
        console.log('[Main] Calling shell.openExternal...');
        await shell.openExternal(url);
        console.log('[Main] shell.openExternal call completed successfully.');
        return { ok: true };
    } catch (e) {
        console.error('[Main] shell.openExternal failed:', e);
        return { ok: false, error: e.message };
    }
});

function getEventWindow(event) {
    return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

ipcMain.handle('window-minimize', (event) => {
    const win = getEventWindow(event);
    if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.handle('window-toggle-maximize', (event) => {
    const win = getEventWindow(event);
    if (!win || win.isDestroyed()) return { isMaximized: false };

    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }

    return { isMaximized: win.isMaximized() };
});

ipcMain.handle('window-close', (event) => {
    const win = getEventWindow(event);
    if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('window-is-maximized', (event) => {
    const win = getEventWindow(event);
    return { isMaximized: !!win && !win.isDestroyed() && win.isMaximized() };
});

// Check whether iris_cli.exe is present on disk
ipcMain.handle('check-iris-cli', () => {
    const irisCliPath = getIrisCliPath();
    const found = fs.existsSync(irisCliPath);
    console.log(`[iris-cli] check: ${found ? 'found' : 'NOT found'} at ${irisCliPath}`);
    return { found, path: irisCliPath };
});

// ── Filesystem recordings ────────────────────────────────────────────────────

function getDefaultProjectsDir() {
    const documentsDir = app.getPath('documents');
    const projectsDir = path.join(documentsDir, PROJECT_DIRECTORY_NAME);
    if (!fs.existsSync(projectsDir)) {
        fs.mkdirSync(projectsDir, { recursive: true });
    }
    return projectsDir;
}

function ensureProjectPayload(projectData = {}, filePath = null, options = {}) {
    const touch = options.touch ?? false;
    const now = new Date().toISOString();
    const fallbackName = filePath
        ? path.basename(filePath).replace(/\.json$/i, '').replace(/\.recapture$/i, '')
        : 'Untitled Project';
    const participants = Array.isArray(projectData.participants) && projectData.participants.length > 0
        ? projectData.participants.map((participant, index) => ({
            id: participant?.id || `participant-${index + 1}`,
            name: typeof participant?.name === 'string' && participant.name.trim()
                ? participant.name.trim()
                : `Participant ${index + 1}`,
            sessions: Array.isArray(participant?.sessions)
                ? participant.sessions.map((session, sessionIndex) => ({
                    id: session?.id || `participant-${index + 1}-session-${sessionIndex + 1}`,
                    date: typeof session?.date === 'string' && session.date.trim()
                        ? session.date.trim()
                        : 'Untitled Session',
                    exercises: Array.isArray(session?.exercises)
                        ? session.exercises.filter((value) => typeof value === 'string')
                        : [],
                }))
                : [],
        }))
        : [{
            id: 'participant-1',
            name: 'Participant 1',
            sessions: [],
        }];

    return {
        format: 'recapture-project',
        version: 1,
        id: projectData.id || `project-${Date.now()}`,
        name: typeof projectData.name === 'string' && projectData.name.trim() ? projectData.name.trim() : fallbackName,
        createdAt: projectData.createdAt || now,
        updatedAt: touch ? now : (projectData.updatedAt || projectData.createdAt || now),
        settings: {
            theme: projectData.settings?.theme === 'dark' ? 'dark' : 'light',
            recordingsDir: projectData.settings?.recordingsDir ?? null,
        },
        workspace: {
            activeView: ['capture', 'mocap', 'analysis'].includes(projectData.workspace?.activeView)
                ? projectData.workspace.activeView
                : 'capture',
            selectedCameraIds: Array.isArray(projectData.workspace?.selectedCameraIds)
                ? projectData.workspace.selectedCameraIds.filter((value) => typeof value === 'string')
                : [],
            selectedRecordingPath: projectData.workspace?.selectedRecordingPath ?? null,
            resolution: projectData.workspace?.resolution || '1920x1080',
            fps: typeof projectData.workspace?.fps === 'number' ? projectData.workspace.fps : 30,
            personCount: projectData.workspace?.personCount ?? 'Single Person',
            outputOption: projectData.workspace?.outputOption || 'Filesystem',
        },
        participants,
    };
}

ipcMain.handle('project-create', async (event, projectData) => {
    const defaultDir = getDefaultProjectsDir();
    const defaultName = (projectData?.name || 'Untitled Project').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Untitled Project';
    const result = await dialog.showSaveDialog(getEventWindow(event), {
        title: 'Create Project',
        defaultPath: path.join(defaultDir, `${defaultName}.${PROJECT_EXTENSION}`),
        filters: [{ name: 'ReCapture Project', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
    }

    try {
        const payload = ensureProjectPayload(projectData, result.filePath, { touch: true });
        fs.mkdirSync(path.dirname(result.filePath), { recursive: true });
        fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
        return { ok: true, path: result.filePath, project: payload };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('project-open', async (event, filePath) => {
    let targetPath = filePath;

    if (!targetPath) {
        const result = await dialog.showOpenDialog(getEventWindow(event), {
            title: 'Open Project',
            properties: ['openFile'],
            defaultPath: getDefaultProjectsDir(),
            filters: [{ name: 'ReCapture Project', extensions: ['json'] }],
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { ok: false, canceled: true };
        }

        targetPath = result.filePaths[0];
    }

    try {
        const raw = fs.readFileSync(targetPath, 'utf8');
        const parsed = JSON.parse(raw);
        const payload = ensureProjectPayload(parsed, targetPath);
        return { ok: true, path: targetPath, project: payload };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

ipcMain.handle('project-save', async (event, filePath, projectData) => {
    if (!filePath) {
        return { ok: false, error: 'Cannot save project without a file path.' };
    }

    try {
        const payload = ensureProjectPayload(projectData, filePath, { touch: true });
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
        return { ok: true, path: filePath, project: payload };
    } catch (error) {
        return { ok: false, error: error.message };
    }
});

// Return (and create if needed) the default recordings dir: Videos\IRIS
ipcMain.handle('fs-get-default-recordings-dir', () => {
    const videosDir = app.getPath('videos');
    const irisDir = path.join(videosDir, 'IRIS');
    try {
        if (!fs.existsSync(irisDir)) {
            fs.mkdirSync(irisDir, { recursive: true });
            console.log('[recordings] created default recordings dir:', irisDir);
        } else {
            console.log('[recordings] using existing recordings dir:', irisDir);
        }
    } catch (err) {
        console.error('[recordings] failed to create recordings dir:', err);
    }
    return irisDir;
});
ipcMain.handle('fs-pick-recordings-dir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Recordings Folder',
        properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// List sub-folders (recordings) inside the chosen root dir
ipcMain.handle('fs-list-recordings', async (event, rootDir) => {
    if (!rootDir) return [];
    try {
        const entries = fs.readdirSync(rootDir, { withFileTypes: true });
        return entries
            .filter(e => e.isDirectory())
            .map(e => ({ name: e.name, path: path.join(rootDir, e.name) }))
            .sort((a, b) => b.name.localeCompare(a.name)); // newest first
    } catch {
        return [];
    }
});

// Open a recording folder in the OS file explorer
ipcMain.handle('fs-open-recording', async (event, folderPath) => {
    await shell.openPath(folderPath);
});

// Read position.json + enumerate video files for a recording folder
ipcMain.handle('fs-get-recording-data', async (event, recordingPath) => {
    const posPath = path.join(recordingPath, 'position.json');
    let positions = [];
    try {
        if (fs.existsSync(posPath)) {
            const raw = fs.readFileSync(posPath, 'utf8');
            positions = JSON.parse(raw);
        }
    } catch (err) {
        console.error('[recording] failed to read position.json:', err);
    }

    let videoFiles = [];
    try {
        const entries = fs.readdirSync(recordingPath);
        videoFiles = entries
            .filter(f => /\.(webm|mp4|mkv|avi|mov)$/i.test(f))
            .map((f, i) => ({
                index: i,
                name: f,
                path: path.join(recordingPath, f),
            }));
    } catch (err) {
        console.error('[recording] failed to list video files:', err);
    }

    return { positions, videoFiles };
});

// Return a file:// URL the renderer can load as a video src.
// webSecurity is disabled so the renderer can access local files directly.
ipcMain.handle('fs-get-video-url', async (event, filePath) => {
    return 'file:///' + filePath.replace(/\\/g, '/');
});

// Rename a recording folder
ipcMain.handle('fs-rename-recording', async (event, oldPath, newName) => {
    try {
        const parent = path.dirname(oldPath);
        const newPath = path.join(parent, newName);
        if (fs.existsSync(newPath)) return { ok: false, error: 'A recording with that name already exists.' };
        fs.renameSync(oldPath, newPath);
        return { ok: true, newPath };
    } catch (err) {
        return { ok: false, error: err.message };
    }
});

// - If the mock stream is active (no real runtime), return the mock extrinsics.
// - If a real runtime exists, read the live extrinsics file.
// - The frontend should clear mock camera gizmos when real cameras connect.
ipcMain.handle('get-extrinsics', (event) => {
    const runtimeExists = fs.existsSync(getIrisCliPath());

    // Mock mode — return the bundled mock extrinsics
    if (!runtimeExists) {
        console.log('[extrinsics] mock mode — returning mock extrinsics');
        return MOCK_EXTRINSICS;
    }

    // Real runtime — read live calibration file
    const extrinsicsPath = path.join(os.homedir(), 'AppData', 'Local', 'IRIS', 'calibration_output', 'extrinsics.json');
    try {
        if (!fs.existsSync(extrinsicsPath)) {
            console.warn(`[extrinsics] file not found: ${extrinsicsPath}`);
            return null;
        }
        const raw = fs.readFileSync(extrinsicsPath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('[extrinsics] failed to read:', err);
        return null;
    }
});

ipcMain.handle('get-scene', (event) => {
    const runtimeExists = fs.existsSync(getIrisCliPath());

    // Mock mode — return the bundled mock extrinsics
    if (!runtimeExists) {
        console.log('[extrinsics] mock mode — returning mock extrinsics');
        return MOCK_EXTRINSICS;
    }

    // Real runtime — read live calibration file
    const extrinsicsPath = path.join(os.homedir(), 'AppData', 'Local', 'IRIS', 'calibration_output', 'scene.ply');
    try {
        if (!fs.existsSync(extrinsicsPath)) {
            console.warn(`[extrinsics] file not found: ${extrinsicsPath}`);
            return null;
        }
        return extrinsicsPath;
    } catch (err) {
        console.error('[extrinsics] failed to read:', err);
        return null;
    }
})

// connecting to steamVR/VRchat
ipcMain.handle('connect-VR', (event) => {
    //file path of connector
    const irisToVr = path.join(__dirname, "..", "IRIStoVRChat", "rust.exe")
    console.log(irisToVr)
    const child = spawn(irisToVr, {
        stdio: ['pipe', 'pipe', 'pipe']
    })

    child.stdout.on('data', (d) => {
        console.log(d.toString().trim())
    })

    child.stderr.on('data', (d) => {
        console.log(d.toString().trim())
    })

    ipcMain.handle('update-pos', (event, val) => {
        child.stdin.write(val + "\n")
    })

    ipcMain.handle('disconnect-VR', (event) => {

        child.stdin.write("stop" + "\n")
    })
})
