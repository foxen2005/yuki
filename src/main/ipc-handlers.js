const { ipcMain, dialog, shell, app, session, safeStorage } = require('electron')
const permissions = require('./permissions')
const path = require('path')
const fs = require('fs')
const { openGoogleLogin } = require('./google-auth')
const { checkNow } = require('./updater')

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
  ipcMain.handle('view:capture-active', async () => viewManager.captureActive())

  ipcMain.handle('view:resize-all', (_, leftOffset, rightCrop) => {
    viewManager.resizeAll(leftOffset ?? 72, rightCrop ?? 12)
  })
  ipcMain.handle('view:devtools', (_, id) => {
    viewManager.openDevTools(id)
  })
  ipcMain.handle('view:set-auto-sleep', (_, minutes) => {
    viewManager.setAutoSleepMinutes(minutes)
  })
  ipcMain.handle('view:set-sleepable', (_, id, value) => {
    viewManager.setSleepable(id, value)
  })
  ipcMain.handle('view:set-memory-reporting', (_, enabled) => {
    viewManager.setMemoryReporting(enabled)
  })

  // ── Acerca de ─────────────────────────────────────────────────────────────
  // Todo se lee en vivo: antes la versión y las tecnologías estaban escritas a
  // mano en el HTML y quedaron desfasadas (decía 0.2.0 en la 0.4.0).
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    userData: app.getPath('userData'),
    empaquetada: app.isPackaged,
  }))
  ipcMain.handle('update:check', () => checkNow())

  ipcMain.on('open-external', (_, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url)
  })

  // ── Cachés en disco ───────────────────────────────────────────────────────
  // Mide y libera lo que ocupan las apps SIN tocar cookies ni IndexedDB, que
  // es donde vive la sesión: limpiar aquí no desloguea de nada.
  // Asíncrono a propósito: estas carpetas tienen decenas de miles de archivos
  // y con readdirSync/statSync el proceso principal se congelaba varios
  // segundos al abrir Configuración. Con await el bucle de eventos respira.
  const dirSize = async (dir) => {
    let total = 0
    const stack = [dir]
    while (stack.length) {
      const d = stack.pop()
      let entries = []
      try { entries = await fs.promises.readdir(d, { withFileTypes: true }) } catch(e) { continue }
      for (const e of entries) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) { stack.push(p); continue }
        try { total += (await fs.promises.stat(p)).size } catch(e) {}
      }
    }
    return total
  }

  let usageEnCurso = null
  ipcMain.handle('cache:usage', async () => {
    // Abrir y cerrar Configuración varias veces lanzaba un recorrido nuevo
    // cada vez y saturaba el pool de hilos de libuv. Se reutiliza el que corre.
    if (usageEnCurso) return usageEnCurso
    usageEnCurso = (async () => {
    const root = path.join(app.getPath('userData'), 'Partitions')
    let dirs = []
    try { dirs = (await fs.promises.readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()) }
    catch(e) { return [] }
    const out = []
    for (const d of dirs) {
      out.push({ id: d.name, mb: Math.round((await dirSize(path.join(root, d.name))) / 1048576) })
    }
      return out.sort((a, b) => b.mb - a.mb)
    })()
    try { return await usageEnCurso } finally { usageEnCurso = null }
  })

  ipcMain.handle('cache:clear', async (_, id) => {
    const targets = id ? [id] : (() => {
      const root = path.join(app.getPath('userData'), 'Partitions')
      try { return fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name) }
      catch(e) { return [] }
    })()
    for (const t of targets) {
      try {
        const ses = session.fromPartition(`persist:${t}`)
        await ses.clearCache()
        // cachestorage = los Service Workers de WhatsApp (GBs). No se tocan
        // cookies, localstorage ni indexeddb: la sesión sobrevive.
        await ses.clearStorageData({ storages: ['cachestorage', 'shadercache'] })
      } catch(e) {}
    }
    return { ok: true }
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
      // openView/switchTo no recargan una vista viva: hay que volver a la URL base
      viewManager.restart(appId)
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

  // ── Permisos de sitios ────────────────────────────────────────────────────
  ipcMain.handle('permissions:reset', () => { permissions.reset(); return { ok: true } })
  ipcMain.handle('permissions:list', () => permissions.list())
  ipcMain.handle('permissions:set', (_, origin, permission, allowed) => { permissions.set(origin, permission, allowed); return { ok: true } })
  ipcMain.handle('permissions:remove', (_, origin, permission) => { permissions.remove(origin, permission); return { ok: true } })

  // ── Ventana ───────────────────────────────────────────────────────────────
  ipcMain.on('window:hide', () => { win.hide() })
  ipcMain.on('window:quit', () => { app.isQuiting = true; app.quit() })

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
