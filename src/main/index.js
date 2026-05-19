const { app, session } = require('electron')
const { spoofSession } = require('./session-manager')
const { createWindow, createTray, registerShortcuts } = require('./window')
const ViewManager = require('./view-manager')
const { registerHandlers } = require('./ipc-handlers')
const { setupAutosave } = require('./autosave')

app.setAppUserModelId('com.yuki.app')
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
app.commandLine.appendSwitch('disable-features', [
  'WebAuthentication',
  'WebAuthenticationCableV2',
  'WebAuthenticationPasskeysInSessionBubble',
  'WebAuthenticationConditionalUI',
  'WebAuthnTouchId',
].join(','))
app.commandLine.appendSwitch('enable-features', 'NetworkService,NetworkServiceInProcess')

app.whenReady().then(() => {
  spoofSession(session.defaultSession)
  app.on('session-created', ses => spoofSession(ses))

  const win = createWindow()
  createTray(win)
  registerShortcuts(win)

  const viewManager = new ViewManager(win)
  viewManager.startMemoryMonitor(30000)

  registerHandlers({ win, viewManager })
  setupAutosave({ win, viewManager })

  // Flush periódico de sesiones cada 60s — protege contra apagados bruscos
  setInterval(() => {
    if (!win || win.isDestroyed()) return
    win.webContents.executeJavaScript(
      `JSON.parse(localStorage.getItem('yuki-apps') || '[]')`
    ).then(apps => {
      if (!Array.isArray(apps)) return
      apps.forEach(a => {
        try { session.fromPartition(`persist:${a.id}`).flushStorageData() } catch(e) {}
      })
    }).catch(() => {})
  }, 60000)
})

app.on('window-all-closed', () => {
  // El tray mantiene la app viva — no salir aquí
})
