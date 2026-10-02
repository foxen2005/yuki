// Genera capturas para la ficha de Microsoft Store (1920×1080).
//
// Se capturan desde el propio proceso de render con capturePage(), no con una
// captura de pantalla: así no sale el escritorio ni ninguna otra ventana por
// encima, y la imagen es exactamente lo que dibuja la aplicación.
//
// Importante: NO se abren las apps web del usuario. Las vistas nativas no
// entran en capturePage() y, sobre todo, fotografiar WhatsApp o Gmail reales
// publicaría conversaciones y correos en una ficha pública.
//
// Uso:  npx electron scripts/make-store-shots.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const RAIZ = path.join(__dirname, '..')
const OUT = path.join(RAIZ, 'store-shots')
const W = 1920, H = 1080

app.setPath('userData', path.join(app.getPath('appData'), 'Yuki'))

// Estados a capturar: cada uno abre una parte distinta de Configuración
const TOMAS = [
  {
    nombre: '1-configuracion-apps.png',
    titulo: 'Panel de configuración con la lista de apps',
    script: `document.getElementById('settings-toggle').click()`,
    espera: 2200,
  },
  {
    nombre: '2-catalogo.png',
    titulo: 'Catálogo de aplicaciones disponibles',
    script: `document.querySelector('.catalog-grid').scrollIntoView({ block: 'center' })`,
    espera: 900,
  },
  {
    nombre: '3-memoria-y-disco.png',
    titulo: 'Control de RAM y espacio en disco',
    script: `document.getElementById('memory-list').scrollIntoView({ block: 'center' })`,
    espera: 900,
  },
  {
    nombre: '4-acerca-de.png',
    titulo: 'Información de la aplicación',
    script: `document.querySelector('.about-card').scrollIntoView({ block: 'center' })`,
    espera: 900,
  },
]

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: W, height: H, show: false, frame: false, backgroundColor: '#0a0814',
    // Sin esto Windows recorta la ventana al área de trabajo (quedaba 1920x1022)
    useContentSize: true, enableLargerThanScreen: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false,
      preload: path.join(RAIZ, 'src/preload/renderer-preload.js'),
    },
  })

  const ViewManager = require(path.join(RAIZ, 'src/main/view-manager.js'))
  const { registerHandlers } = require(path.join(RAIZ, 'src/main/ipc-handlers.js'))
  const vm = new ViewManager(win)
  registerHandlers({ win, viewManager: vm })

  win.setContentSize(W, H)
  await win.loadFile(path.join(RAIZ, 'src/renderer/index.html'))
  await new Promise(r => setTimeout(r, 1800))

  const versionReal = require(path.join(RAIZ, 'package.json')).version
  const hechas = []
  for (const t of TOMAS) {
    try { await win.webContents.executeJavaScript(t.script) } catch (e) {}
    await new Promise(r => setTimeout(r, t.espera))

    // app.getVersion() devuelve la versión de Electron al ejecutar
    // `electron scripts/...`, porque la carpeta del script no tiene
    // package.json. La app empaquetada sí reporta bien (verificado dentro del
    // asar); aquí se corrige al valor real, y va dentro del bucle porque
    // renderAbout() lo reescribe cada vez que se abre Configuración.
    await win.webContents.executeJavaScript(`
      (() => {
        const e = document.getElementById('about-version')
        if (e) e.textContent = ${JSON.stringify(versionReal)}
      })()
    `).catch(() => {})

    const img = await win.webContents.capturePage()
    const buf = img.toPNG()
    fs.writeFileSync(path.join(OUT, t.nombre), buf)
    const s = img.getSize()
    hechas.push(`${t.nombre}  ${s.width}x${s.height}  ${(buf.length / 1024).toFixed(0)} KB  — ${t.titulo}`)
  }

  console.log('\nCapturas en store-shots/:\n  ' + hechas.join('\n  '))
  app.quit()
})
