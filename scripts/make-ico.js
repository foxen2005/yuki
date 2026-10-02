// Genera icons/icon.ico a partir de icons/icon.png.
//
// El .ico lo usan el instalador NSIS, la ventana y el icono de la bandeja.
// Lleva varias resoluciones dentro: Windows elige la que corresponde según
// dónde lo dibuje (bandeja 16/20/24, barra de tareas 32, escritorio 48,
// vistas grandes 256). Si solo hubiera un tamaño, Windows lo reescala y se ve
// sucio en la bandeja.
//
// Uso:  node scripts/make-ico.js
const path = require('path')
const fs = require('fs')
// El paquete exporta en forma ESM interop: la función está en .default
const pngToIco = require('png-to-ico').default

const SRC = path.join(__dirname, '..', 'icons', 'icon.png')
const DEST = path.join(__dirname, '..', 'icons', 'icon.ico')

pngToIco(SRC)
  .then(buf => {
    fs.writeFileSync(DEST, buf)
    console.log(`icon.ico generado: ${(buf.length / 1024).toFixed(1)} KB`)
  })
  .catch(e => {
    console.error('Error generando el .ico:', e.message)
    process.exit(1)
  })
