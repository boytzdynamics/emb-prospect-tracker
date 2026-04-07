const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal:  (url) => ipcRenderer.send('open-external', url),
  platform:      process.platform,
  settingsLoad:  ()  => ipcRenderer.invoke('settings-load'),
  settingsSave:  (s) => ipcRenderer.invoke('settings-save', s),
  settingsPath:  ()  => ipcRenderer.invoke('settings-path'),
  gmailFetch:    (opts) => ipcRenderer.invoke('gmail-fetch', opts)
})
