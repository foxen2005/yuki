// Preload inyectado en cada WebContentsView — spoofea Chrome para evitar detección de Electron
// IMPORTANTE: contextIsolation=false en las vistas, por lo que este código modifica window directamente

const { ipcRenderer } = require('electron')

// Se lee aquí porque más abajo se borra window.process
// Versión de Chromium, por dos vías que siempre coinciden con la cabecera
// User-Agent. Sin número fijo de respaldo: uno escrito a mano envejece y
// vuelve a crear la contradicción que este cambio justamente corrige.
const CHROMIUM_VERSION =
  (typeof process !== 'undefined' && process.versions && process.versions.chrome) ||
  ((navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1]) || ''

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

// navigator.webdriver NO se toca: en Electron ya vale false por sí solo.
// Redefinirlo sustituía un getter nativo por uno de JavaScript, que es
// justo lo que buscan los detectores de automatización.

// Eliminar variables globales de Electron
;['__electron', '__electronBinding', 'electronAPI', 'electron', 'process'].forEach(key => {
  try { delete window[key] } catch(e) {}
})

// Tampoco se parchea Object.getOwnPropertyDescriptor: solo existía para
// ocultar el override anterior, y reemplazar una función nativa delata al
// cliente (su toString deja de decir [native code]).

// ── 7. Abrir links externos en el browser del sistema ────────────────────────
;(function patchWindowOpen() {
  const _open = window.open.bind(window)

  // Esquemas que hay que entregar al sistema porque Chromium no los abre en una
  // ventana. Es una lista cerrada, no "todo lo que no sea http": un blob: o un
  // data: los abre Chromium perfectamente (así descarga WhatsApp sus archivos)
  // y mandarlos fuera los dejaba muertos. El proceso principal vuelve a filtrar
  // por esquema antes de lanzar nada.
  //
  // Antes aquí se comparaba el dominio base y lo "interno" caía al window.open
  // real, que el principal denegaba: devolvía null y Gmail cantaba "bloqueador
  // de ventanas emergentes" en cada enlace de Drive. Qué hacer con un http(s)
  // lo decide el proceso principal, no este preload.
  // La misma lista corta que filtra el proceso principal: fuera los esquemas
  // que lanzan una aplicación instalada (msteams:, zoommtg:, slack:…), que una
  // página podría disparar sin que el usuario haya pulsado nada.
  const ESQUEMAS_AL_SISTEMA = /^(mailto|tel|callto|sms|webcal):/i

  // Sufijos de segundo nivel: sin esto, foo.co.uk y bar.co.uk comparten "co.uk"
  // y se tomarían por el mismo sitio.
  const SUFIJOS_2N = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'gob'])

  // Resuelve relativas contra la página: '/login' también es http
  function esHttp(url) {
    try { return /^https?:$/i.test(new URL(String(url), location.href).protocol) }
    catch (e) { return false }
  }

  function absoluta(url) {
    try { return new URL(String(url), location.href).href } catch (e) { return String(url) }
  }

  function dominioBase(host) {
    const partes = String(host || '').toLowerCase().split('.')
    if (partes.length < 2) return partes.join('.')
    const n = (partes.length > 2 && SUFIJOS_2N.has(partes[partes.length - 2])) ? 3 : 2
    return partes.slice(-n).join('.')
  }

  // Compara el dominio registrable, no el origen. Con el origen, el enlace de
  // cerrar sesión de Gmail (accounts.google.com desde mail.google.com) contaba
  // como externo y se iba al navegador: cerraba la sesión del Chrome del
  // usuario y dejaba la de Yuki intacta.
  function esDeOtroSitio(url) {
    try {
      return dominioBase(new URL(String(url), location.href).hostname) !== dominioBase(location.hostname)
    } catch (e) { return false }
  }

  // Ventana de mentira. Si window.open devuelve null, algunas apps
  // (WhatsApp/Meta, Gmail) lo toman por "popup bloqueado": unas avisan al
  // usuario y otras recurren a window.location.href, que saca al usuario de la
  // app. Devolver esto las deja tranquilas.
  function ventanaFalsa(url) {
    const falsa = {
      closed: false,
      close()  { this.closed = true },
      focus()  {},
      blur()   {},
      postMessage() {},
      location: { href: String(url) },
    }
    setTimeout(() => { falsa.closed = true }, 300)
    return falsa
  }

  // _self, _parent y _top reutilizan el contexto actual: no crean ventana, así
  // que setWindowOpenHandler ni se entera. Un window.open a otro sitio con uno
  // de esos destinos sustituía la vista de la app por la página ajena, sin
  // barra de direcciones ni botón de atrás para volver.
  const DESTINOS_EN_SITIO = /^_(self|parent|top)$/i

  window.open = function(url, target, features) {
    const u = String(url || '')
    if (u && ESQUEMAS_AL_SISTEMA.test(u)) {
      try { ipcRenderer.send('view:open-external', u) } catch(e) {}
      return ventanaFalsa(u)
    }
    if (u && DESTINOS_EN_SITIO.test(String(target || '')) && esHttp(u) && esDeOtroSitio(u)) {
      // Absoluta: una protocol-relative ('//ejemplo.org/x') no pasa el filtro de
      // esquemas del proceso principal y el clic se perdía sin más.
      try { ipcRenderer.send('view:open-external', absoluta(u)) } catch(e) {}
      return ventanaFalsa(u)
    }
    const real = _open(url, target, features)
    // null en un http(s) = el proceso principal la denegó, pero no se perdió:
    // la mandó al navegador (un login) o la descargó. La página no tiene por
    // qué enterarse. Solo http(s): para un about:blank o un blob: la página
    // espera una ventana con document, y el muñeco le haría explotar un
    // document.write donde antes solo recibía null.
    //
    // Se resuelve contra la página porque window.open('/login') es de lo más
    // corriente y comparado en crudo no parecía http.
    //
    // Con 'noopener' no vale: ahí window.open devuelve null aunque la ventana
    // se haya creado — es lo que significa. Dar el muñeco engañaría a la página
    // (su w.close() no cerraría la flotante de verdad, que seguiría abierta).
    const sinOpener = /\bnoopener\b/i.test(String(features || ''))
    if (!real && !sinOpener && u && esHttp(u)) return ventanaFalsa(u)
    return real
  }

  // target="_top" navega el marco principal y nunca pasa por
  // setWindowOpenHandler: sin esto, un enlace a otro sitio sustituye la app
  // entera por esa página y solo se vuelve recargando. Va al navegador, que es
  // lo que ya hacía antes: reconducirlo por window.open parecía más coherente,
  // pero si el proceso principal lo deniega (un accounts.google.com, que
  // dispara el banner) el clic se pierde y los enlaces de cerrar sesión o
  // cambiar de cuenta dejan de funcionar. Al navegador siempre pasa algo.
  //
  // En fase de captura, para adelantarse a la navegación.
  //
  // Esto solo protege el documento principal: el preload no se inyecta en los
  // subframes (haría falta nodeIntegrationInSubFrames, y meter todo este
  // preload dentro de cada iframe de anuncio no compensa). Un _top disparado
  // desde un iframe sigue pudiendo sustituir la vista; es la misma limitación
  // que había antes, no algo que introduzca este cambio.
  document.addEventListener('click', function(e) {
    const a = e.target.closest('a[href]')
    if (!a) return
    const href = a.href || ''
    if (a.getAttribute('target') !== '_top') return
    if (!/^https?:/i.test(href) || !esDeOtroSitio(href)) return
    e.preventDefault()
    try { ipcRenderer.send('view:open-external', href) } catch(e) {}
  }, true)

  // mailto:, tel: y demás: Chromium no los abre en una ventana, los entrega al
  // sistema. Un blob: o un data: NO entran aquí: los abre Chromium y pararlos
  // los dejaba muertos (es como WhatsApp descarga sus archivos).
  //
  // Sin mirar el target, porque la mayoría de los "escríbeme" de una web son un
  // <a href="mailto:…"> pelado. Pero en fase de burbuja y respetando
  // defaultPrevented: Gmail captura sus propios mailto: para abrir su
  // ventana de redactar, y adelantarse le robaba el clic para lanzar el cliente
  // de correo de Windows.
  document.addEventListener('click', function(e) {
    if (e.defaultPrevented) return
    const a = e.target.closest('a[href]')
    if (!a) return
    const href = a.href || ''
    if (!href || !ESQUEMAS_AL_SISTEMA.test(href)) return
    e.preventDefault()
    try { ipcRenderer.send('view:open-external', href) } catch(e) {}
  })
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
