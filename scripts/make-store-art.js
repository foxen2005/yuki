// Genera el arte promocional de la ficha de Microsoft Store:
//   Arte de póster 9:16  — logotipo principal en clientes Windows 10/11
//   Arte de caja 1:1     — se usa en varios diseños de la tienda
//   Imagen de superhéroe 16:9 — cabecera de la ficha
//
// Son piezas promocionales, no iconos: llevan la mascota sobre el fondo de
// marca (índigo casi negro con halo violeta, igual que la app y la web).
// Sin texto a propósito: la tienda ya dibuja el nombre del producto encima y
// duplicarlo se ve mal, además de que la imagen 16:9 lo prohíbe.
//
// Uso:  npx electron scripts/make-store-art.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const RAIZ = path.join(__dirname, '..')
const OUT = path.join(RAIZ, 'store-shots', 'arte')
// El PNG matriz de la raíz (1254×1254) tiene más resolución que icons/icon.png
const MATRIZ = path.join(RAIZ, 'Mascota Nube con Burbuja de Chat no borrar.png')
const RESPALDO = path.join(RAIZ, 'icons', 'icon.png')

// nombre → [ancho, alto, proporción del lado menor que ocupa la mascota]
const PIEZAS = {
  'poster-9x16-1440x2160.png': [1440, 2160, 0.78],
  'caja-1x1-2160x2160.png':    [2160, 2160, 0.62],
  'superheroe-16x9-1920x1080.png': [1920, 1080, 0.70],
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const src = fs.existsSync(MATRIZ) ? MATRIZ : RESPALDO
  if (!fs.existsSync(src)) { console.error('No hay imagen de origen'); return app.quit() }
  fs.mkdirSync(OUT, { recursive: true })

  const b64src = fs.readFileSync(src).toString('base64')
  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<body></body>')

  const hechas = []
  for (const [nombre, [w, h, escala]] of Object.entries(PIEZAS)) {
    const b64 = await win.webContents.executeJavaScript(`new Promise(res => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = ${w}; c.height = ${h}
        const ctx = c.getContext('2d')

        // Fondo de marca: índigo casi negro con halo violeta detrás de la mascota
        ctx.fillStyle = '#0a0814'
        ctx.fillRect(0, 0, ${w}, ${h})
        const halo = ctx.createRadialGradient(
          ${w} / 2, ${h} / 2, 0,
          ${w} / 2, ${h} / 2, Math.max(${w}, ${h}) * 0.55
        )
        halo.addColorStop(0,    'rgba(124, 58, 237, 0.55)')
        halo.addColorStop(0.45, 'rgba(124, 58, 237, 0.18)')
        halo.addColorStop(1,    'rgba(124, 58, 237, 0)')
        ctx.fillStyle = halo
        ctx.fillRect(0, 0, ${w}, ${h})

        // Mascota centrada, cuadrada, sin deformar
        const lado = Math.min(${w}, ${h}) * ${escala}
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, (${w} - lado) / 2, (${h} - lado) / 2, lado, lado)

        res(c.toDataURL('image/png').split(',')[1])
      }
      img.onerror = () => res(null)
      img.src = 'data:image/png;base64,${b64src}'
    })`)

    if (!b64) { console.error('No se pudo generar', nombre); continue }
    const buf = Buffer.from(b64, 'base64')
    fs.writeFileSync(path.join(OUT, nombre), buf)
    hechas.push(`${nombre}  ${w}x${h}  ${(buf.length / 1024).toFixed(0)} KB`)
  }

  console.log(`\nOrigen: ${path.basename(src)}`)
  console.log('Arte en store-shots/arte:\n  ' + hechas.join('\n  '))
  app.quit()
})
