// Preload para la ventana de autenticacion Google
// Solo spoofing — sin ipcRenderer ni notificaciones

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
      onMessage:  { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
      onConnect:  { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
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

try {
  Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: false })
} catch(e) {}

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

;['__electron', '__electronBinding', 'electronAPI', 'electron'].forEach(key => {
  try { delete window[key] } catch(e) {}
})

try {
  Object.defineProperty(navigator, 'credentials', {
    value: {
      get:                () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
      create:             () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
      store:              () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
      preventSilentAccess: () => Promise.resolve(),
    },
    writable: false, configurable: false,
  })
} catch(e) {}

const _orig = Object.getOwnPropertyDescriptor.bind(Object)
Object.getOwnPropertyDescriptor = function(target, key) {
  if (key === 'webdriver' && target === navigator) return undefined
  return _orig(target, key)
}
