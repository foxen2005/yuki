// Preload inyectado en cada WebContentsView — spoofea Chrome para evitar detección de Electron
// IMPORTANTE: contextIsolation=false en las vistas, por lo que este código modifica window directamente

const { ipcRenderer } = require('electron')

// ── 1. window.chrome completo ────────────────────────────────────────────────
if (!window.chrome || !window.chrome.runtime) {
  Object.defineProperty(window, 'chrome', {
    value: {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      },
      runtime: {
        id: undefined,
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
        onConnect: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
      },
      loadTimes: () => ({
        requestTime: Date.now() / 1000 - 0.5,
        startLoadTime: Date.now() / 1000 - 0.4,
        commitLoadTime: Date.now() / 1000 - 0.3,
        finishDocumentLoadTime: Date.now() / 1000 - 0.1,
        finishLoadTime: Date.now() / 1000,
        firstPaintTime: Date.now() / 1000 - 0.2,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true,
        npnNegotiatedProtocol: 'h3',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'h3',
      }),
      csi: () => ({
        startE: Date.now(),
        onloadT: Date.now(),
        pageT: Math.random() * 1000 + 500,
        tran: 15,
      }),
    },
    writable: false,
    configurable: false,
  })
}

// ── 2. navigator.plugins ─────────────────────────────────────────────────────
const pluginData = [
  { name: 'PDF Viewer',                filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  { name: 'Chrome PDF Viewer',         filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  { name: 'Chromium PDF Viewer',       filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
  { name: 'WebKit built-in PDF',       filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
]
try {
  if (navigator.plugins.length === 0) {
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = pluginData.map((p) => {
          const plugin = Object.create(Plugin.prototype)
          Object.defineProperties(plugin, {
            name:        { value: p.name,        enumerable: true },
            filename:    { value: p.filename,    enumerable: true },
            description: { value: p.description, enumerable: true },
            length:      { value: 1,             enumerable: true },
          })
          return plugin
        })
        arr.item      = (i) => arr[i]
        arr.namedItem = (n) => arr.find(p => p.name === n) || null
        arr.refresh   = () => {}
        return arr
      },
      configurable: false,
    })
  }
} catch(e) {}

// ── 3. navigator.mimeTypes ───────────────────────────────────────────────────
try {
  if (navigator.mimeTypes.length === 0) {
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const types = [
          { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
          { type: 'text/pdf',        suffixes: 'pdf', description: 'Portable Document Format' },
        ]
        const arr = types.map(t => {
          const mt = Object.create(MimeType.prototype)
          Object.defineProperties(mt, {
            type:        { value: t.type,        enumerable: true },
            suffixes:    { value: t.suffixes,    enumerable: true },
            description: { value: t.description, enumerable: true },
          })
          return mt
        })
        arr.item      = (i) => arr[i]
        arr.namedItem = (n) => arr.find(m => m.type === n) || null
        return arr
      },
      configurable: false,
    })
  }
} catch(e) {}

// ── 4. navigator.userAgentData sin Electron ──────────────────────────────────
if (navigator.userAgentData) {
  const brands = [
    { brand: 'Google Chrome', version: '131' },
    { brand: 'Chromium',      version: '131' },
    { brand: 'Not_A Brand',   version: '24'  },
  ]
  try {
    Object.defineProperty(navigator, 'userAgentData', {
      value: {
        brands,
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: async () => ({
          brands, mobile: false, platform: 'Windows',
          platformVersion: '10.0.0', architecture: 'x86', bitness: '64', model: '',
          uaFullVersion: '131.0.6778.205',
          fullVersionList: [
            { brand: 'Google Chrome', version: '131.0.6778.205' },
            { brand: 'Chromium',      version: '131.0.6778.205' },
            { brand: 'Not_A Brand',   version: '24.0.0.0' },
          ],
        }),
      },
      writable: false, configurable: false,
    })
  } catch(e) {}
}

// ── 5. Bloquear WebAuthn/Passkey — NO bloquear credentials completo ──────────
try {
  const _credGet    = navigator.credentials.get.bind(navigator.credentials)
  const _credCreate = navigator.credentials.create.bind(navigator.credentials)
  Object.defineProperty(navigator.credentials, 'get', {
    value: (opts) => {
      if (opts && opts.publicKey) return Promise.reject(new DOMException('Not allowed', 'NotAllowedError'))
      return _credGet(opts)
    },
    writable: true, configurable: true,
  })
  Object.defineProperty(navigator.credentials, 'create', {
    value: (opts) => {
      if (opts && opts.publicKey) return Promise.reject(new DOMException('Not allowed', 'NotAllowedError'))
      return _credCreate(opts)
    },
    writable: true, configurable: true,
  })
} catch(e) {}

// ── 6. Ocultar webdriver ─────────────────────────────────────────────────────
try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: false })
} catch(e) {}

// Eliminar variables globales de Electron
;['__electron', '__electronBinding', 'electronAPI', 'electron', 'process'].forEach(key => {
  try { delete window[key] } catch(e) {}
})

const _origGetOwnPropDesc = Object.getOwnPropertyDescriptor.bind(Object)
Object.getOwnPropertyDescriptor = function(target, key) {
  if (key === 'webdriver' && target === navigator) return undefined
  return _origGetOwnPropDesc(target, key)
}

// ── 7. Abrir links externos en el browser del sistema ────────────────────────
;(function patchWindowOpen() {
  const _open = window.open.bind(window)
  const ownHost = location.hostname

  function isExternal(url) {
    try {
      const h = new URL(String(url)).hostname
      const base = ownHost.split('.').slice(-2).join('.')
      return !h.endsWith(base)
    } catch(e) { return false }
  }

  window.open = function(url, target, features) {
    if (url && /^https?:/.test(String(url)) && isExternal(url)) {
      try { ipcRenderer.send('view:open-external', String(url)) } catch(e) {}
      return null
    }
    return _open(url, target, features)
  }

  document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href]')
    if (!a) return
    const href = a.href || ''
    const tgt  = a.getAttribute('target') || ''
    if (/^https?:/.test(href) && isExternal(href) &&
        (tgt === '_blank' || tgt === '_new' || tgt === '_top')) {
      e.preventDefault()
      try { ipcRenderer.send('view:open-external', href) } catch(e) {}
    }
  }, true)
})()

// ── 8. Interceptar notificaciones ────────────────────────────────────────────
const OriginalNotification = window.Notification

function YukiNotification(title, options = {}) {
  try {
    ipcRenderer.send('view:notification', {
      title: title || '',
      body:  options.body  || '',
      icon:  options.icon  || '',
    })
  } catch(e) {}
  return new OriginalNotification(title, options)
}

Object.setPrototypeOf(YukiNotification, OriginalNotification)
Object.defineProperty(YukiNotification, 'permission', {
  get: () => OriginalNotification.permission,
})
YukiNotification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification)
window.Notification = YukiNotification
