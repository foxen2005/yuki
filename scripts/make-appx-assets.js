// Genera los logos que exige un paquete AppX/MSIX para Microsoft Store,
// a partir de icons/icon.png (512×512). electron-builder los toma de
// build/appx/; si no están, mete sus propias imágenes de relleno y la ficha
// de la tienda quedaría con el logo de electron-builder.
//
// Uso:  npx electron scripts/make-appx-assets.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const SRC = path.join(__dirname, '..', 'icons', 'icon.png')
const OUT = path.join(__dirname, '..', 'build', 'appx')
// Logos que se suben a mano en la ficha de la tienda (sección «Imágenes para
// mostrar en Store»). No van dentro del paquete: sirven para que el listado se
// vea nítido en vez de reescalar los del .appx.
const OUT_FICHA = path.join(__dirname, '..', 'store-shots', 'logos')
const LOGOS_FICHA = { 'ficha-300x300.png': 300, 'ficha-150x150.png': 150, 'ficha-71x71.png': 71 }

// nombre → [ancho, alto, proporción del lado menor que ocupa el logo]
const ASSETS = {
  'Square44x44Logo.png':   [44, 44, 1],
  'Square71x71Logo.png':   [71, 71, 1],
  'Square150x150Logo.png': [150, 150, 1],
  'Square310x310Logo.png': [310, 310, 1],
  'StoreLogo.png':         [50, 50, 1],
  // Las anchas y el splash llevan el logo centrado sobre fondo transparente:
  // el color de la baldosa lo pone backgroundColor en package.json
  'Wide310x150Logo.png':   [310, 150, 0.62],
  'SplashScreen.png':      [620, 300, 0.55],
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  if (!fs.existsSync(SRC)) { console.error('Falta', SRC); return app.quit() }
  fs.mkdirSync(OUT, { recursive: true })

  const b64src = fs.readFileSync(SRC).toString('base64')
  const win = new BrowserWindow({ show: false, width: 100, height: 100, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<body></body>')

  const hechos = []
  for (const [nombre, [w, h, escala]] of Object.entries(ASSETS)) {
    const b64 = await win.webContents.executeJavaScript(`new Promise(res => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = ${w}; c.height = ${h}
        const ctx = c.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        const lado = Math.min(${w}, ${h}) * ${escala}
        ctx.drawImage(img, (${w} - lado) / 2, (${h} - lado) / 2, lado, lado)
        res(c.toDataURL('image/png').split(',')[1])
      }
      img.onerror = () => res(null)
      img.src = 'data:image/png;base64,${b64src}'
    })`)
    if (!b64) { console.error('No se pudo generar', nombre); continue }
    const buf = Buffer.from(b64, 'base64')
    fs.writeFileSync(path.join(OUT, nombre), buf)
    hechos.push(`${nombre} ${w}x${h} (${(buf.length / 1024).toFixed(1)} KB)`)
  }

  console.log('\nGenerados en build/appx:\n  ' + hechos.join('\n  '))

  // Logos de la ficha: mismo icono, sin márgenes, en los tamaños exactos que
  // pide «Imágenes para mostrar en Store». Se suben a mano en Partner Center.
  fs.mkdirSync(OUT_FICHA, { recursive: true })
  const deFicha = []
  for (const [nombre, lado] of Object.entries(LOGOS_FICHA)) {
    const b64 = await win.webContents.executeJavaScript(`new Promise(res => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = c.height = ${lado}
        const ctx = c.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, ${lado}, ${lado})
        res(c.toDataURL('image/png').split(',')[1])
      }
      img.onerror = () => res(null)
      img.src = 'data:image/png;base64,${b64src}'
    })`)
    if (!b64) continue
    const buf = Buffer.from(b64, 'base64')
    fs.writeFileSync(path.join(OUT_FICHA, nombre), buf)
    deFicha.push(`${nombre} (${(buf.length / 1024).toFixed(1)} KB)`)
  }
  console.log('\nLogos de la ficha en store-shots/logos:\n  ' + deFicha.join('\n  '))

  app.quit()
})
