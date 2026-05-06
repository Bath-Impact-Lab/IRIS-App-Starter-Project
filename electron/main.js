
const dotenv = require('dotenv');

const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog } = require('electron');

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

app.commandLine.appendSwitch('enable-features', 'WebCodecs,WebCodecsVideoEncoder,WebCodecsVideoDecoder');

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const { registerIrisIpc, getIrisCliPath } = require('./iris');
const { MOCK_EXTRINSICS } = require('./mockExtrinsics');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');
const { spawn, execFile, exec } = require('child_process');
const { buildConfigFromOptions } = require('./iris/config');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

let mainWindow;
let mockTimer = null;

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
        frame: true,
        // autoHideMenuBar: true,
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

const workers = new Map()
// connecting to steamVR/VRchat
ipcMain.handle('connect-VR', (event, outOption) => {
    //file path of connector
    const sessionId =  crypto.randomUUID();
    let irisToVr;
    if (outOption == 'VR Chat') {
        irisToVr = path.join(__dirname, "..", "IRIStoVRChat", "iris-to-vrchat.exe")
    }
    else if (outOption == 'SteamVR') {
        irisToVr = path.join(__dirname, "..", "IRIStoSteamVR", "iris-to-steamvr.exe")
    }
    if (!fs.existsSync(irisToVr)) return
    const child = spawn(irisToVr, {
        stdio: ['pipe', 'pipe', 'pipe']
    })
    workers.set(sessionId, { child })

    child.stdout.on('data', (d) => {
        console.log("[Connector] " + d.toString().trim())
    })

    child.stderr.on('data', (d) => {
        const data = d.toString().trim()
        if (data.includes("panicked")) {
            BrowserWindow.getFocusedWindow().webContents.send("panicked", false)
        } 
        console.log("[Connector] Error: " + data)
    })
    console.log(`[Connector] connected to ${outOption}`)
    return sessionId
})

ipcMain.handle('update-pos', (event, val, sessionId) => {
    const entry = workers.get(sessionId)
    const { child } = entry
    child.stdin.write(val + "\n")
})

ipcMain.handle('disconnect-VR', (event, sessionId) => {
    console.log("[Connector] trying to disconnect")
    const entry = workers.get(sessionId)
    const { child } = entry
    child.stdin.write("stop" + "\n")
    child.kill()
    console.log("[Connector] removing connector")
})

ipcMain.handle("get-config", async (event, opts) => {
    const config = buildConfigFromOptions(opts)
    const savePath = dialog.showOpenDialogSync({title: "Save Config Path", properties: ['openDirectory', 'createDirectory']})[0]
    const fullPath = path.join(savePath, "config.json")
    try {
        fs.writeFileSync(fullPath, JSON.stringify(config))
        console.log("[Config] File saved to " + fullPath)
    }
    catch (error) {
        console.log("[Error] Config file not saved: ", error)
    }

})