// El idioma de Yuki: dónde se guarda, cómo se adivina la primera vez y cómo lo
// lee el resto de la aplicación.
//
// Vive en un archivo de userData y no en el localStorage del renderer, como el
// resto de los ajustes, porque hay tres sitios que lo necesitan fuera de él:
// los menús contextuales y los diálogos nativos (proceso principal), el menú de
// la bandeja, y la ventana de bloqueo, que puede aparecer ANTES que el
// renderer en un arranque en frío. Mismo patrón que permissions.json y
// yuki-pin.enc.
const { app, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { IDIOMAS, CODIGOS, RESPALDOS, normalizar, esIdiomaValido, crearTraductor } = require('../shared/i18n')

// Los paquetes se cargan con require y no leyendo el archivo: así van dentro
// del asar y electron-builder los empaqueta sin configuración extra.
const PAQUETES = {
  'es':    require('../i18n/es.json'),
  'en':    require('../i18n/en.json'),
  'pt-BR': require('../i18n/pt-BR.json'),
  'fr':    require('../i18n/fr.json'),
}

const RUTA = () => path.join(app.getPath('userData'), 'idioma.json')

let actual = null
let traducir = null

function detectar() {
  // app.getLocale() es el idioma de Windows, que es exactamente el que usó el
  // instalador NSIS para elegir el suyo. Por eso "instalado en inglés → app en
  // inglés" sale solo, sin que el instalador tenga que pasarle nada a la app.
  const delSistema = normalizar(app.getLocale())
  if (delSistema) return delSistema
  // Segundo intento con la lista completa de preferencias del usuario: alguien
  // con Windows en japonés puede tener el inglés o el español como segundo.
  try {
    for (const l of app.getPreferredSystemLanguages() || []) {
      const n = normalizar(l)
      if (n) return n
    }
  } catch (e) {}
  // Ni rastro: inglés. Es lo que entiende más gente de la que no está en la
  // lista, y dejar la app en español a un sueco sería peor.
  return 'en'
}

function cargar() {
  if (actual) return actual
  let guardado = null
  try { guardado = JSON.parse(fs.readFileSync(RUTA(), 'utf8')).idioma } catch (e) {}
  // Lo guardado manda sobre el sistema: si el usuario eligió español en un
  // Windows en inglés, cambiar el idioma de Windows no se lo puede pisar.
  actual = esIdiomaValido(guardado) ? guardado : detectar()
  traducir = crearTraductor(PAQUETES, actual)
  return actual
}

function fijar(codigo) {
  if (!esIdiomaValido(codigo)) return false
  actual = codigo
  traducir = crearTraductor(PAQUETES, actual)
  try { fs.writeFileSync(RUTA(), JSON.stringify({ idioma: codigo }, null, 2)) } catch (e) {}
  return true
}

function idioma() { return cargar() }

function t(clave, vars) {
  if (!traducir) cargar()
  return traducir(clave, vars)
}

// Lo que se le manda al renderer y a la ventana de bloqueo: solo las cadenas,
// ya resueltas contra los respaldos, para que del otro lado no haya que repetir
// la lógica de búsqueda.
function paquete() {
  const cod = cargar()
  const plano = {}
  for (const fuente of [...RESPALDOS].reverse().concat(cod)) {
    Object.assign(plano, PAQUETES[fuente] || {})
  }
  return { idioma: cod, idiomas: IDIOMAS, textos: plano }
}

// Este se registra aquí y no en ipc-handlers.js a propósito. Lo pide el
// preload nada más crearse la ventana, y createWindow() corre ANTES que
// registerHandlers(): hoy funciona solo porque el preload no llega a ejecutarse
// hasta el siguiente tick, pero eso es una carrera esperando a perderse. Al
// vivir en el módulo que lo contesta, queda registrado en cuanto alguien
// requiere idioma.js, que es lo primero que hace window.js.
//
// Síncrono porque si llegara después la interfaz se vería un instante en
// español y luego saltaría al idioma bueno.
ipcMain.on('i18n:paquete', (event) => { event.returnValue = paquete() })

module.exports = { idioma, fijar, t, paquete, CODIGOS, IDIOMAS }
