const { BrowserWindow, session } = require('electron')
const path = require('path')
const { spoofSession, CHROME_UA } = require('./session-manager')

function openGoogleLogin(win, partition, { clearFirst = false } = {}) {
  return new Promise(async (resolve) => {
    const ses = session.fromPartition(partition)
    spoofSession(ses)

    ses.setPermissionCheckHandler((_, permission) => {
      return !['webauthn', 'midi', 'midiSysex'].includes(permission)
    })
    ses.setPermissionRequestHandler((_, permission, callback) => {
      callback(!['webauthn', 'midi', 'midiSysex', 'pointerLock'].includes(permission))
    })

    // Solo limpiar cookies si el usuario lo pidió explícitamente (botón "Limpiar sesión")
    if (clearFirst) {
      const googleUrls = ['https://accounts.google.com', 'https://mail.google.com', 'https://google.com']
      for (const url of googleUrls) {
        const cookies = await ses.cookies.get({ url })
        for (const c of cookies) await ses.cookies.remove(url, c.name).catch(() => {})
      }
    }

    const loginWin = new BrowserWindow({
      width: 520,
      height: 680,
      title: 'Iniciar sesion en Google — Yuki',
      backgroundColor: '#fff',
      autoHideMenuBar: true,
      parent: win,
      webPreferences: {
        session: ses,
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
        preload: path.join(__dirname, '../preload/auth-preload.js'),
      },
    })

    loginWin.loadURL('https://accounts.google.com/ServiceLogin?service=mail', { userAgent: CHROME_UA })

    loginWin.webContents.on('did-navigate', (_, url) => {
      const done = url.startsWith('https://mail.google.com')
        || url.startsWith('https://myaccount.google.com')
        || url.startsWith('https://www.google.com/intl')
      if (done) {
        if (win && !win.isDestroyed()) win.webContents.send('google-auth-done', partition)
        setTimeout(() => { if (!loginWin.isDestroyed()) loginWin.close() }, 1000)
        resolve()
      }
    })

    loginWin.on('closed', () => resolve())
  })
}

module.exports = { openGoogleLogin }
