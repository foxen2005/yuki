# El clic normal va al navegador; la ventana flotante pasa a ser opcional

**Fecha:** 2026-11-04
**Estado:** ✅ LISTO — implementado el 2026-11-04, v0.4.6

## Cómo quedó respecto al plan

Cuatro desvíos, todos salidos de las tres pasadas de `/code-review`:

- **`SUFIJOS_2N` no se unificó: se eliminó la copia del preload.** Un preload con
  `sandbox:true` no puede requerir un archivo del proyecto, así que la regla
  vive solo en `src/shared/dominio.js` y el preload la pregunta por IPC
  (`view:mismo-sitio`). Mantener dos copias no era viable: en cuanto la del
  proceso principal aprendió a distinguir inquilinos y familias, las dos
  dejaron de decir lo mismo y un enlace podía salir al navegador por un lado y
  quedarse dentro por el otro.
- **"Mismo dominio registrable" no alcanzaba.** Dos añadidos:
  - **Familias** (`FAMILIAS`): un adjunto de Teams es `contoso.sharepoint.com`
    abierto desde `teams.microsoft.com` — distinto dominio, misma cuenta. Sin
    esto Teams y Outlook Web perdían la sesión, y como esos enlaces los abre
    JavaScript y no un `<a>`, el clic derecho tampoco los salvaba.
  - **Sufijos privados** (`SUFIJOS_PRIVADOS`) e **IPs**: `foo.atlassian.net` y
    `bar.atlassian.net` no son el mismo sitio, y `192.168.1.5` y `10.0.1.5` no
    comparten "1.5".
- **Las emergentes con medidas se quedan dentro.** `window.open(url, '',
  'width=…')` llega como `new-window`: esa ventana existe porque la página
  espera hablar con ella (un checkout, un visor que avisa al terminar), y
  mandarla al navegador le deja un muñeco en la mano. Un enlace llega como
  `foreground-tab` y ese sí sale.
- **La ventana pegada tenía una causa concreta, y no era la que el plan
  suponía.** Electron **no** pinta ningún aviso cuando la página tiene un
  `beforeunload`: veta el cierre en silencio, y la ventana no se cierra ni con
  la X. Eso explica el síntoma de Jean mejor que las dos hipótesis del plan. La
  app tiene que preguntar ella, en `will-prevent-unload` — es lo que ahora hace.
  El `destroy()` a los 3 s se cayó: nacía de creer que había un diálogo
  invisible esperando respuesta, y habría tirado trabajo sin guardar.

## Qué pide Jean

1. **Clic normal en un enlace → navegador externo de Windows.** Que el
   comportamiento por defecto deje de ser abrir una ventana de Yuki.
2. **Clic derecho → "Abrir en ventana"** para quien quiera la flotante con la
   sesión de la app. Copiar ya lo ofrece el menú.
3. Hay ventanas flotantes que **se quedan pegadas**: no se pueden cerrar y
   quedan de fondo.

## Parte 1 — Invertir el defecto, con una excepción

Lo que separa los dos casos no es "¿es Drive?", es **¿el destino pertenece al
mismo servicio que la app?**. Un adjunto de Drive enlazado en un correo es
`drive.google.com` visto desde `mail.google.com`: mismo dominio registrable,
`google.com`. Un enlace a una noticia en ese mismo correo es otro dominio. Con
eso se distinguen sin listar servicios de Google a mano, y vale igual para
WhatsApp, Teams o cualquier app que se agregue mañana.

El orden de decisión queda:

| # | Caso | Qué hace |
|---|---|---|
| 1 | No es `http(s)` | Nada |
| 2 | `save-to-disk` (`<a download>`) | Se descarga |
| 3 | `accounts.google.com` desde una app de Google | Banner → ventana de login dedicada |
| 4 | Parece un login | **Navegador** |
| 5 | **Mismo dominio registrable que la app** | **Ventana flotante**, con la sesión |
| 6 | Todo lo demás | **Navegador** |

El 4 va **antes** que el 5 a propósito: un `login.ejemplo.com` abierto desde
`app.ejemplo.com` es del mismo sitio, pero una flotante sigue sin ser sitio para
un 2FA. Así que `pareceLogin()` se queda.

Esto aplica también a `window.open()` disparado por la propia página, no solo a
los clics: según de dónde viniera el enlace pasaría una cosa u otra.

**Sin `destinoReal()` esto no funciona.** Gmail envuelve los enlaces externos en
su propio redirector (`google.com/url?q=…`), así que *todos* parecerían
`google.com` y se quedarían dentro. Hay que desenvolver antes de comparar.

### Dominio registrable, no dominio a secas

Comparar los dos últimos trozos del host mete en el mismo saco a `foo.co.uk` y
`bar.co.uk`. Hace falta la tabla de sufijos de segundo nivel que ya existe en
`webview-preload.js` (`SUFIJOS_2N`); se mueve a un sitio común para no tener dos
copias que se desincronicen.

## Parte 2 — "Abrir en ventana" en el menú contextual

Sobre un enlace, el menú pasa a ofrecer:

1. **Abrir en una ventana de Yuki** ← nuevo
2. Abrir en el navegador
3. Copiar dirección del enlace

La flotante se crea a mano (`abrirFlotante(id, url)`), con la sesión de la app,
en vez de salir de `action: 'allow'`. Todo el cableado que hoy vive dentro de
`did-create-window` (menú contextual, título con el dominio delante, enlaces al
navegador, registro en `entry.popups`, esconderse con la bandeja y con el
bloqueo) se saca a un método propio y lo usan los dos caminos.

## Parte 3 — Ventanas pegadas

**No lo tengo reproducido.** Leyendo el código veo dos formas de llegar a una
ventana que no responde, pero no puedo afirmar que sean la tuya:

- **Se muestra una ventana que nunca llegó a pintarse.** La flotante nace con
  `show: false` y se muestra en `ready-to-show`. Hay un plazo de 15 s por si ese
  evento no llega nunca; hoy, pasado el plazo, si la ventana tiene una URL
  cargada **se muestra igual**. Si esa página está colgada, lo que aparece es un
  rectángulo que no responde.
  → Pasado el plazo sin `ready-to-show`, **cerrarla** en vez de enseñarla.

- **`close()` que no termina.** Si la página tiene un `beforeunload` ("¿seguro
  que quieres salir?"), Windows pide confirmación. Si la ventana está escondida
  (Yuki en la bandeja), ese aviso no se ve y el cierre se queda a medias.
  → Tras pedir el cierre, si en 3 s sigue viva, `destroy()`.

Además, para cualquier otro caso que no haya visto: **cerrar todas las
flotantes abiertas** desde el menú de la bandeja. Una salida que no depende de
adivinar la causa.

Si con esto te vuelve a pasar, dime **qué app era y qué habías pulsado**, y lo
persigo con eso en la mano en vez de a ciegas.

## Lo que esto cuesta

Drive desde el correo se conserva dentro, así que el caso que motivó la 0.4.5
sigue funcionando. Lo que cambia es todo lo demás: un enlace a una web ajena,
que antes abría una flotante, ahora sale al navegador.

Quedan tres flancos, todos sabidos:

- **La regla mira el dominio, no quién manda.** Una página que abra
  `otracosa.google.com` sin que tú se lo pidas también se queda dentro.
- **Dentro de una familia no se distingue el inquilino.** Desde Outlook o Teams,
  cualquier `*.sharepoint.com` cuenta como propio — también el de un enlace de
  phishing. Separarlos rompería el caso que la familia viene a salvar. La
  flotante no se queda muda: su título lleva el dominio real delante.
- **`window.open(url, '_blank')` sin medidas es indistinguible de un clic.**
  Llega como `foreground-tab` y sale al navegador. Si una página usa eso para un
  checkout, se va fuera.

En los tres casos el menú contextual de la flotante lleva "Abrir esta página en
el navegador".

## Cierre

- `/code-review` sobre el cambio.
- Compilar y que Jean lo pruebe.
- Publicar en GitHub cuando dé el OK. A la Store no: es un arreglo.

## Qué probar

1. Clic en un enlace **a una web ajena** dentro de un correo → se abre en tu
   navegador, no en Yuki.
2. Clic en un **adjunto de Drive** en ese mismo correo → ventana flotante con la
   sesión puesta, como ahora.
3. Clic derecho en el enlace del punto 1 → "Abrir en una ventana de Yuki" →
   flotante.
4. Esa flotante se cierra con la X a la primera.
5. Bandeja → "Cerrar ventanas flotantes" las cierra todas.
6. El botón "Acceder" de Google sigue llevando a la ventana de login.
7. Un adjunto de **Teams u Outlook Web** (`*.sharepoint.com`) se abre dentro,
   con la sesión puesta.
8. Una flotante con cambios sin guardar: la X pregunta y, diciendo que sí, se
   cierra de verdad.
