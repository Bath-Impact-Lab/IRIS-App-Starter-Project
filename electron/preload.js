const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
  startIRIS: (options) => ipcRenderer.invoke('start-iris', options),
  getExtrinsics: () => ipcRenderer.invoke('get-extrinsics'),
  stopIRIS: (Id) => ipcRenderer.invoke('stop-iris', Id),
  onIrisData: (callback) => {
    ipcRenderer.on('iris-data', (event, data,) => {
      callback(data)
    })
  },
  calculateIntrinsics: (device_id, rotation) => ipcRenderer.invoke('calculate-intrinsics', device_id, rotation),
})

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: async (url) => ipcRenderer.invoke('open-external', url),
})
