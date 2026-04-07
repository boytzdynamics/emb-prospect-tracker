const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal:  (url) => ipcRenderer.send('open-external', url),
  platform:      process.platform,
  settingsLoad:  ()  => ipcRenderer.invoke('settings-load'),
  settingsSave:  (s) => ipcRenderer.invoke('settings-save', s),
  settingsPath:  ()  => ipcRenderer.invoke('settings-path'),
  gmailFetch:    (opts) => ipcRenderer.invoke('gmail-fetch', opts),
  getAppVersion: ()  => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_, data) => callback(data))
})
