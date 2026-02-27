const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
  startIRIS: (options) => ipcRenderer.invoke('start-iris', options),
  stopIRIS: (Id) => ipcRenderer.invoke('stop-iris', Id),
  getExtrinsics: () => ipcRenderer.invoke('get-extrinsics'),
  onIrisData: (callback) => {
    ipcRenderer.on('iris-data', (event, data,) => {
      callback(data)
    })
  }
})
