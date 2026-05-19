const { ipcMain, dialog, shell, app, session, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const { openGoogleLogin } = require('./google-auth')

function registerHandlers({ win, viewManager }) {
  const PIN_PATH = path.join(app.getPath('userData'), 'yuki-pin.enc')

  // ── Ciclo de vida de vistas ────────────────────────────────────────────────
  ipcMain.handle('view:open', (_, id, url, partition) => {
    viewManager.openView(id, url, partition)
  })
  ipcMain.handle('view:show', (_, id) => {
    viewManager.activate(id)
  })
  ipcMain.handle('view:sleep', (_, id) => {
    viewManager.sleep(id)
  })
  ipcMain.handle('view:destroy', (_, id) => {
    viewManager.destroy(id)
  })
  ipcMain.handle('view:reload', (_, id) => {
    viewManager.reload(id)
  })
  ipcMain.handle('view:resize-all', (_, leftOffset) => {
    viewManager.resizeAll(leftOffset ?? 64)
  })
  ipcMain.handle('view:devtools', (_, id) => {
    viewManager.openDevTools(id)
  })
  ipcMain.handle('view:set-auto-sleep', (_, minutes) => {
    viewManager.setAutoSleepMinutes(minutes)
  })

  // ── Google Auth ────────────────────────────────────────────────────────────
  ipcMain.on('open-google-auth', (_, { partition, clearFirst }) => {
    openGoogleLogin(win, partition, { clearFirst: !!clearFirst })
  })

  // ── Sesiones ───────────────────────────────────────────────────────────────
  ipcMain.handle('session:clear', async (event, partition) => {
    try {
      const ses = session.fromPartition(partition)
      await ses.clearStorageData()
      await ses.clearCache()
      const appId = partition.replace(/^persist:/, '')
      event.sender.send('session:cleared', { id: appId })
      return { ok: true }
    } catch(e) {
      return { ok: false, error: e.message }
    }
  })

  // ── Archivos y diálogos ────────────────────────────────────────────────────
  ipcMain.handle('config:export', async (_, data) => {
    const date = new Date().toISOString().slice(0, 10)
    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Exportar configuración de Yuki',
      defaultPath: `yuki-backup-${date}.json`,
      filters: [{ name: 'Backup Yuki', extensions: ['json'] }],
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
      return { ok: true, path: filePath }
    } catch(e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('config:import', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Importar configuración de Yuki',
      filters: [{ name: 'Backup Yuki', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return { ok: false, canceled: true }
    try {
      const raw = fs.readFileSync(filePaths[0], 'utf8')
      return { ok: true, data: JSON.parse(raw) }
    } catch(e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('get-userdata-path', () => app.getPath('userData'))

  ipcMain.handle('autosave:read', () => {
    const autosavePath = path.join(app.getPath('userData'), 'yuki-autosave.json')
    try {
      if (!fs.existsSync(autosavePath)) return null
      return JSON.parse(fs.readFileSync(autosavePath, 'utf8'))
    } catch(e) { return null }
  })

  ipcMain.on('open-userdata', () => {
    shell.openPath(app.getPath('userData'))
  })

  // ── PIN (safeStorage) ─────────────────────────────────────────────────────
  ipcMain.handle('pin:save', (_, pin) => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        fs.writeFileSync(PIN_PATH, safeStorage.encryptString(pin))
      } else {
        fs.writeFileSync(PIN_PATH, pin, 'utf8')
      }
      return { ok: true }
    } catch(e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('pin:verify', (_, pin) => {
    try {
      if (!fs.existsSync(PIN_PATH)) return { match: false }
      let stored
      if (safeStorage.isEncryptionAvailable()) {
        stored = safeStorage.decryptString(fs.readFileSync(PIN_PATH))
      } else {
        stored = fs.readFileSync(PIN_PATH, 'utf8')
      }
      return { match: stored === pin }
    } catch(e) { return { match: false } }
  })

  ipcMain.handle('pin:has', () => fs.existsSync(PIN_PATH))

  ipcMain.handle('pin:delete', () => {
    try { if (fs.existsSync(PIN_PATH)) fs.unlinkSync(PIN_PATH); return { ok: true } }
    catch(e) { return { ok: false, error: e.message } }
  })
}

module.exports = { registerHandlers }
