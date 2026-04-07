const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')

let mainWindow
const settingsPath = path.join(app.getPath('userData'), 'emb-settings.json')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#2B3739',
      symbolColor: '#ffffff',
      height: 32
    },
    backgroundColor: '#d4d8da'
  })
  mainWindow.loadFile('index.html')
  mainWindow.show()
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') { mainWindow.webContents.openDevTools(); event.preventDefault() }
  })
}

app.whenReady().then(() => {
  createWindow()

  // Auto-update (Windows NSIS only)
  if (process.platform === 'win32') {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('update-status', { status: 'available', version: info.version })
    })

    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('update-status', { status: 'downloaded', version: info.version })
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'The update will be installed when you restart the app.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('[Update] Error:', err.message)
    })

    // Check for updates 5 seconds after launch
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err =>
        console.error('[Update] Check failed:', err.message)
      )
    }, 5000)
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

// ── External links
ipcMain.on('open-external', (event, url) => { shell.openExternal(url) })

// ── Settings (file-based, survives reinstalls)
ipcMain.handle('settings-load', () => {
  try {
    if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch(e) { console.error('Settings load error:', e) }
  return null
})
ipcMain.handle('settings-save', (event, settings) => {
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); return true }
  catch(e) { console.error('Settings save error:', e); return false }
})
ipcMain.handle('settings-path', () => settingsPath)
ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates()
    return { version: result?.updateInfo?.version || null }
  } catch (e) {
    console.error('[Update] Manual check failed:', e.message)
    return { error: e.message }
  }
})

// ── Gmail IMAP fetch (Node.js side — has access to imap library)
ipcMain.handle('gmail-fetch', async (event, { email, appPassword, since, searchEmail }) => {
  try {
    const Imap = require('imap')
    const { simpleParser } = require('mailparser')

    const IMAP_TIMEOUT_MS = 30_000 // 30 seconds overall timeout

    const imapPromise = new Promise((resolve, reject) => {
      const messages = []
      const sinceDate = new Date(since)

      const imap = new Imap({
        user: email,
        password: appPassword,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 15000,
        authTimeout: 10000
      })

      imap.once('error', (err) => {
        console.error(`[IMAP] Error for ${email}:`, err.message)
        resolve([]) // Don't crash — just return empty
      })

      imap.once('ready', () => {
        // Fetch from both INBOX (received) and [Gmail]/Sent Mail (sent)
        fetchFolder(imap, 'INBOX', 'received', sinceDate, messages, searchEmail, () => {
          fetchFolder(imap, '[Gmail]/Sent Mail', 'sent', sinceDate, messages, searchEmail, () => {
            fetchFolder(imap, '[Gmail]/Spam', 'received', sinceDate, messages, searchEmail, () => {
              imap.end()
            })
          })
        })
      })

      imap.once('end', () => {
        console.log(`[IMAP] Done ${email}: ${messages.length} messages`)
        resolve(messages)
      })

      imap.connect()
    })

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`IMAP fetch timed out after ${IMAP_TIMEOUT_MS / 1000}s for ${email}`)), IMAP_TIMEOUT_MS)
    })

    return await Promise.race([imapPromise, timeoutPromise])
  } catch(e) {
    console.error('[IMAP] Fatal error:', e.message)
    return []
  }
})

function fetchFolder(imap, folderName, direction, sinceDate, messages, searchEmail, done) {
  imap.openBox(folderName, true, (err, box) => {
    if (err) {
      console.warn(`[IMAP] Could not open ${folderName}:`, err.message)
      return done()
    }

    // If a specific contact email is provided, only fetch mail to/from that address
    const criteria = searchEmail
      ? [['SINCE', sinceDate], ['OR', ['FROM', searchEmail], ['TO', searchEmail]]]
      : [['SINCE', sinceDate]]
    imap.search(criteria, (err, uids) => {
      if (err || !uids || uids.length === 0) return done()

      // Limit to 200 most recent to keep it fast
      const recentUids = uids.slice(-200)
      const fetch = imap.fetch(recentUids, {
        bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)',
        struct: false
      })

      let pending = recentUids.length

      fetch.on('message', (msg) => {
        let headerData = ''
        let attributes = null

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => { headerData += chunk.toString('utf8') })
        })

        msg.once('attributes', (attrs) => { attributes = attrs })

        msg.once('end', () => {
          try {
            const parsed = parseHeaders(headerData)
            const messageId = parsed['message-id']?.replace(/[<>]/g, '').trim()
            if (!messageId) { pending--; if (pending === 0) done(); return }

            const sentAt = parsed['date']
              ? new Date(parsed['date']).toISOString()
              : new Date().toISOString()

            // Build snippet from subject for now (body parsing is too slow for 200 msgs)
            messages.push({
              messageId,
              threadId: messageId, // Gmail threads by message-id for simplicity
              direction,
              from: parsed['from'] || '',
              to:   parsed['to'] || '',
              subject: parsed['subject'] || '(no subject)',
              snippet: `Subject: ${parsed['subject'] || ''}`, // lightweight
              sentAt
            })
          } catch(e) {
            console.warn('[IMAP] Parse error:', e.message)
          }
          pending--
          if (pending === 0) done()
        })
      })

      fetch.once('error', (err) => {
        console.warn(`[IMAP] Fetch error in ${folderName}:`, err.message)
        done()
      })

      fetch.once('end', () => {
        // pending countdown handles done() call
      })
    })
  })
}

function parseHeaders(raw) {
  const headers = {}
  const lines = raw.split(/\r?\n/)
  let currentKey = null
  for (const line of lines) {
    if (/^\s/.test(line) && currentKey) {
      headers[currentKey] += ' ' + line.trim()
    } else {
      const idx = line.indexOf(':')
      if (idx > 0) {
        currentKey = line.substring(0, idx).toLowerCase().trim()
        headers[currentKey] = line.substring(idx + 1).trim()
      }
    }
  }
  return headers
}
