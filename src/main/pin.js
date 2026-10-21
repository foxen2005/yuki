// Almacenamiento del PIN de bloqueo.
// Estaba dentro de ipc-handlers.js, pero la ventana de bloqueo necesita
// verificar el PIN sin pasar por los manejadores del renderer principal.
const { app, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')

// app.getPath() no está disponible hasta que la app esté lista: se resuelve al
// primer uso en vez de al cargar el módulo.
function ruta() {
  return path.join(app.getPath('userData'), 'yuki-pin.enc')
}

// Marca del PIN guardado en claro (cuando el sistema no ofrece cifrado). Sin
// ella no hay forma fiable de distinguir "texto plano" de "bytes cifrados que
// no puedo descifrar", y adivinarlo por los caracteres rechazaba un PIN con
// acentos o emoji.
const MARCA_PLANO = 'yuki-pin-claro:'

function guardar(pin) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      fs.writeFileSync(ruta(), safeStorage.encryptString(pin))
    } else {
      fs.writeFileSync(ruta(), MARCA_PLANO + pin, 'utf8')
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

// Devuelve el PIN guardado, o null si no hay o no se puede leer.
//
// Lo segundo pasa de verdad: un archivo escrito en texto plano (safeStorage no
// disponible) que luego se intenta descifrar, o datos de DPAPI de OTRA cuenta
// de Windows tras restaurar una copia. Antes eso se confundía con "PIN
// incorrecto" y el usuario quedaba encerrado para siempre: la capa es modal, no
// sale en la barra de tareas y no se puede cerrar. Si el almacén no se puede
// leer, para Yuki es como no tener PIN y el bloqueo no se activa.
function leer() {
  try {
    const p = ruta()
    if (!fs.existsSync(p)) return null
    const crudo = fs.readFileSync(p)
    if (!crudo || !crudo.length) return null

    const texto = crudo.toString('utf8')
    if (texto.startsWith(MARCA_PLANO)) return texto.slice(MARCA_PLANO.length)

    // Sin marca puede ser cifrado, o texto plano de una versión anterior: la
    // marca no existía y el PIN se escribía tal cual. Primero se intenta
    // descifrar; si no, se acepta como texto plano heredado.
    if (safeStorage.isEncryptionAvailable()) {
      try { return safeStorage.decryptString(crudo) } catch (e) {}
    }

    // Un blob cifrado leído como texto trae bytes de control o el carácter de
    // reemplazo. Si no los tiene, es el PIN plano de antes. Descartarlo sin más
    // dejaba la app actualizándose a "sin PIN", o sea abierta de par en par.
    if (/[\u0000-\u0008\u000e-\u001f�]/.test(texto)) return null
    return texto
  } catch (e) { return null }
}

function verificar(pin) {
  const guardado = leer()
  if (guardado === null) return { match: false }
  return { match: guardado === pin }
}

function existe() {
  return leer() !== null
}

module.exports = { guardar, verificar, existe }
