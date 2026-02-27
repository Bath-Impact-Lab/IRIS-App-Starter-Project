const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require('electron');
const { registerIrisIpc } = require('./iris');
const { MOCK_EXTRINSICS } = require('./mockExtrinsics');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
let mockTimer = null;

function startIrisMockProcess() {
  const runtimeExists = fs.existsSync(
    path.join(__dirname, '..', 'iris_runtime_bundle', 'exe file')
  );
  if (runtimeExists) return;

  const positionsPath = path.join(__dirname, '..', 'public', 'assets', 'position 2.json');
  if (!fs.existsSync(positionsPath)) {
    console.warn('[mock] position 2.json not found, skipping mock process');
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
            nodeIntegration: false
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

    // Serve the IRIS extrinsics calibration file.
    // - If the mock stream is active (no real runtime), return the mock extrinsics.
    // - If a real runtime exists, read the live extrinsics file.
    // - The frontend should clear mock camera gizmos when real cameras connect.
    ipcMain.handle('get-extrinsics', () => {
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

    createWindow();
    startIrisMockProcess();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
    if (process.platform !== 'darwin') app.quit();
});
