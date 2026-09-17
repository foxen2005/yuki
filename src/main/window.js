const { BrowserWindow, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')

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

  win.on('resize', () => {
    // Notificado a view-manager a través de la referencia directa al objeto
    if (win._viewManager) win._viewManager.resizeAll()
  })

  return win
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

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir Yuki', click: () => { mainWin.show(); mainWin.focus() } },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuiting = true; app.quit() } },
  ])
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWin.isVisible()) {
      mainWin.hide()
    } else {
      mainWin.show()
      mainWin.focus()
      mainWin.webContents.send('yuki-window-show')
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

module.exports = { createWindow, createTray, registerShortcuts, bindAppSwitchKeys, getWin }
