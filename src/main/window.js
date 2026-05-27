const { BrowserWindow, Tray, Menu, nativeImage, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')

const ICONS_DIR = path.join(__dirname, '../../icons')

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
    if (!require('electron').app.isQuiting) {
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
    { label: 'Salir', click: () => { require('electron').app.isQuiting = true; require('electron').app.quit() } },
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

function registerShortcuts(mainWin) {
  for (let i = 1; i <= 9; i++) {
    globalShortcut.register(`CommandOrControl+${i}`, () => {
      if (mainWin) { mainWin.show(); mainWin.focus(); mainWin.webContents.send('switch-app-index', i - 1) }
    })
  }
  globalShortcut.register('F12', () => {
    if (mainWin) mainWin.webContents.openDevTools()
  })
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWin) mainWin.webContents.send('open-webview-devtools')
  })
}

function getWin() { return win }

module.exports = { createWindow, createTray, registerShortcuts, getWin }
