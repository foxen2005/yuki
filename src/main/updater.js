// Auto-actualización vía GitHub Releases (electron-updater).
// Mismo flujo que UpdateService.cs de SOS NET (Velopack):
//   1. al arrancar (y cada 4 h) se consulta latest.yml de la última release
//   2. si hay versión nueva se descarga en segundo plano, sin interrumpir
//   3. se avisa al renderer ("update:ready") y el usuario decide cuándo reiniciar
// Solo aplica al build NSIS instalado; en dev y en el portable no hace nada.
const { app, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

function setupUpdater(getWin) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true   // si el usuario no reinicia, se instala al cerrar
  autoUpdater.logger = null

  const send = (channel, payload) => {
    const win = getWin()
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
  }

  autoUpdater.on('update-downloaded', info => send('update:ready', { version: info.version }))
  autoUpdater.on('error', () => { /* sin internet o sin release compatible: silencioso, como SOS */ })

  ipcMain.on('update:install', () => {
    app.isQuiting = true
    autoUpdater.quitAndInstall(true, true)
  })

  const check = () => autoUpdater.checkForUpdates().catch(() => {})
  check()
  setInterval(check, CHECK_EVERY_MS)
}

module.exports = { setupUpdater }
