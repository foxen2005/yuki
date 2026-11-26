// Comprueba los archivos de idioma antes de compilar.
//
// El inglés es la red de seguridad de todos los demás: una clave que le falte
// a un idioma cae a inglés, y si tampoco está ahí, al español. Por eso al
// inglés se le exige estar completo y al resto no — un francés al que le falte
// una cadena ve esa línea en inglés, que es molesto pero funciona; si faltara
// en inglés vería español, que para un francés no es mucho mejor que un hueco.
//
// Se corre en `npm run build` y `npm run release`. Falla con código 1, que
// corta el build.
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'src', 'i18n')
const FUENTE = 'es'
const OBLIGATORIO = 'en'
const { CODIGOS } = require('../src/shared/i18n')

const leer = (cod) => JSON.parse(fs.readFileSync(path.join(DIR, `${cod}.json`), 'utf8'))
// Las variables que el código rellena: {nombre}, {version}… Si una traducción
// se come una o la traduce, en pantalla sale el texto con un hueco o con la
// llave en crudo. Se compara el conjunto, no el orden: hay idiomas donde la
// frase se ordena distinto.
const variables = (s) => new Set((String(s).match(/\{(\w+)\}/g) || []))

let errores = []
let avisos = []

const fuente = leer(FUENTE)
// Las que empiezan por guion bajo son comentarios para quien traduce, no
// cadenas de la interfaz: cada idioma escribe el suyo y no se comparan.
const clavesFuente = Object.keys(fuente).filter(k => !k.startsWith('_'))

for (const cod of CODIGOS) {
  if (cod === FUENTE) continue
  let datos
  try { datos = leer(cod) } catch (e) {
    errores.push(`${cod}.json no se puede leer: ${e.message}`)
    continue
  }
  const faltan = clavesFuente.filter(k => typeof datos[k] !== 'string')
  const sobran = Object.keys(datos).filter(k => !k.startsWith('_') && !(k in fuente))

  if (faltan.length) {
    const linea = `${cod}: faltan ${faltan.length} claves → ${faltan.slice(0, 8).join(', ')}${faltan.length > 8 ? '…' : ''}`
    // Solo el inglés corta el build.
    ;(cod === OBLIGATORIO ? errores : avisos).push(linea)
  }
  if (sobran.length) {
    avisos.push(`${cod}: ${sobran.length} claves que ya no existen en ${FUENTE} → ${sobran.slice(0, 8).join(', ')}`)
  }

  // Las variables sí se exigen en todos: una mal copiada es un texto roto a la
  // vista, no una frase sin traducir.
  for (const k of clavesFuente) {
    if (typeof datos[k] !== 'string') continue
    const a = variables(fuente[k])
    const b = variables(datos[k])
    const perdidas = [...a].filter(v => !b.has(v))
    const inventadas = [...b].filter(v => !a.has(v))
    if (perdidas.length || inventadas.length) {
      errores.push(`${cod} · ${k}: variables distintas (faltan ${perdidas.join(',') || '—'}; sobran ${inventadas.join(',') || '—'})`)
    }
  }
}

for (const a of avisos) console.warn('  aviso  ' + a)
if (errores.length) {
  console.error('\nLos archivos de idioma no están bien:\n')
  for (const e of errores) console.error('  ERROR  ' + e)
  console.error('')
  process.exit(1)
}
console.log(`idiomas OK — ${clavesFuente.length} claves × ${CODIGOS.length} idiomas`)
