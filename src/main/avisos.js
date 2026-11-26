// Avisos de Digital Fox: un banner que mandamos nosotros y que, una vez
// cerrado, no vuelve nunca.
//
// Sin servidor: un archivo estático en el repo. Publicar un aviso es editarlo y
// hacer commit; retirarlo, borrarlo del archivo. Si GitHub no contesta, no hay
// banner y la app sigue igual.
const { app, net } = require('electron')
const path = require('path')
const fs = require('fs')

const URL_AVISOS = 'https://raw.githubusercontent.com/foxen2005/yuki/master/avisos.json'

// Cada cuánto se vuelve a mirar. Es un archivo de texto de unos pocos cientos
// de bytes; cada 6 h es de sobra y sigue siendo más lento que el buscador de
// actualizaciones, que va cada 4.
const CADA_MS = 6 * 60 * 60 * 1000
// Nadie quiere publicidad a los diez segundos de instalar algo. El primer
// aviso no sale hasta pasado este tiempo desde el primer arranque.
const GRACIA_MS = 24 * 60 * 60 * 1000
// Un aviso es texto, no una novela: si llega algo mucho más largo es un error
// o un abuso, y en cualquier caso no cabe en el banner.
const MAX_TITULO = 120
const MAX_TEXTO = 400
const MAX_BOTON = 40
const MAX_RESPUESTA = 64 * 1024

const RUTA = () => path.join(app.getPath('userData'), 'avisos.json')

let estado = null
let cache = null       // { cuando, avisos }
let temporizador = null

function cargar() {
  if (estado) return estado
  try { estado = JSON.parse(fs.readFileSync(RUTA(), 'utf8')) } catch (e) { estado = {} }
  if (!Array.isArray(estado.cerrados)) estado.cerrados = []
  if (typeof estado.activados !== 'boolean') estado.activados = true
  // Marca de la primera vez: sirve para el periodo de gracia. Se escribe en el
  // primer arranque y no se vuelve a tocar.
  if (!estado.desde) { estado.desde = Date.now(); guardar() }
  return estado
}

function guardar() {
  try { fs.writeFileSync(RUTA(), JSON.stringify(estado, null, 2)) } catch (e) {}
}

function activados() { return cargar().activados !== false }

function activar(valor) {
  cargar()
  estado.activados = !!valor
  guardar()
  if (!estado.activados) { cache = null; detener() } else { arrancar() }
  return estado.activados
}

function cerrar(id) {
  if (typeof id !== 'string' || !id) return false
  cargar()
  if (!estado.cerrados.includes(id)) { estado.cerrados.push(id); guardar() }
  return true
}

// Compara "0.4.6" con "0.4.10" como números y no como texto, que diría que la
// segunda es menor.
function compararVersiones(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d < 0 ? -1 : 1
  }
  return 0
}

// Lo que llega de internet no se cree: todo lo que salga de aquí es texto
// recortado y, como mucho, una URL https. El renderer además lo pinta con
// textContent. Si esto devolviera HTML, cualquiera con acceso al archivo —o a
// la cuenta de GitHub— estaría ejecutando código dentro de Yuki, con las
// sesiones de Gmail y WhatsApp al lado.
function texto(valor, idiomaActual, tope) {
  let bruto = valor
  if (bruto && typeof bruto === 'object') {
    bruto = bruto[idiomaActual] || bruto['en'] || bruto['es'] || ''
  }
  if (typeof bruto !== 'string') return ''
  // Sin saltos de línea ni caracteres de control: el banner es de una o dos
  // líneas y un \n suelto lo descuadra.
  return bruto.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, tope)
}

function enlaceSeguro(valor) {
  if (typeof valor !== 'string') return null
  try {
    const u = new URL(valor)
    // Solo https. Un javascript: o un file: aquí sería una puerta trasera, y
    // http a secas invita a que alguien en medio cambie el destino.
    return u.protocol === 'https:' ? u.href : null
  } catch (e) { return null }
}

function descargar() {
  return new Promise((resolve) => {
    let peticion
    try {
      // net.request usa la pila de red de Chromium: respeta el proxy del
      // sistema, que es lo que hay en muchas oficinas.
      peticion = net.request({ method: 'GET', url: URL_AVISOS, useSessionCookies: false })
    } catch (e) { return resolve(null) }

    const corte = setTimeout(() => { try { peticion.abort() } catch (e) {} ; resolve(null) }, 10000)
    // Los trozos se guardan como Buffer y se decodifican de una sola vez al
    // final. Decodificando trozo a trozo, un carácter de varios bytes partido
    // entre dos llega como U+FFFD: un título con basura, o un JSON.parse que
    // falla y descarta todos los avisos sin decir nada.
    const trozos = []
    let largo = 0
    let abortado = false

    peticion.on('response', (res) => {
      if (res.statusCode !== 200) { clearTimeout(corte); try { peticion.abort() } catch (e) {} ; return resolve(null) }
      res.on('data', (trozo) => {
        if (abortado) return
        trozos.push(trozo)
        largo += trozo.length
        // Un archivo gigante no se termina de leer: ni lo necesitamos ni vamos
        // a guardarlo en memoria.
        if (largo > MAX_RESPUESTA) {
          abortado = true
          clearTimeout(corte)
          try { peticion.abort() } catch (e) {}
          resolve(null)
        }
      })
      res.on('end', () => {
        if (abortado) return
        clearTimeout(corte)
        try { resolve(JSON.parse(Buffer.concat(trozos).toString('utf8'))) } catch (e) { resolve(null) }
      })
      res.on('error', () => { clearTimeout(corte); resolve(null) })
    })
    peticion.on('error', () => { clearTimeout(corte); resolve(null) })
    try { peticion.end() } catch (e) { clearTimeout(corte); resolve(null) }
  })
}

async function refrescar() {
  if (!activados()) return
  const datos = await descargar()
  if (!datos || !Array.isArray(datos.avisos)) return
  cache = { cuando: Date.now(), avisos: datos.avisos.slice(0, 20) }
}

// El aviso que toca mostrar ahora mismo, o null. Uno a la vez: si hay varios
// vigentes gana el último del archivo y el resto espera a que ese se cierre.
function pendiente(idiomaActual) {
  if (!activados()) return null
  const st = cargar()
  if (Date.now() - (st.desde || 0) < GRACIA_MS) return null
  if (!cache || !Array.isArray(cache.avisos)) return null

  const hoy = new Date()
  const version = app.getVersion()

  for (let i = cache.avisos.length - 1; i >= 0; i--) {
    const a = cache.avisos[i]
    if (!a || typeof a !== 'object') continue
    const id = typeof a.id === 'string' ? a.id.slice(0, 80) : ''
    if (!id || st.cerrados.includes(id)) continue

    // Fechas: 'hasta' hace que un aviso caduque solo, aunque nadie lo haya
    // visto ni cerrado. Una fecha ilegible descarta el aviso en vez de
    // mostrarlo para siempre.
    if (a.desde) { const d = new Date(a.desde); if (isNaN(d) || hoy < d) continue }
    if (a.hasta) { const h = new Date(a.hasta); if (isNaN(h) || hoy > h) continue }

    if (a.versionMinima && compararVersiones(version, a.versionMinima) < 0) continue
    if (a.versionMaxima && compararVersiones(version, a.versionMaxima) > 0) continue

    const titulo = texto(a.titulo, idiomaActual, MAX_TITULO)
    const cuerpo = texto(a.texto, idiomaActual, MAX_TEXTO)
    if (!titulo && !cuerpo) continue

    // Un botón sin destino no hace nada: sin enlace no hay botón. Al revés sí
    // vale: 'boton' es opcional, y un aviso con enlace y sin texto de botón se
    // queda con la etiqueta genérica que pone el renderer.
    const enlace = enlaceSeguro(a.enlace)
    const boton = enlace ? texto(a.boton, idiomaActual, MAX_BOTON) : ''

    return { id, titulo, texto: cuerpo, boton: boton || null, enlace: enlace || null }
  }
  return null
}

function arrancar() {
  if (temporizador || !activados()) return
  // La primera consulta no va en el arranque: ahí la app está abriendo las
  // vistas y pidiendo la actualización, y esto no tiene ninguna prisa.
  temporizador = setTimeout(function vuelta() {
    refrescar().catch(() => {})
    temporizador = setTimeout(vuelta, CADA_MS)
  }, 60 * 1000)
}

function detener() {
  if (temporizador) { clearTimeout(temporizador); temporizador = null }
}

module.exports = { arrancar, detener, pendiente, cerrar, activados, activar }
