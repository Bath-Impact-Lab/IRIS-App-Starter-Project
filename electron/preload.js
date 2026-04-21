const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipc', {
  startIRIS: (options) => ipcRenderer.invoke('start-iris', options),
  startIRISStream: (options) => ipcRenderer.invoke('start-iris-stream', options),
  getExtrinsics: () => ipcRenderer.invoke('get-extrinsics'),
  getScene: () => ipcRenderer.invoke('get-scene'),
  stopIRIS: (Id) => ipcRenderer.invoke('stop-iris', Id),
  startIrisRecord: (options) => ipcRenderer.invoke('start-iris-record', options),
  stopIrisRecord: () => ipcRenderer.invoke('stop-iris-record'),
  onIrisData: (callback) => {
    ipcRenderer.on('iris-data', (event, data,) => {
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

  connectVR: () => ipcRenderer.invoke('connect-VR'),
  updatePos: (val) => ipcRenderer.invoke('update-pos', val),
  disconnectVR: () => ipcRenderer.invoke('disconnect-VR'),
})

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: async (url) => ipcRenderer.invoke('open-external', url),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('window-state', handler);
    return () => ipcRenderer.removeListener('window-state', handler);
  },
})
