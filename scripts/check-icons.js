// Diagnóstico: muestra qué ícono tiene guardado cada app y cuánto ocupa.
// Uso:  npx electron scripts/check-icons.js
const { app, BrowserWindow } = require('electron')
const path = require('path')

// Al ejecutar `electron scripts/x.js` Electron toma el nombre de app por
// defecto ("Electron") y apuntaría a otro userData vacío: hay que forzar el real.
app.setPath('userData', path.join(app.getPath('appData'), 'Yuki'))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'))
  // Dar tiempo a que init() corra las migraciones
  await new Promise(r => setTimeout(r, 2500))

  const out = await win.webContents.executeJavaScript(`
    (JSON.parse(localStorage.getItem('yuki-apps') || '[]')).map(a => ({
      id: a.id, icon: (a.icon || '').slice(0, 42), kb: Math.round((a.icon || '').length / 1024)
    }))
  `)
  let total = 0
  for (const a of out) { total += a.kb; console.log(String(a.id).padEnd(18), String(a.kb + ' KB').padStart(8), ' ', a.icon) }
  console.log('\nTotal en localStorage:', total, 'KB')
  app.quit()
})
