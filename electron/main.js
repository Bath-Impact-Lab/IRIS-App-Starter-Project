const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let irisProc = null; // Mock IRIS child process
let irisReady = false;
let irisSubscribers = new Set();

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
    createWindow();
    startIrisMockProcess();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC for resolving asset path inside packaged app
ipcMain.handle('resolve-asset', (event, relPath) => {
    const dev = !!process.env.VITE_DEV_SERVER_URL;
    if (dev) {
        // In dev, serve from public
        return path.join(process.cwd(), 'public', relPath);
    }
    // In prod, extraResources maps to resources/assets
    return path.join(process.resourcesPath, 'assets', path.basename(relPath));
});

ipcMain.handle('read-asset', async (event, relPath) => {
    const dev = !!process.env.VITE_DEV_SERVER_URL;
    const resolved = dev
        ? path.join(process.cwd(), 'public', relPath)
        : path.join(process.resourcesPath, 'assets', path.basename(relPath));
    return fs.promises.readFile(resolved, 'utf-8');
});

// Start a child process that simulates the IRIS exe (stdin/stdout JSON lines)
function startIrisMockProcess(){
    try {
        const script = path.join(__dirname, 'iris-mock.js');
        // In Electron dev, process.execPath is the Electron binary; run Node mode
        const opts = { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } };
        irisProc = spawn(process.execPath, [script], opts);
        // Fallback: try system 'node' if previous spawn fails quickly
        irisProc.on('error', () => {
            try { irisProc = spawn('node', [script], { stdio: ['pipe','pipe','inherit'] }); } catch {}
        });
        irisReady = true;
        irisProc.stdout.on('data', (buf) => {
            const lines = buf.toString().split(/\r?\n/).filter(Boolean);
            lines.forEach(line => {
                try { const msg = JSON.parse(line); irisSubscribers.forEach(fn => fn(msg)); }
                catch { /* ignore */ }
            });
        });
        irisProc.on('exit', () => { irisReady = false; irisProc = null; });
    } catch (e) {
        irisReady = false;
    }
}

// Allow renderer to send messages to IRIS process
ipcMain.handle('iris-send', async (event, msg) => {
    if (!irisReady || !irisProc) return { ok: false };
    try { irisProc.stdin.write(JSON.stringify(msg) + '\n'); return { ok: true }; }
    catch { return { ok: false }; }
});

// Renderer subscribes to IRIS messages; we return a channel name for events
ipcMain.on('iris-subscribe', (event) => {
    const webContents = event.sender;
    const sendToRenderer = (msg) => {
        try { webContents.send('iris-message', msg); } catch {}
    };
    irisSubscribers.add(sendToRenderer);
    event.returnValue = { ok: true };
    webContents.once('destroyed', () => irisSubscribers.delete(sendToRenderer));
});