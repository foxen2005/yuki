// ¿Dos URLs son "el mismo sitio"? Es lo que decide si un enlace se queda en una
// ventana de Yuki (con la sesión de la app) o sale al navegador del sistema.
//
// No vale comparar el origen: drive.google.com visto desde mail.google.com es
// otro origen y es el mismo servicio (un adjunto de Drive enlazado en un
// correo). Tampoco vale quedarse con los dos últimos trozos del host: eso mete
// en el mismo saco a foo.co.uk y bar.co.uk.

// Este módulo es el ÚNICO sitio donde vive la regla. webview-preload.js tenía
// su propia copia y las dos se desincronizaron en cuanto esta aprendió a
// distinguir inquilinos y familias; ahora pregunta por IPC
// ('view:mismo-sitio', en ipc-handlers.js) porque con sandbox:true no puede
// requerir un archivo del proyecto. Si se cambia algo de aquí, no hay otra
// copia que tocar — pero sí hay un preload que depende de la respuesta.

// Sufijos de segundo nivel, por el último trozo: co.uk, com.ar, gob.cl…
const SUFIJOS_2N = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'gob'])

// Dominios donde cada subdominio es de otro dueño: ahí el sitio es el
// subdominio entero. Sin esto, un enlace a empresa-ajena.atlassian.net abierto
// desde el Jira propio entraría en una flotante de Yuki, sin barra de
// direcciones, como si fuera de la casa.
// Es una lista corta de los casos que se cruzan en el trabajo, no la Public
// Suffix List entera: lo que falte se comporta como antes.
// (sharepoint.com NO está aquí: lo reclama la familia de Microsoft, más abajo,
// y ponerlo en los dos sitios sería letra muerta.)
const SUFIJOS_PRIVADOS = new Set([
  'atlassian.net', 'zendesk.com', 'freshdesk.com',
  'service-now.com', 'myshopify.com', 'notion.site',
  'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev',
  'web.app', 'firebaseapp.com', 'herokuapp.com',
  'blob.core.windows.net',
])

// Una IP no tiene dominio: 192.168.1.5 y 10.0.1.5 acabarían compartiendo "1.5"
// y se tomarían por el mismo sitio. Entre servidores de la red local eso es
// justo lo que no se quiere.
const ES_IP = /^(\[|\d{1,3}(\.\d{1,3}){3}$)/

function dominioBase(host) {
  const h = String(host || '').toLowerCase()
  if (ES_IP.test(h)) return h
  const partes = h.split('.')
  if (partes.length < 2) return partes.join('.')

  // Primero los privados, y del más largo al más corto: blob.core.windows.net
  // tiene que ganarle a windows.net.
  const tope = Math.min(partes.length - 1, 4)
  for (let n = tope; n >= 2; n--) {
    if (SUFIJOS_PRIVADOS.has(partes.slice(-n).join('.'))) return partes.slice(-(n + 1)).join('.')
  }

  const n = (partes.length > 2 && SUFIJOS_2N.has(partes[partes.length - 2])) ? 3 : 2
  return partes.slice(-n).join('.')
}

// Servicios que reparten la misma cuenta entre varios dominios registrables.
// Sin esto, un adjunto de Teams (contoso.sharepoint.com abierto desde
// teams.microsoft.com) saldría al navegador sin sesión y pediría entrar otra
// vez — y como ese enlace lo abre JavaScript y no un <a>, el usuario tampoco
// tendría el clic derecho para arreglarlo.
//
// Contrapartida asumida y conocida: dentro de una familia no se distingue el
// inquilino, o sea que desde Outlook o Teams cualquier *.sharepoint.com cuenta
// como propio — también el de un enlace de phishing. Separar inquilinos aquí
// rompería justamente el caso que esto viene a salvar, y la flotante no se
// queda muda del todo: su título lleva el dominio real delante (ver
// _cablearFlotante), y el menú del clic derecho ofrece sacarla al navegador.
//
// Google no necesita familia: todo lo suyo (Gmail, Drive, Docs, Calendar) vive
// bajo google.com y ya lo resuelve el dominio registrable.
// Fuera googleusercontent.com a propósito: ahí cada subdominio sirve contenido
// subido por un usuario cualquiera, así que meterlo en la familia de Google
// dejaría entrar en una flotante — sin barra de direcciones — una página que
// puede haber puesto cualquiera. Los adjuntos y las miniaturas que viven en ese
// dominio se cargan dentro de la página o como descarga, no como ventana.
const FAMILIAS = [
  new Set([
    'microsoft.com', 'microsoftonline.com', 'office.com', 'office365.com',
    'sharepoint.com', 'onedrive.com', 'live.com', 'outlook.com',
  ]),
  new Set(['whatsapp.com', 'whatsapp.net']),
]

function familia(host) {
  const h = String(host || '').toLowerCase()
  if (!h) return null
  for (const f of FAMILIAS) {
    for (const d of f) if (h === d || h.endsWith('.' + d)) return f
  }
  return null
}

// true solo si se puede afirmar que ambas son del mismo sitio. Si una de las
// dos no se puede leer (about:blank, una URL rota), devuelve false: la duda
// manda el enlace al navegador, que es el destino inocuo.
function mismoSitio(a, b) {
  try {
    const ha = new URL(String(a)).hostname
    const hb = new URL(String(b)).hostname
    if (!ha || !hb) return false
    if (dominioBase(ha) === dominioBase(hb)) return true
    const fa = familia(ha)
    return !!fa && fa === familia(hb)
  } catch (e) { return false }
}

module.exports = { dominioBase, mismoSitio }
