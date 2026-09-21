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

const LABELS = {
  media: 'usar la cámara y/o el micrófono',
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
  return store
}
function save() {
  try { fs.writeFileSync(STORE_PATH(), JSON.stringify(load(), null, 2)) } catch {}
}
function key(origin, permission) { return `${origin}|${permission}` }

// Evita abrir dos diálogos por la misma pregunta (las páginas suelen pedir en ráfaga)
const pending = new Map()

async function ask(win, origin, permission, details) {
  const k = key(origin, permission)
  if (pending.has(k)) return pending.get(k)

  const what = LABELS[permission] || permission
  const extra = permission === 'media' && details?.mediaTypes?.length
    ? ` (${details.mediaTypes.map(t => t === 'video' ? 'cámara' : 'micrófono').join(' y ')})` : ''

  const p = dialog.showMessageBox(win, {
    type: 'question',
    title: 'Permiso',
    message: `${origin} quiere ${what}${extra}`,
    detail: 'Yuki recordará tu decisión para este sitio. Puedes cambiarla en Configuración → Permisos de sitios.',
    buttons: ['Permitir', 'Bloquear'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }).then(({ response }) => {
    const allowed = response === 0
    load()[k] = allowed
    save()
    pending.delete(k)
    return allowed
  })
  pending.set(k, p)
  return p
}

// Electron entrega requestingOrigin como 'https://host/' (con barra) y el
// request handler guarda 'https://host' (URL.origin): normalizar siempre.
function originOf(wc, requestingUrl) {
  try { return new URL(requestingUrl || wc.getURL()).origin } catch { return 'desconocido' }
}

function attach(ses, win) {
  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    if (ALWAYS_ALLOW.has(permission)) return callback(true)
    if (ALWAYS_DENY.has(permission)) return callback(false)
    const origin = originOf(wc, details?.requestingUrl)
    const saved = load()[key(origin, permission)]
    if (saved !== undefined) return callback(saved)
    if (!ASK.has(permission)) return callback(false)
    callback(await ask(win, origin, permission, details))
  })

  // Consulta síncrona (navigator.permissions.query). Sin decisión guardada se
  // responde "sí": si dijéramos "no", sitios como WhatsApp leen "denegado",
  // muestran su propio aviso y nunca llegan a pedir el permiso, así que el
  // diálogo de arriba no se dispara jamás. El request handler sigue preguntando.
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    if (ALWAYS_ALLOW.has(permission)) return true
    if (ALWAYS_DENY.has(permission)) return false
    // Solo para lo que se pregunta; el resto sigue denegado también aquí.
    // Trade-off conocido: con 'media' en "sí" provisional, enumerateDevices()
    // muestra los nombres de cámara/micrófono antes del diálogo (no el acceso).
    if (!ASK.has(permission)) return false
    const saved = load()[key(originOf(wc, requestingOrigin), permission)]
    return saved !== false
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
