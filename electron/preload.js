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
  cancelIntrinsics: () => ipcRenderer.invoke('cancel-intrinsics'),
  intrinsicsComplete: (callback) => {
    ipcRenderer.on('intrinsics-complete', (event, data) => {
      callback(data)
    })
  },
  calculateExtrinsics: (cameraIndices) => ipcRenderer.invoke('calculate-extrinsics', cameraIndices),
  cancelExtrinsics: () => ipcRenderer.invoke('cancel-extrinsics'),
  extrinsicsComplete: (callback) => {
    ipcRenderer.on('extrinsics-complete', (event, data) => {
      callback(data)
    })
  },
  onIrisCliOutput: (callback) => {
    ipcRenderer.on('iris-cli-output', (event, data) => {
      callback(data)
    })
  },
  startMonitor: (outputDir) => ipcRenderer.invoke('start-monitor', outputDir),
  stopMonitor: () => ipcRenderer.invoke('stop-monitor'),
  checkIrisCli: () => ipcRenderer.invoke('check-iris-cli'),
  fsGetDefaultRecordingsDir: () => ipcRenderer.invoke('fs-get-default-recordings-dir'),
  fsPickRecordingsDir: () => ipcRenderer.invoke('fs-pick-recordings-dir'),
  fsListRecordings: (rootDir) => ipcRenderer.invoke('fs-list-recordings', rootDir),
  fsOpenRecording: (folderPath) => ipcRenderer.invoke('fs-open-recording', folderPath),
  fsRenameRecording: (oldPath, newName) => ipcRenderer.invoke('fs-rename-recording', oldPath, newName),
  fsGetRecordingData: (recordingPath) => ipcRenderer.invoke('fs-get-recording-data', recordingPath),
  fsGetVideoUrl: (filePath) => ipcRenderer.invoke('fs-get-video-url', filePath),
})

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: async (url) => ipcRenderer.invoke('open-external', url),
})
