const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'IRIS Starter',
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

