const { app, session } = require('electron')
const { spoofSession } = require('./session-manager')
const { createWindow, createTray, registerShortcuts, getWin, showMain } = require('./window')
const ViewManager = require('./view-manager')
const { registerHandlers } = require('./ipc-handlers')
const { setupAutosave } = require('./autosave')
const { setupUpdater } = require('./updater')

// ── Instancia única ────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Ya hay una instancia corriendo → salir inmediatamente
  app.quit()
  process.exit(0)
}

// Si el usuario intenta abrir una segunda instancia, enfocar la existente
app.on('second-instance', () => showMain(getWin()))

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
// Sin esto Chromium dimensiona la caché en disco según el espacio libre y
// crece sin freno: las particiones de las apps llegaron a 9,4 GB.
app.commandLine.appendSwitch('disk-cache-size', String(200 * 1024 * 1024))

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
  setupUpdater(getWin)

  // Flush periódico de sesiones cada 60s — protege contra apagados bruscos.
  // Antes se preguntaba la lista de apps al renderer con executeJavaScript en
  // cada vuelta; las vistas creadas son justo las que tienen algo que volcar.
  setInterval(() => {
    if (!win || win.isDestroyed()) return
    for (const id of viewManager.views.keys()) {
      try { session.fromPartition(`persist:${id}`).flushStorageData() } catch(e) {}
    }
  }, 60000)
})

app.on('window-all-closed', () => {
  // El tray mantiene la app viva — no salir aquí
})
