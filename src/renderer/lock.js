// Pantalla de bloqueo. Lo único que puede hacer es comprobar un PIN: su
// preload no expone nada más.
const campo = document.getElementById('pin')
const aviso = document.getElementById('aviso')
let fallos = 0

// Los textos llegan por el preload. Si faltara alguno se queda el del HTML, que
// está en español: es preferible a dejar el hueco en blanco en la única
// pantalla desde la que se puede volver a entrar.
const TEXTOS = (window.yukiLock && window.yukiLock.textos) || {}
const t = (clave, vars) => {
  let s = TEXTOS[clave]
  if (typeof s !== 'string') return null
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
  return s
}
const ponerTexto = (id, clave) => {
  const el = document.getElementById(id)
  const s = t(clave)
  if (el && s) el.textContent = s
}
ponerTexto('lock-titulo', 'lock.titulo')
ponerTexto('lock-sub', 'lock.aviso')
if (t('lock.titulo')) document.title = t('lock.titulo')

// El foco se pierde si el usuario pincha en otra app y vuelve. Sin esto, al
// volver no se puede escribir y la pantalla parece colgada.
window.addEventListener('focus', () => campo.focus())
campo.addEventListener('blur', () => setTimeout(() => campo.focus(), 50))

function fallar() {
  fallos++
  campo.classList.remove('temblor')
  void campo.offsetWidth
  campo.classList.add('temblor')
  campo.value = ''

  // Retardo creciente, con tope de 5 s. Nunca un bloqueo permanente: el dueño
  // del equipo tiene que poder volver a intentarlo siempre.
  const espera = Math.min(fallos - 1, 5) * 1000
  if (espera > 0) {
    campo.disabled = true
    aviso.textContent = t('lock.incorrectoEspera', { segundos: espera / 1000 }) || `PIN incorrecto — espera ${espera / 1000} s`
    aviso.classList.add('mal')
    setTimeout(() => {
      campo.disabled = false
      campo.focus()
      aviso.textContent = ''
      aviso.classList.remove('mal')
    }, espera)
  } else {
    aviso.textContent = t('lock.incorrecto') || 'PIN incorrecto'
    aviso.classList.add('mal')
    setTimeout(() => { aviso.textContent = ''; aviso.classList.remove('mal') }, 1600)
  }
}

async function probar() {
  const valor = campo.value
  if (!valor) return
  campo.disabled = true
  try {
    const r = await window.yukiLock.verificar(valor)
    // Si acierta, el proceso principal destruye esta ventana: nada que hacer aquí
    if (!r || !r.match) { campo.disabled = false; fallar() }
  } catch (e) {
    campo.disabled = false
    aviso.textContent = t('lock.errorComprobar') || 'No se pudo comprobar el PIN'
    aviso.classList.add('mal')
  }
}

campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') probar() })
campo.focus()
