# Ventanas flotantes + bloqueo con PIN como capa propia

**Fecha:** 2026-10-20
**Estado:** ✅ LISTO — implementado el 2026-10-21, v0.4.5

## Cómo quedó respecto al plan

Dos desvíos, ambos a mejor:

- **El bloqueo es UNA ventana hija y modal de la principal**, no una por pantalla
  y siempre encima. Una ventana opaca del tamaño del escritorio dejaba el PC
  inutilizable si algo fallaba; siendo modal, Windows deshabilita la ventana
  padre y las `WebContentsView` no reciben ni un clic. Lo que la capa no tapa
  (flotantes, ventana de login de Google) se esconde mientras dura el bloqueo, y
  las DevTools se cierran porque ni siquiera salen en `getAllWindows()`.
- **Si la capa falla al cargar no se desbloquea.** El plan decía destruirla; eso
  convertía un cuelgue del renderer en "Yuki abierto con todas las sesiones a la
  vista". Ahora reintenta una vez y, si tampoco, esconde Yuki entero y sigue
  bloqueado. Se sale por la bandeja.

Añadido sobre el plan: bloqueo también en arranque en frío, `setContentProtection`
para que el Alt+Tab no enseñe lo de debajo, y el menú por defecto de Electron
fuera (traía "Toggle Developer Tools" con su Ctrl+Shift+I).

## Por qué

Hoy toda petición de ventana nueva (`window.open`, `target="_blank"`) se deniega
y se manda al navegador del sistema. Eso deja fuera de Yuki cosas que deberían
pasar dentro con la sesión de la app: adjuntos de Drive, imprimir un correo,
redactar en ventana aparte. Además Gmail muestra un aviso falso de "bloqueador
de ventanas emergentes" porque `window.open()` devuelve `null`.

Las flotantes se descartaron dos veces por un motivo real: **el bloqueo con PIN
no las taparía.** El bloqueo actual no es una ventana, es una capa HTML dentro
del renderer, y las apps son `WebContentsView` nativas que Chromium pinta por
encima del DOM. Por eso `syncViewLayout()` empuja las vistas a `x=9999` para que
la capa se vea. Una `BrowserWindow` aparte no se entera de ese truco: seguiría
visible y clickeable con Yuki bloqueado.

Idea de Jean: que el bloqueo sea **una ventana propia encima de todo**. Eso lo
resuelve a nivel de sistema operativo y vale para cualquier ventana futura.

## Orden

La parte A va primero. Las flotantes no son seguras hasta que el bloqueo las
tape.

---

## Parte A — El bloqueo pasa a ser una ventana

### A1. Ventana de bloqueo

Nuevo `src/main/lock-window.js`:

- Una `BrowserWindow` **por cada pantalla** (`screen.getAllDisplays()`), con los
  bounds de esa pantalla. Con una sola ventana, un monitor secundario queda
  destapado.
- `frame: false`, `alwaysOnTop: true` con nivel `screen-saver`, `skipTaskbar:
  true`, `closable: false`, `minimizable: false`, `movable: false`, sin menú.
- Carga `src/renderer/lock.html` con un preload mínimo que solo expone
  `pin:verify`. No reutilizar `renderer-preload.js`: esa superficie no tiene por
  qué estar accesible desde la pantalla de bloqueo.
- Solo la ventana de la pantalla principal lleva el campo del PIN; las otras son
  opacas sin más. Al desbloquear se destruyen todas.
- Reaccionar a `screen.on('display-added' | 'display-removed')` mientras está
  bloqueado: si se enchufa un monitor, hay que taparlo también.

### A2. Dónde se dispara

- `yuki-window-show` (restaurar desde bandeja, barra de tareas, segunda
  instancia) — como hoy.
- **Arranque en frío** — hueco actual: `createWindow()` muestra la ventana sin
  mandar `yuki-window-show`, así que saliendo de verdad y reabriendo se entra
  sin PIN.
- Inactividad: **fuera de este plan.** Se puede añadir después con
  `powerMonitor`; mejor no mezclarlo.

### A3. Limpiar el truco de x=9999

`viewsShouldHide()` pierde la condición del lock. **El panel de Configuración
sigue usándolo**, así que `syncViewLayout()` se queda tal cual, solo cambia su
condición. Las vistas ya no se mueven al bloquear: la ventana las tapa.

### A4. Seguridad de la propia ventana

Una ventana opaca, a pantalla completa y siempre encima puede dejar el PC
inutilizable si algo falla. Mitigaciones, todas obligatorias:

- Nunca `kiosk: true` ni captura de teclado global. Alt+Tab, Ctrl+Alt+Supr y el
  gestor de tareas siguen funcionando.
- Si `pin:has` devuelve false, la ventana **no se muestra**. Sin PIN guardado no
  hay forma de quitarla.
- Si el renderer de la ventana falla al cargar (`did-fail-load`), se destruye
  sola en vez de quedarse en negro.
- Tope de intentos: solo retardo creciente, nunca un bloqueo permanente.

---

## Parte B — Ventanas flotantes

### B1. Clasificación en `setWindowOpenHandler`

| Destino | Qué pasa |
|---|---|
| `disposition === 'save-to-disk'` | `downloadURL` — como hoy |
| Huele a login (`accounts.`/`login.`/`auth.`/`sso.`, o ruta con `/oauth`, `/signin`, `/ServiceLogin`) | Ventana de login dedicada o navegador — **nunca** flotante |
| No es `http(s)` | Denegar |
| Todo lo demás | **Flotante** |

Es una heurística, no una garantía: siempre habrá un sitio que llame `portal.` a
su login. Por eso B3 incluye una salida.

### B2. Crear la flotante

`action: 'allow'` con `outlivesOpener: false` y `overrideBrowserWindowOptions`
copiando **exactamente** las `webPreferences` de la vista
(`contextIsolation: false`, `nodeIntegration: false`, `sandbox: true`,
`spellcheck: true`, mismo `webview-preload.js`). La partición se hereda por ser
hija de la vista; no hay que pasarla.

### B3. Cablear la flotante en `did-create-window`

Una ventana emergente nace sin nada de lo que la vista tiene:

- `_menuContextual(pwc)` — si no, clic derecho no hace nada.
- Su propio `setWindowOpenHandler`: los nietos van al navegador, sin cadenas de
  flotantes.
- `pwc.ipc.on('view:open-external')` — el preload manda ese IPC y ahí no lo
  escucha nadie.
- Registrarla en `entry.popups` y cerrarlas al dormir o destruir la vista: si
  no, quedan huérfanas.
- **Salida de emergencia:** atajo o item de menú "Abrir en el navegador" para
  cuando una flotante se atasque (un login mal clasificado, por ejemplo).

---

## Parte C — Sincronizar el preload

`webview-preload.js` tiene su propio `window.open` falseado, pero solo para URLs
que `isExternal()` considere de otro dominio. `drive.google.com` visto desde
`mail.google.com` no lo es, así que cae al `window.open` real, el principal lo
deniega y Gmail canta "bloqueador de ventanas emergentes".

Con flotantes reales el aviso desaparece solo, porque `window.open` devolverá
una ventana de verdad. Pero hay que revisar que `isExternal()` y el manejador de
clics de anclas sigan coherentes con la clasificación de B1, y que no haya un
camino donde el preload intercepte algo que debería ser flotante.

---

## Riesgos asumidos

1. **La heurística de login fallará alguna vez.** Mitigado con la salida de B3.
2. **Más ventanas que gestionar** = más sitios donde algo puede quedar vivo.
   Mitigado cerrándolas con la vista y con `outlivesOpener: false`.
3. **La ventana de bloqueo es la pieza delicada.** Todas las mitigaciones de A4
   son obligatorias, no opcionales.

## Cierre

- `/code-review` sobre todo el cambio.
- Compilar el instalador y **que Jean lo pruebe antes de publicar**.
- Release a GitHub cuando apruebe. A la Store no: es un arreglo, no un hito.

## Qué probar

1. Bloquear con PIN y comprobar que tapa la ventana principal, las flotantes y
   el monitor secundario.
2. Salir de Yuki del todo y reabrir: debe pedir PIN.
3. Abrir Configuración: las vistas deben seguir desapareciendo como antes.
4. Enlace de adjunto de Drive en un correo: flotante, sin aviso de bloqueador.
5. Botón "Acceder" de Google: ventana de login dedicada, no flotante.
6. Clic derecho dentro de una flotante: menú contextual.
7. Cerrar la app que abrió una flotante: la flotante se cierra con ella.
