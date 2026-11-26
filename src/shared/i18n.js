// Lo común entre el proceso principal y el renderer: qué idiomas hay, cómo se
// normaliza el código que da Windows y cómo se busca una clave.
//
// Sin dependencias de Electron a propósito: este archivo lo usa el proceso
// principal con require, y su contenido viaja al renderer dentro del paquete de
// textos. Meter aquí 'electron' rompería lo segundo.

// El orden es el del desplegable de Configuración. Cada nombre va escrito en su
// propio idioma: quien se equivocó de idioma tiene que poder volver, y
// «Spanish» no le dice nada a quien solo lee español.
const IDIOMAS = [
  { codigo: 'es',    nombre: 'Español' },
  { codigo: 'en',    nombre: 'English' },
  { codigo: 'pt-BR', nombre: 'Português (Brasil)' },
  { codigo: 'fr',    nombre: 'Français' },
]

const CODIGOS = IDIOMAS.map(i => i.codigo)

// Inglés y no español: es la fuente original, pero un francés al que le falte
// una clave entiende antes el inglés. El español queda como último recurso
// porque es el único que está completo por construcción.
const RESPALDOS = ['en', 'es']

// Lo que devuelve app.getLocale() ('en-GB', 'pt-BR', 'es-419'…) al código que
// usamos. El portugués es el único donde la región importa: pt-BR y pt-PT no se
// escriben igual y solo tenemos el de Brasil.
function normalizar(locale) {
  const bruto = String(locale || '').replace('_', '-')
  if (!bruto) return null
  if (/^pt-br$/i.test(bruto)) return 'pt-BR'
  const base = bruto.split('-')[0].toLowerCase()
  // pt-PT y 'pt' a secas NO caen en el de Brasil. A un portugués, el
  // portugués de Brasil le chirría más que el inglés, y solo tenemos ese.
  // (El pt-BR ya salió arriba.)
  if (base === 'pt') return null
  return CODIGOS.includes(base) ? base : null
}

function esIdiomaValido(codigo) {
  return CODIGOS.includes(codigo)
}

// Devuelve t(clave, vars). Las claves que falten caen a los respaldos y, si no
// están en ninguno, devuelven la propia clave: en pantalla se ve 'config.titulo'
// en vez de un hueco, que es más fácil de cazar y menos feo que 'undefined'.
function crearTraductor(paquetes, idioma) {
  const cadena = (clave) => {
    for (const cod of [idioma, ...RESPALDOS]) {
      const p = paquetes[cod]
      if (p && typeof p[clave] === 'string') return p[clave]
    }
    return clave
  }
  return function t(clave, vars) {
    let texto = cadena(clave)
    if (vars) {
      // {nombre} se sustituye por vars.nombre. Nada más: ni expresiones ni
      // formato, para que un archivo de idioma no pueda ejecutar nada.
      texto = texto.replace(/\{(\w+)\}/g, (m, k) =>
        Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m)
    }
    return texto
  }
}

module.exports = { IDIOMAS, CODIGOS, RESPALDOS, normalizar, esIdiomaValido, crearTraductor }
