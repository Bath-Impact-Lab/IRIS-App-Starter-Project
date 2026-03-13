const { app, BrowserWindow, ipcMain, nativeTheme, shell, dialog } = require('electron');
const { registerIrisIpc, IRIS_CLI_EXE } = require('./iris');
const { MOCK_EXTRINSICS } = require('./mockExtrinsics');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile, exec } = require('child_process')


let mainWindow;
let mockTimer = null;

function startIrisMockProcess() {
  const runtimeExists = fs.existsSync(
    path.join(__dirname, '..', 'iris_runtime_bundle', 'exe file')
  );
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

// Check whether iris_cli.exe is present on disk
ipcMain.handle('check-iris-cli', () => {
    const found = fs.existsSync(IRIS_CLI_EXE);
    console.log(`[iris-cli] check: ${found ? 'found' : 'NOT found'} at ${IRIS_CLI_EXE}`);
    return { found, path: IRIS_CLI_EXE };
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

// - If the mock stream is active (no real runtime), return the mock extrinsics.
// - If a real runtime exists, read the live extrinsics file.
// - The frontend should clear mock camera gizmos when real cameras connect.
ipcMain.handle('get-extrinsics', (event) => {
    const runtimeExists = fs.existsSync(
        path.join(__dirname, '..', 'iris_runtime_bundle', 'exe file')
    );

    // Mock mode — return the bundled mock extrinsics
    if (!runtimeExists) {
        console.log('[extrinsics] mock mode — returning mock extrinsics');
        return MOCK_EXTRINSICS;
    }

    // Real runtime — read live calibration file
    const extrinsicsPath = path.join(os.homedir(), 'AppData', 'Local', 'IRIS', 'extrinsics 1.json');
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


// connecting to steamVR/VRchat
ipcMain.handle('connect-VR', (event) => {
    //file path of connector
    const irisToVr = path.join(__dirname, "..", "IRIStoVRChat", "osc-test.py")
    console.log(irisToVr)
    const args = ["run", irisToVr]
    const child = spawn("uv.exe", args, {
        stdio: ['pipe',  'pipe', 'pipe']
    }) 

    child.stdout.on('data', (d) => {
        console.log(d.toString().trim())
    })

    child.stderr.on('data', (d) => {
        console.log(d.toString().trim())
    })

    ipcMain.handle('update-pos', (event, val) => {
        child.stdin.write(val + "\n")
        // console.log(val)
    })
})