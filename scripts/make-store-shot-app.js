// Captura de Yuki "en uso" para la ficha de Microsoft Store (1920×1080).
//
// Las WebContentsView son capas nativas: NO salen en capturePage() de la
// ventana. Por eso se capturan las dos partes por separado y se componen en
// un canvas con las mismas coordenadas que usa el layout real
// (x=72, y=40, ancho = W-72-12, alto = H-40-12), de modo que la imagen final
// es idéntica a lo que se ve en pantalla.
//
// Genera dos versiones de cada toma:
//   *-nitida.png     contenido legible  -> NO publicar sin revisar
//   *-difuminada.png contenido borroso   -> lista para la ficha pública
//
// Uso:  npx electron scripts/make-store-shot-app.js [idApp]
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const RAIZ = path.join(__dirname, '..')
const OUT = path.join(RAIZ, 'store-shots')
const W = 1920, H = 1080
const SIDEBAR = 72, MARGEN = 12, TOPE = 40

app.setPath('userData', path.join(app.getPath('appData'), 'Yuki'))

// CSS que difumina solo el contenido personal, dejando la estructura visible:
// se ve que es WhatsApp y cómo se ve dentro de Yuki, pero no se lee nada.
const CSS_DIFUMINAR = `
  #pane-side, [data-testid="conversation-panel-messages"],
  [aria-label="Lista de chats"], [aria-label="Chat list"],
  [role="application"], .copyable-area > div:last-child,
  [role="main"] [role="row"], [data-testid="cell-frame-container"],
  .ReactVirtualized__Grid, div[role="listitem"],
  table[role="grid"], .ae4, .Cp, [role="list"]
  { filter: blur(9px) !important; }

  /* Fotos de perfil y avatares: en WhatsApp Web se sirven como blob:, así que
     esto los alcanza estén donde estén (incluida la foto propia del rail
     lateral, que no cae dentro de los contenedores de arriba). */
  img[src^="blob:"] { filter: blur(10px) !important; }
`

function leerApps() {
  try {
    const p = path.join(app.getPath('userData'), 'yuki-autosave.json')
    return JSON.parse(fs.readFileSync(p, 'utf8')).apps || []
  } catch (e) { return [] }
}

async function componer(win, shellPNG, viewPNG, destino) {
  const b64 = await win.webContents.executeJavaScript(`new Promise(res => {
    const c = document.createElement('canvas')
    c.width = ${W}; c.height = ${H}
    const ctx = c.getContext('2d')
    const shell = new Image(), vista = new Image()
    let listos = 0
    const pintar = () => {
      if (++listos < 2) return
      ctx.drawImage(shell, 0, 0, ${W}, ${H})
      ctx.drawImage(vista, ${SIDEBAR}, ${TOPE}, ${W - SIDEBAR - MARGEN}, ${H - TOPE - MARGEN})
      res(c.toDataURL('image/png').split(',')[1])
    }
    shell.onload = pintar; vista.onload = pintar
    shell.onerror = () => res(null); vista.onerror = () => res(null)
    shell.src = 'data:image/png;base64,${shellPNG}'
    vista.src = '${viewPNG}'
  })`)
  if (!b64) return null
  fs.writeFileSync(destino, Buffer.from(b64, 'base64'))
  return destino
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: W, height: H, show: false, frame: false, backgroundColor: '#0a0814',
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
  await new Promise(r => setTimeout(r, 1500))

  const apps = leerApps()
  const pedida = process.argv[2]
  const objetivo = pedida ? apps.find(a => a.id === pedida) : apps[0]
  if (!objetivo) { console.error('No hay apps configuradas'); return app.quit() }

  console.log(`Abriendo ${objetivo.name} (${objetivo.url}) — esperando a que cargue…`)
  vm.openView(objetivo.id, objetivo.url, `persist:${objetivo.id}`)
  // Las apps web tardan en pintar el contenido aunque la página ya cargó
  await new Promise(r => setTimeout(r, 22000))

  const base = objetivo.id.replace(/[^a-z0-9-]/gi, '')
  const shellImg = await win.webContents.capturePage()
  const shellB64 = shellImg.toPNG().toString('base64')

  // 1) Nítida
  let vista = await vm.captureActive()
  if (!vista) { console.error('No se pudo capturar la vista'); return app.quit() }
  const nitida = await componer(win, shellB64, vista, path.join(OUT, `app-${base}-nitida.png`))

  // 2) Difuminada: se inyecta el CSS en la propia app y se recaptura
  const entrada = vm.views.get(objetivo.id)
  try { await entrada.view.webContents.insertCSS(CSS_DIFUMINAR) } catch (e) {}
  await new Promise(r => setTimeout(r, 1200))
  vista = await vm.captureActive()
  const difuminada = vista
    ? await componer(win, shellB64, vista, path.join(OUT, `app-${base}-difuminada.png`))
    : null

  console.log('\nGeneradas:')
  for (const f of [nitida, difuminada].filter(Boolean)) {
    const s = fs.statSync(f)
    console.log(`  ${path.basename(f)}  ${(s.size / 1024).toFixed(0)} KB`)
  }
  console.log('\nRevisa la difuminada antes de publicarla: si quedó algo legible, avísame.')
  app.quit()
})
