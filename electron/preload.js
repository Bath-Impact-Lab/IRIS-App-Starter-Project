const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  resolveAsset: async (relPath) => ipcRenderer.invoke('resolve-asset', relPath),
  readAsset: async (relPath) => ipcRenderer.invoke('read-asset', relPath)
});
