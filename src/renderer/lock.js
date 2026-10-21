// Pantalla de bloqueo. Lo único que puede hacer es comprobar un PIN: su
// preload no expone nada más.
const campo = document.getElementById('pin')
const aviso = document.getElementById('aviso')
let fallos = 0

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
    aviso.textContent = `PIN incorrecto — espera ${espera / 1000} s`
    aviso.classList.add('mal')
    setTimeout(() => {
      campo.disabled = false
      campo.focus()
      aviso.textContent = ''
      aviso.classList.remove('mal')
    }, espera)
  } else {
    aviso.textContent = 'PIN incorrecto'
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
    aviso.textContent = 'No se pudo comprobar el PIN'
    aviso.classList.add('mal')
  }
}

campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') probar() })
campo.focus()
