// Permisos de las apps web.
// Antes se concedía todo (cámara, micrófono, ubicación…) a cualquier URL que
// el usuario agregara. Ahora:
//   - lo inofensivo se concede sin preguntar (notificaciones, portapapeles, pantalla completa…)
//   - lo sensible se pregunta UNA vez por (origen, permiso) y se recuerda en userData/permissions.json
//   - lo que Yuki no necesita se niega siempre (MIDI, HID, serial, USB)
const { app, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const ALWAYS_ALLOW = new Set([
  'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen',
  'background-sync', 'idle-detection', 'window-management', 'storage-access',
  'top-level-storage-access', 'persistent-storage', 'keyboardLock', 'pointerLock',
])
const ALWAYS_DENY = new Set(['midi', 'midiSysex', 'hid', 'serial', 'usb'])
// openExternal = links mailto:/tel: → los abre el sistema, era el comportamiento
// anterior. fileSystem = showSaveFilePicker() (descargar adjuntos desde la app).
ALWAYS_ALLOW.add('openExternal'); ALWAYS_ALLOW.add('fileSystem')
const ASK = new Set(['media', 'geolocation', 'display-capture', 'mediaKeySystem', 'speaker-selection'])

// 'media' es un único permiso de Chromium que cubre cámara y micrófono. Se
// guarda desglosado en dos decisiones para poder, por ejemplo, dejar el
// micrófono permitido y la cámara bloqueada.
const MEDIA_AUDIO = 'media:audio'
const MEDIA_VIDEO = 'media:video'

const LABELS = {
  [MEDIA_AUDIO]: 'usar el micrófono',
  [MEDIA_VIDEO]: 'usar la cámara',
  geolocation: 'conocer tu ubicación',
  'display-capture': 'capturar tu pantalla',
  mediaKeySystem: 'reproducir contenido protegido (DRM)',
  'speaker-selection': 'elegir el dispositivo de salida de audio',
}

let store = null
const STORE_PATH = () => path.join(app.getPath('userData'), 'permissions.json')

function load() {
  if (store) return store
  try { store = JSON.parse(fs.readFileSync(STORE_PATH(), 'utf8')) } catch { store = {} }

  // Migración: las decisiones viejas eran un único 'media' para cámara y
  // micrófono juntos. Se reparte el mismo valor a los dos para no volver a
  // preguntar, y desde ahí cada uno se puede cambiar por separado.
  let migrado = false
  for (const k of Object.keys(store)) {
    if (!k.endsWith('|media')) continue
    const origen = k.slice(0, -'|media'.length)
    const valor = store[k]
    if (store[`${origen}|${MEDIA_AUDIO}`] === undefined) store[`${origen}|${MEDIA_AUDIO}`] = valor
    if (store[`${origen}|${MEDIA_VIDEO}`] === undefined) store[`${origen}|${MEDIA_VIDEO}`] = valor
    delete store[k]
    migrado = true
  }
  if (migrado) save()

  return store
}
function save() {
  try { fs.writeFileSync(STORE_PATH(), JSON.stringify(load(), null, 2)) } catch {}
}
function key(origin, permission) { return `${origin}|${permission}` }

// Evita abrir dos diálogos por la misma pregunta (las páginas suelen pedir en ráfaga)
const pending = new Map()

// Pregunta por una o varias claves a la vez y guarda la misma respuesta en
// todas. Una videollamada pide cámara y micrófono juntos: Electron entrega un
// solo callback, así que no se puede conceder a medias; se pregunta una vez y
// después cada dispositivo se ajusta por separado en Configuración.
async function ask(win, origin, claves, textos) {
  const p = dialog.showMessageBox(win, {
    type: 'question',
    title: 'Permiso',
    message: `${origin} quiere ${textos.join(' y ')}`,
    detail: 'Yuki recordará tu decisión para este sitio. Puedes cambiarla, por dispositivo, en Configuración → Permisos de sitios.',
    buttons: ['Permitir', 'Bloquear'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }).then(({ response }) => {
    const allowed = response === 0
    const s = load()
    for (const c of claves) s[key(origin, c)] = allowed
    save()
    for (const c of claves) pending.delete(key(origin, c))
    return allowed
  }).catch(() => {
    // Si el diálogo falla (ventana cerrada, por ejemplo) hay que soltar las
    // entradas igualmente: si no, el permiso queda esperando para siempre.
    for (const c of claves) pending.delete(key(origin, c))
    return false
  })
  // Se registra por dispositivo, no por el grupo preguntado: así una ráfaga de
  // peticiones solapadas espera el diálogo en curso en vez de apilar ventanas.
  for (const c of claves) pending.set(key(origin, c), p)
  return p
}

// Electron entrega requestingOrigin como 'https://host/' (con barra) y el
// request handler guarda 'https://host' (URL.origin): normalizar siempre.
function originOf(wc, requestingUrl) {
  try { return new URL(requestingUrl || wc.getURL()).origin } catch { return 'desconocido' }
}

// Qué claves hacen falta para atender una petición. 'media' se traduce a los
// dispositivos concretos que pide la página.
function clavesDe(permission, details) {
  if (permission !== 'media') return [permission]
  const tipos = details?.mediaTypes
  if (!tipos || !tipos.length) return [MEDIA_AUDIO, MEDIA_VIDEO]
  const out = []
  if (tipos.includes('audio')) out.push(MEDIA_AUDIO)
  if (tipos.includes('video')) out.push(MEDIA_VIDEO)
  return out.length ? out : [MEDIA_AUDIO, MEDIA_VIDEO]
}

function attach(ses, win) {
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
   // El callback SIEMPRE tiene que llamarse, y exactamente una vez: si esta
   // función lanza, la promesa de permisos de la página se queda colgada; y si
   // el propio callback falla (marco destruido mientras el diálogo estaba
   // abierto), el catch no debe volver a invocarlo.
   let respondido = false
   const responder = (v) => {
     if (respondido) return
     respondido = true
     try { callback(v) } catch (e) {}
   }
   try {
    if (ALWAYS_ALLOW.has(permission)) return responder(true)
    if (ALWAYS_DENY.has(permission)) return responder(false)
    if (!ASK.has(permission)) return responder(false)

    const origin = originOf(wc, details?.requestingUrl)
    const claves = clavesDe(permission, details)

    // Las páginas piden en ráfaga (audio, y acto seguido audio+vídeo), así que
    // la decisión se reevalúa en cada vuelta: si hay un diálogo abierto por
    // alguno de estos dispositivos se espera y se vuelve a mirar, en lugar de
    // apilar ventanas preguntando dos veces lo mismo.
    for (;;) {
      const s = load()

      // Si alguno de los dispositivos pedidos está bloqueado, se deniega todo:
      // Electron entrega un solo callback y no permite conceder a medias. Es el
      // mismo comportamiento que Chrome: la página debe pedirlos por separado.
      if (claves.some(c => s[key(origin, c)] === false)) return responder(false)
      // Todos permitidos: adelante sin molestar
      if (claves.every(c => s[key(origin, c)] === true)) return responder(true)

      // Se espera por cualquier diálogo de medios del mismo origen, no solo por
      // los dispositivos de esta petición: si una página pide micrófono y
      // cámara en dos llamadas simultáneas, saldrían dos ventanas a la vez.
      const vigilar = permission === 'media' ? [MEDIA_AUDIO, MEDIA_VIDEO] : claves
      const enCurso = vigilar.map(c => pending.get(key(origin, c))).filter(Boolean)
      if (enCurso.length) { await Promise.all(enCurso).catch(() => {}); continue }

      const faltan = claves.filter(c => s[key(origin, c)] === undefined)
      return responder(await ask(win, origin, faltan, faltan.map(c => LABELS[c] || c)))
    }
   } catch (e) {
     responder(false)
   }
  })

  // Consulta síncrona (navigator.permissions.query). Sin decisión guardada se
  // responde "sí": si dijéramos "no", sitios como WhatsApp leen "denegado",
  // muestran su propio aviso y nunca llegan a pedir el permiso, así que el
  // diálogo de arriba no se dispara jamás. El request handler sigue preguntando.
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (ALWAYS_ALLOW.has(permission)) return true
    if (ALWAYS_DENY.has(permission)) return false
    // Solo para lo que se pregunta; el resto sigue denegado también aquí.
    // Trade-off conocido: con 'media' en "sí" provisional, enumerateDevices()
    // muestra los nombres de cámara/micrófono antes del diálogo (no el acceso).
    if (!ASK.has(permission)) return false
    // details.mediaType dice si preguntan por el micrófono o por la cámara
    const origin = originOf(wc, requestingOrigin)
    const s = load()
    if (permission === 'media') {
      const tipo = details && details.mediaType
      if (tipo === 'audio') return s[key(origin, MEDIA_AUDIO)] !== false
      if (tipo === 'video') return s[key(origin, MEDIA_VIDEO)] !== false
      // Sin especificar: basta con que no haya ninguno bloqueado
      return s[key(origin, MEDIA_AUDIO)] !== false && s[key(origin, MEDIA_VIDEO)] !== false
    }
    return s[key(origin, permission)] !== false
  })
}

function reset() { store = {}; save() }

// Para el editor de Configuración
function list() {
  return Object.entries(load()).map(([k, allowed]) => {
    const [origin, permission] = k.split('|')
    return { origin, permission, label: LABELS[permission] || permission, allowed }
  })
}
function set(origin, permission, allowed) { load()[key(origin, permission)] = !!allowed; save() }
function remove(origin, permission) { delete load()[key(origin, permission)]; save() }

module.exports = { attach, reset, list, set, remove }
