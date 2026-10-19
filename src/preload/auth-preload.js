// Preload para la ventana de autenticacion Google
// Solo spoofing — sin ipcRenderer ni notificaciones

// Versión de Chromium, por dos vías que siempre coinciden con la cabecera
// User-Agent. Sin número fijo de respaldo: uno escrito a mano envejece y
// vuelve a crear la contradicción que este cambio justamente corrige.
const CHROMIUM_VERSION =
  (typeof process !== 'undefined' && process.versions && process.versions.chrome) ||
  ((navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1]) || ''

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

// navigator.webdriver NO se toca: en Electron ya vale false, y redefinirlo
// lo vuelve más detectable, no menos.

// Sin versión fiable es mejor no tocar nada que anunciar uno falso
if (navigator.userAgentData && CHROMIUM_VERSION) {
  // Versión real de Chromium. Tenerla fija aquí (estaba en 131) mientras la
  // cabecera User-Agent anunciaba otra (134) es una contradicción que ningún
  // Chrome real puede tener, y los sistemas antiabuso la detectan al instante.
  const vFull = CHROMIUM_VERSION
  const vMajor = vFull.split('.')[0]
  const brands = [
    { brand: 'Google Chrome', version: vMajor },
    { brand: 'Chromium',      version: vMajor },
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
          uaFullVersion: vFull,
          fullVersionList: [
            { brand: 'Google Chrome', version: vFull },
            { brand: 'Chromium',      version: vFull },
            { brand: 'Not_A Brand',   version: '24.0.0.0' },
          ],
        }),
      },
      writable: false, configurable: false,
    })
  } catch(e) {}
}

