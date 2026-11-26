const { BrowserWindow, Tray, Menu, nativeImage, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { t } = require('./idioma')

const ICONS_DIR = path.join(app.getAppPath(), 'icons')

let win = null
let tray = null

function createWindow() {
  const iconPath = path.join(ICONS_DIR, 'icon.ico')
  const iconPng  = path.join(ICONS_DIR, 'icon.png')

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Yuki',
    icon: fs.existsSync(iconPath) ? iconPath : iconPng,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 32
    },
    backgroundMaterial: 'acrylic',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      preload: path.join(__dirname, '../preload/renderer-preload.js'),
    },
  })

  win.loadFile(path.join(__dirname, '../renderer/index.html'))

  win.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault()
      win.hide()
    }
  })

  // El resize lo maneja ViewManager (win.on('resize') en su constructor);
  // antes estaba duplicado aquí y pisaba el layout con el offset por defecto.

  // Restaurar desde la barra de tareas también debe pasar por el lock
  win.on('restore', () => win.webContents.send('yuki-window-show'))

  return win
}

// Única forma de traer la ventana al frente: restaura si está minimizada y
// avisa al renderer (que muestra el lock si está habilitado)
function showMain(mainWin) {
  if (!mainWin || mainWin.isDestroyed()) return
  if (mainWin.isMinimized()) mainWin.restore()
  mainWin.show()
  mainWin.focus()
  mainWin.webContents.send('yuki-window-show')
}

function createTray(mainWin) {
  const iconPath = path.join(ICONS_DIR, 'icon.ico')
  const iconPng  = path.join(ICONS_DIR, 'icon.png')
  let trayIcon

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  } else if (fs.existsSync(iconPng)) {
    trayIcon = nativeImage.createFromPath(iconPng).resize({ width: 16, height: 16 })
  } else {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Yuki')

  // Se arma en una función para poder rehacerlo al cambiar de idioma: el menú
  // de la bandeja es lo único de la app que no se vuelve a construir solo en
  // cada uso (los contextuales y los diálogos sí).
  const construirMenu = () => Menu.buildFromTemplate([
    { label: t('tray.abrirYuki'), click: () => showMain(mainWin) },
    // Salida de emergencia para una flotante pegada: una ventana que no
    // responde no se cierra con su propia X, y el menú de la bandeja es lo
    // único que sigue estando a mano. Siempre visible, aunque no haya ninguna
    // abierta: setContextMenu no se vuelve a construir en cada clic, y el
    // usuario que la necesita no va a estar para descubrir un item nuevo.
    { label: t('tray.cerrarFlotantes'), click: () => {
      const vm = mainWin && !mainWin.isDestroyed() && mainWin._viewManager
      if (!vm) return
      const n = vm.contarFlotantes()
      // Sin ninguna abierta no hay nada que preguntar ni que hacer. Con
      // alguna sí se pregunta: esto es un destroy() sin vuelta atrás y el
      // item vive a un renglón de "Abrir Yuki".
      if (!n) return
      const r = dialog.showMessageBoxSync({
        type: 'warning', noLink: true, title: 'Yuki',
        message: n === 1 ? t('tray.cerrarFlotantes.una') : t('tray.cerrarFlotantes.varias', { n }),
        detail: t('tray.cerrarFlotantes.detalle'),
        buttons: [t('tray.cerrarFlotantes.btn'), t('dialog.cancelar')],
        defaultId: 1, cancelId: 1,
      })
      if (r === 0) vm.cerrarTodasLasFlotantes()
    } },
    { type: 'separator' },
    { label: t('tray.salir'), click: () => { app.isQuiting = true; app.quit() } },
  ])
  tray.setContextMenu(construirMenu())
  // Lo llama ipc-handlers al cambiar el idioma.
  tray.rehacerMenu = () => { try { tray.setContextMenu(construirMenu()) } catch (e) {} }

  tray.on('click', () => {
    // isVisible() es true para una ventana minimizada en Windows: hay que
    // comprobar isMinimized() o el click la escondía en vez de restaurarla
    if (mainWin.isVisible() && !mainWin.isMinimized()) {
      mainWin.hide()
    } else {
      showMain(mainWin)
    }
  })

  return tray
}

// Ctrl+1..9 cambia de app SOLO cuando Yuki tiene el foco. Antes se usaba
// globalShortcut, que capturaba la tecla en todo Windows aunque Yuki estuviera
// en segundo plano. Se registra sobre cada webContents (shell + cada vista web)
// porque el input llega al webContents enfocado, no a la ventana.
function bindAppSwitchKeys(wc, mainWin) {
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.shift || input.meta) return
    const n = parseInt(input.key, 10)
    if (!(n >= 1 && n <= 9)) return
    event.preventDefault()
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('switch-app-index', n - 1)
  })
}

function registerShortcuts(mainWin) {
  bindAppSwitchKeys(mainWin.webContents, mainWin)
}

function getWin() { return win }
function getTray() { return tray }

module.exports = { createWindow, createTray, registerShortcuts, bindAppSwitchKeys, getWin, getTray, showMain }
