// Bloqueo con PIN: una ventana propia que tapa Yuki.
//
// Antes el bloqueo era una capa HTML dentro del renderer. No bastaba: las apps
// son WebContentsView nativas que Chromium pinta POR ENCIMA de todo el DOM, así
// que había que empujarlas a x=9999 para que la capa se viera. Ese truco solo
// funciona con las vistas; una ventana flotante aparte se quedaba visible y
// clickeable con Yuki bloqueado, y por eso las flotantes se descartaron dos
// veces.
//
// Ahora el bloqueo es una ventana hija y modal de la principal. Al ser una
// ventana del sistema operativo tapa cualquier cosa que Yuki dibuje dentro, sin
// trucos de coordenadas. Es hija y no una capa a pantalla completa a propósito:
// una ventana opaca, siempre encima y del tamaño del escritorio dejaría el PC
// inutilizable si algo fallara. Esto bloquea Yuki, no la máquina.
//
// Lo que la capa no tapa es cualquier OTRA ventana (las flotantes, la de login
// de Google): son hermanas suyas, no descendientes. Se esconden mientras dure
// el bloqueo — ver ocultarOtras().
const { BrowserWindow, webContents, app } = require('electron')
const path = require('path')
const pin = require('./pin')

let capa = null
let principal = null
let desatar = null
let ocultadas = []   // ventanas escondidas al bloquear, para devolverlas luego

// El interruptor vive en el localStorage del renderer, pero el proceso
// principal necesita conocerlo antes de que el renderer conteste: al volver
// desde la bandeja, showMain() muestra la ventana y solo después manda el aviso
// que acaba pidiendo el bloqueo. En ese hueco las flotantes ya estaban en
// pantalla con el correo abierto. El renderer lo informa al arrancar y cada vez
// que cambia.
let habilitado = false
function setHabilitado(v) { habilitado = !!v }
function estaHabilitado() { return habilitado }

function bloqueado() {
  return !!(capa && !capa.isDestroyed())
}

// La capa cubre el área de contenido de la ventana principal y la sigue a donde
// vaya. Sin esto, mover o redimensionar Yuki destaparía las apps.
function ajustar() {
  if (!bloqueado() || !principal || principal.isDestroyed()) return
  try { capa.setBounds(principal.getContentBounds()) } catch (e) {}
}

// La capa no se esconde sola cuando Yuki se va a la bandeja o se minimiza:
// quedaría flotando sobre el escritorio sin ventana debajo.
function seguirVisibilidad() {
  if (!bloqueado() || !principal || principal.isDestroyed()) return
  try {
    if (principal.isVisible() && !principal.isMinimized()) capa.show()
    else capa.hide()
  } catch (e) {}
}

// La capa es hija y modal de la ventana principal, así que tapa todo lo que
// Yuki dibuja dentro. Lo que no tapa es cualquier OTRA ventana: las flotantes y
// la ventana de login de Google son hermanas suyas, no descendientes, y pueden
// quedar por delante y clickeables. Se esconden todas mientras dure el bloqueo.
//
// Va por BrowserWindow.getAllWindows() en vez de por un registro propio para
// que una ventana que añadamos mañana quede cubierta sin acordarse de esto.
// Las DevTools no salen en BrowserWindow.getAllWindows(): una ventana de
// herramientas abierta y desacoplada se quedaba por delante de la capa, con la
// consola apuntando a la sesión que el bloqueo protege. No hay forma de
// taparlas, así que se cierran.
function cerrarDevTools() {
  for (const wc of webContents.getAllWebContents()) {
    try { if (!wc.isDestroyed() && wc.isDevToolsOpened()) wc.closeDevTools() } catch (e) {}
  }
}

function ocultarOtras() {
  ocultadas = []
  cerrarDevTools()
  for (const v of BrowserWindow.getAllWindows()) {
    if (v === capa || v === principal) continue
    try {
      if (v.isDestroyed() || !v.isVisible()) continue
      // Las minimizadas también. La capa es modal de la ventana principal y no
      // deshabilita a sus hermanas: una flotante minimizada con el correo
      // abierto se restauraba desde la barra de tareas y se leía entera con
      // Yuki bloqueado. Se apunta cómo estaba para devolverla igual.
      const minimizada = v.isMinimized()
      v.hide()
      ocultadas.push({ v, minimizada })
    } catch (e) {}
  }
}

function devolverOtras() {
  for (const { v, minimizada } of ocultadas) {
    try {
      if (v.isDestroyed()) continue
      // showInactive: tras acertar el PIN el usuario mira la ventana de Yuki,
      // no quiere una flotante saltándole por delante.
      v.showInactive()
      if (minimizada) v.minimize()
    } catch (e) {}
  }
  ocultadas = []
}

// Una ventana creada DESPUÉS de bloquear (una app que abre algo sola) no estaba
// cuando se hizo el barrido. Hay que esconderla igual y apuntarla, o al
// desbloquear nadie la devolvería: se quedaría invisible y viva para siempre.
function taparNueva(ventana) {
  if (!bloqueado() || !ventana) return false
  try {
    if (ventana.isDestroyed()) return false
    ventana.hide()
    const apunte = { v: ventana, minimizada: false }
    ocultadas.push(apunte)
    ventana.on('closed', () => {
      const i = ocultadas.indexOf(apunte)
      if (i >= 0) ocultadas.splice(i, 1)
    })
    return true
  } catch (e) { return false }
}

// Devuelve una promesa que no se resuelve hasta que la capa está realmente en
// pantalla. El renderer la espera antes de enganchar las vistas de las apps: si
// contestáramos al crearla, Gmail alcanzaba a pintarse durante el rato que
// tarda en cargar lock.html.
function mostrar(win) {
  if (!win || win.isDestroyed()) return { ok: false, motivo: 'sin-ventana' }

  // Antes que nada: si ya está bloqueado, decir que sí. Comprobando el PIN
  // primero, un almacén que se vuelve ilegible estando bloqueado devolvía
  // "sin-pin", el renderer anunciaba "bloqueo desactivado"… y la capa seguía
  // ahí, sin PIN que la abriera.
  if (bloqueado()) { try { capa.focus() } catch (e) {} ; return { ok: true } }

  // Sin PIN guardado no habría forma de quitar la capa: no se muestra.
  if (!pin.existe()) return { ok: false, motivo: 'sin-pin' }

  principal = win

  capa = new BrowserWindow({
    parent: win,
    modal: true,          // deshabilita la ventana padre mientras está abierta
    ...win.getContentBounds(),
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#0f0c1c',   // opaco: es lo que impide ver lo de atrás
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/lock-preload.js'),
    },
  })

  capa.setMenu(null)
  capa.loadFile(path.join(__dirname, '../renderer/lock.html'))

  let avisarListo = null
  const enPantalla = new Promise((resolve) => { avisarListo = resolve })
  const listo = () => { if (avisarListo) { avisarListo({ ok: true }); avisarListo = null } }

  capa.once('ready-to-show', () => {
    if (!bloqueado()) { listo(); return }
    // No capa.show() a secas: si Yuki se minimizó durante el viaje de ida y
    // vuelta del IPC, aparecería un rectángulo opaco suelto en el escritorio,
    // sin barra de tareas, sin poder moverlo ni cerrarlo.
    seguirVisibilidad()
    if (capa.isVisible()) capa.focus()
    listo()
  })

  // Red de seguridad: si ready-to-show no llegara, el renderer no puede quedarse
  // esperando para siempre sin enseñar la app.
  setTimeout(listo, 5000)

  // No se cierra sin PIN, pero tampoco con `closable: false`: ahí close() es un
  // no-op silencioso y app.quit() se queda a medias — el tray destruía la
  // ventana principal y el proceso seguía vivo, sin icono y sin forma de
  // recuperarlo, saltándose además la instalación de una actualización
  // pendiente. Bloquear el cierre aquí deja pasar la salida de verdad.
  capa.on('close', (e) => {
    if (!app.isQuiting) e.preventDefault()
  })

  // Si la capa no llega a pintarse queda un rectángulo opaco sin campo donde
  // escribir el PIN. Antes aquí se desbloqueaba, que es exactamente lo que no
  // hay que hacer: un cuelgue del renderer (y esta app va justa de memoria)
  // dejaría Yuki abierto con todas las sesiones a la vista. Se reintenta una
  // vez; si tampoco, se esconde Yuki entero y se queda bloqueado. Se sale por
  // la bandeja, que sigue funcionando.
  let reintentada = false
  const recuperar = () => {
    if (!bloqueado()) return
    if (!reintentada) {
      reintentada = true
      try { capa.reload() } catch (e) {}
      return
    }
    try { if (principal && !principal.isDestroyed()) principal.hide() } catch (e) {}
  }
  // Si el reintento funcionó, el siguiente fallo vuelve a tener derecho al suyo
  capa.webContents.on('did-finish-load', () => { reintentada = false })
  capa.webContents.on('did-fail-load', (_e, _code, _desc, _url, esMarcoPrincipal) => {
    if (esMarcoPrincipal) recuperar()
  })
  capa.webContents.on('render-process-gone', () => recuperar())

  ocultarOtras()

  // La capa es una ventana aparte: la vista previa de la barra de tareas y el
  // Alt+Tab siguen dibujando el contenido de la principal, que está debajo y
  // sin tapar. Esto hace que Windows devuelva negro en esas capturas.
  try { win.setContentProtection(true) } catch (e) {}

  const alMover = () => ajustar()
  const alCambiarVisibilidad = () => seguirVisibilidad()
  win.on('move', alMover)
  win.on('resize', alMover)
  win.on('minimize', alCambiarVisibilidad)
  win.on('restore', alCambiarVisibilidad)
  win.on('show', alCambiarVisibilidad)
  win.on('hide', alCambiarVisibilidad)
  desatar = () => {
    win.removeListener('move', alMover)
    win.removeListener('resize', alMover)
    win.removeListener('minimize', alCambiarVisibilidad)
    win.removeListener('restore', alCambiarVisibilidad)
    win.removeListener('show', alCambiarVisibilidad)
    win.removeListener('hide', alCambiarVisibilidad)
  }

  return enPantalla
}

function quitar() {
  if (desatar) { try { desatar() } catch (e) {} ; desatar = null }
  if (capa && !capa.isDestroyed()) {
    try { capa.destroy() } catch (e) {}
  }
  capa = null
  if (principal && !principal.isDestroyed()) {
    try { principal.setContentProtection(false) } catch (e) {}
  }
  principal = null
  devolverOtras()
}

// Devuelve si el PIN era correcto; el renderer de la capa se encarga del aviso.
function desbloquear(valor) {
  const r = pin.verificar(String(valor || ''))
  if (r.match) quitar()
  return r
}

module.exports = {
  mostrar, quitar, bloqueado, desbloquear, taparNueva,
  setHabilitado, estaHabilitado,
}
