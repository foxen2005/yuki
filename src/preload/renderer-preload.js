// Preload del BrowserWindow principal — expone yukiAPI al renderer con contextBridge
const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_EVENTS = [
  'google-auth-done',
  'yuki-window-show',
  'switch-app-index',
  'view:loading-start',
  'view:loading-stop',
  'view:title-updated',
  'view:navigate',
  'view:needs-google-auth',
  'view:notification',
  'view:memory-report',
  'session:cleared',
]

contextBridge.exposeInMainWorld('yukiAPI', {
  // ── Ciclo de vida de vistas ──────────────────────────────────────────────
  openView:    (id, url, partition) => ipcRenderer.invoke('view:open', id, url, partition),
  showView:    (id)                 => ipcRenderer.invoke('view:show', id),
  sleepView:   (id)                 => ipcRenderer.invoke('view:sleep', id),
  destroyView: (id)                 => ipcRenderer.invoke('view:destroy', id),
  reloadView:  (id)                 => ipcRenderer.invoke('view:reload', id),
  resizeViews:    (leftOffset, rightCrop) => ipcRenderer.invoke('view:resize-all', leftOffset, rightCrop),
  captureActive:  ()                      => ipcRenderer.invoke('view:capture-active'),
  openDevTools:(id)                 => ipcRenderer.invoke('view:devtools', id),
  setAutoSleep:  (minutes)           => ipcRenderer.invoke('view:set-auto-sleep', minutes),
  setSleepable:  (id, value)         => ipcRenderer.invoke('view:set-sleepable', id, value),

  // ── Google Auth ──────────────────────────────────────────────────────────
  openGoogleAuth: (partition, clearFirst) =>
    ipcRenderer.send('open-google-auth', { partition, clearFirst: !!clearFirst }),

  // ── Sesiones ─────────────────────────────────────────────────────────────
  clearSession: (partition) => ipcRenderer.invoke('session:clear', partition),

  // ── Archivos y diálogos ──────────────────────────────────────────────────
  exportConfig:    (data) => ipcRenderer.invoke('config:export', data),
  importConfig:    ()     => ipcRenderer.invoke('config:import'),
  getUserdataPath: ()     => ipcRenderer.invoke('get-userdata-path'),
  readAutosave:    ()     => ipcRenderer.invoke('autosave:read'),
  openUserdata:    ()     => ipcRenderer.send('open-userdata'),
  hideWindow:      ()     => ipcRenderer.send('window:hide'),
  quitApp:         ()     => ipcRenderer.send('window:quit'),

  // ── PIN (almacenamiento seguro) ──────────────────────────────────────────
  savePin:   (pin) => ipcRenderer.invoke('pin:save', pin),
  verifyPin: (pin) => ipcRenderer.invoke('pin:verify', pin),
  hasPin:    ()    => ipcRenderer.invoke('pin:has'),
  deletePin: ()    => ipcRenderer.invoke('pin:delete'),

  // ── Suscripción a eventos del proceso principal ──────────────────────────
  on: (channel, cb) => {
    if (!ALLOWED_EVENTS.includes(channel)) return () => {}
    const fn = (_, ...args) => cb(...args)
    ipcRenderer.on(channel, fn)
    return () => ipcRenderer.off(channel, fn)
  },
})
