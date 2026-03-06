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
  fsGetDefaultRecordingsDir: () => ipcRenderer.invoke('fs-get-default-recordings-dir'),
  fsPickRecordingsDir: () => ipcRenderer.invoke('fs-pick-recordings-dir'),
  fsListRecordings: (rootDir) => ipcRenderer.invoke('fs-list-recordings', rootDir),
  fsOpenRecording: (folderPath) => ipcRenderer.invoke('fs-open-recording', folderPath),
})

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: async (url) => ipcRenderer.invoke('open-external', url),
})
