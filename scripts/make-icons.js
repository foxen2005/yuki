// Genera los íconos planos del catálogo: baja los SVG de Simple Icons (licencia
// CC0) y los rasteriza a PNG 64×64 en icons/apps/.
//
// Por qué existe: antes el catálogo usaba dos .apng de 400×400 y 61 fotogramas.
// Un APNG se guarda descomprimido en RAM para animarlo: 400*400*4*61 = 37 MB
// POR ÍCONO, para dibujar 40×40 px en el sidebar. Con 6 apps usándolos eran
// ~223 MB de RAM permanentes. Un PNG plano de 64×64 son 16 KB descomprimido.
//
// Uso:  npx electron scripts/make-icons.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const https = require('https')

const OUT = path.join(__dirname, '..', 'icons', 'apps')
const SIZE = 64

// slug de Simple Icons → color de marca. Los íconos negros (x, github, notion)
// van en blanco porque el sidebar es oscuro.
const ICONS = {
  whatsapp: '25D366', telegram: '26A5E4', discord: '5865F2', slack: '4A154B',
  microsoftteams: '6264A7', signal: '3A76F0', skype: '00AFF0', messenger: '00B2FF',
  instagram: 'E4405F', x: 'FFFFFF', linkedin: '0A66C2',
  gmail: 'EA4335', microsoftoutlook: '0078D4', protonmail: '6D4AFF', yahoo: '6001D2',
  notion: 'FFFFFF', trello: '0052CC', asana: 'F06A6A',
  todoist: 'E44332', googlecalendar: '4285F4', googledrive: '4285F4',
  jira: '0052CC', github: 'FFFFFF', figma: 'F24E1E',
  googlemeet: '00AC47', zoom: '0B5CFF', webex: '048C4A',
}

// Marcas que Simple Icons retiró de su CDN actual (por peticiones de marca
// registrada) pero que siguen publicadas en versiones anteriores del paquete.
// Esos SVG vienen monocromos, hay que pintarlos a mano.
const LEGACY = { slack: 13, linkedin: 13, skype: 11, microsoftteams: 11, microsoftoutlook: 11, yahoo: 9 }

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'yuki-icon-builder' } }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => resolve(body))
    }).on('error', reject)
  })
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<body></body>')

  const ok = [], fail = []
  for (const [slug, color] of Object.entries(ICONS)) {
    try {
      let svg
      try {
        svg = await get(`https://cdn.simpleicons.org/${slug}/${color}`)
      } catch (e) {
        if (!LEGACY[slug]) throw e
        svg = await get(`https://cdn.jsdelivr.net/npm/simple-icons@${LEGACY[slug]}/icons/${slug}.svg`)
        // El paquete entrega el glifo sin color: pintarlo con el de la marca
        svg = svg.replace('<svg', `<svg fill="#${color}"`)
      }
      // Simple Icons entrega viewBox sin width/height; sin tamaño explícito
      // Chromium no puede dibujar el <img> en el canvas.
      if (!/\swidth=/.test(svg)) svg = svg.replace('<svg', `<svg width="${SIZE}" height="${SIZE}"`)

      const b64 = await win.webContents.executeJavaScript(`new Promise(res => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = c.height = ${SIZE}
          const ctx = c.getContext('2d')
          // 8% de margen para que el glifo no toque el borde del botón
          const pad = ${SIZE} * 0.08
          ctx.drawImage(img, pad, pad, ${SIZE} - pad * 2, ${SIZE} - pad * 2)
          res(c.toDataURL('image/png').split(',')[1])
        }
        img.onerror = () => res(null)
        img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))}
      })`)

      if (!b64) throw new Error('no rasterizó')
      const buf = Buffer.from(b64, 'base64')
      fs.writeFileSync(path.join(OUT, `${slug}.png`), buf)
      ok.push(`${slug} (${(buf.length / 1024).toFixed(1)} KB)`)
    } catch (e) {
      fail.push(`${slug}: ${e.message}`)
    }
  }

  console.log(`\nOK (${ok.length}): ${ok.join(', ')}`)
  if (fail.length) console.log(`\nFALLARON (${fail.length}): ${fail.join(' | ')}`)
  app.quit()
})
