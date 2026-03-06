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
  calculateIntrinsics: (index, rotation) => ipcRenderer.invoke('calculate-intrinsics', index, rotation),
  intrinsicsComplete: (callback) => {
    ipcRenderer.on('intrinsics-complete', (event, data) => {
      callback(data)
    })
  }
})

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: async (url) => ipcRenderer.invoke('open-external', url),
})
