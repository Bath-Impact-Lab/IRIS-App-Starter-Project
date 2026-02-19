const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  resolveAsset: async (relPath) => ipcRenderer.invoke('resolve-asset', relPath),
  readAsset: async (relPath) => ipcRenderer.invoke('read-asset', relPath),
  irisSend: async (msg) => ipcRenderer.invoke('iris-send', msg),
  irisRestart: async () => ipcRenderer.invoke('iris-restart'),
  openExternal: async (url) => ipcRenderer.invoke('open-external', url),
  irisSubscribe: (cb) => {
    try {
      ipcRenderer.send('iris-subscribe');
      const handler = (_event, data) => cb(data);
      ipcRenderer.on('iris-message', handler);
      return () => ipcRenderer.removeListener('iris-message', handler);
    } catch { return () => { }; }
  }
});
