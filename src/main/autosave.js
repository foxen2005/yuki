const { app, globalShortcut, session } = require('electron')
const path = require('path')
const fs = require('fs')

function setupAutosave({ win, viewManager }) {
  let autosaveDone = false
  const AUTOSAVE_PATH = path.join(app.getPath('userData'), 'yuki-autosave.json')

  app.on('before-quit', (e) => {
    app.isQuiting = true
    globalShortcut.unregisterAll()

    if (autosaveDone || !win || win.isDestroyed()) return
    e.preventDefault()

    const forceQuit = setTimeout(() => { autosaveDone = true; app.quit() }, 4000)

    win.webContents.executeJavaScript(`({
      version: 1,
      savedAt: new Date().toISOString(),
      apps: JSON.parse(localStorage.getItem('yuki-apps') || '[]'),
      settings: JSON.parse(localStorage.getItem('yuki-settings') || '{}'),
      customSound: localStorage.getItem('yuki-custom-sound') || null,
    })`).then(async (data) => {
      clearTimeout(forceQuit)

      // Flush todas las sesiones activas al disco antes de salir
      const seen = new Set()
      const flushList = []
      if (data.apps && Array.isArray(data.apps)) {
        data.apps.forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); flushList.push(a.id) } })
      }
      if (viewManager) {
        for (const id of viewManager.views.keys()) {
          if (!seen.has(id)) { seen.add(id); flushList.push(id) }
        }
      }
      await Promise.allSettled(
        flushList.map(id => {
          try { return session.fromPartition(`persist:${id}`).flushStorageData() }
          catch(e) { return Promise.resolve() }
        })
      )

      try { fs.writeFileSync(AUTOSAVE_PATH, JSON.stringify(data, null, 2), 'utf8') }
      catch(err) { console.error('autosave write error:', err) }

      autosaveDone = true
      app.quit()
    }).catch((err) => {
      console.error('autosave executeJS error:', err)
      clearTimeout(forceQuit)
      autosaveDone = true
      app.quit()
    })
  })
}

module.exports = { setupAutosave }
