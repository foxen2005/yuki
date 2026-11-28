# El corrector ortográfico sigue solo al idioma elegido

**Fecha:** 2026-11-27
**Estado:** ✅ LISTO — en v0.4.8 (commit 2e71539, publicado el 2026-11-27)

## El problema

Jean escribe «coneccion» en WhatsApp dentro de Yuki y el menú del clic derecho
le ofrece *connection, Concepcion, coercion, concision*. Ni una con tilde, ni
una en español. Con la app en español.

## Qué se midió (no es suposición)

Con Electron 35, sesión limpia, misma palabra, cambiando solo los idiomas:

| Idiomas cargados | Sugerencias para «coneccion» |
|---|---|
| `es-419` + `en-US` | connection, Concepcion, coercion, concision |
| `es-419` | conexión, confección, colección, convección |
| `es-ES` | conexión, confección, colección, convección |

También se comprobó, por si el problema fuera el diccionario:

- `availableSpellCheckerLanguages` trae 56 idiomas e incluye `es`, `es-419`,
  `es-AR`, `es-ES`, `es-MX`, `es-US`. `setSpellCheckerLanguages(['es-419'])`
  no falla.
- En `userData/Dictionaries` solo hay `en-US-10-1.bdic`. **Español nunca
  descarga nada**, ni esperando 90 s, ni forzando la URL de descarga.
- Apuntando la descarga a un servidor local se ve que Chromium pide
  `fr-fr-3-0.bdic` para el francés y **no pide nada** para el español.

La explicación: en Windows el español lo resuelve el corrector nativo del
sistema, no Hunspell, así que no hay `.bdic` que bajar y la ausencia del
archivo no es el fallo. El fallo es otro.

## La causa

`aplicarCorrector()` en `src/main/view-manager.js:103` carga el idioma de la
interfaz **más inglés, siempre**. Chromium devuelve como mucho cuatro o cinco
sugerencias en total para una palabra, repartidas entre los idiomas cargados, y
el inglés se las queda todas. El español está activo —la palabra sale
subrayada—, pero sus sugerencias no llegan a la lista.

Lo del inglés fijo lo decidí yo al traducir la app («medio mundo escribe
mezclando inglés»). Era un mal cambio: el coste no era «poco», era quedarse sin
las sugerencias del propio idioma.

## El cambio

Una cosa sola: cargar únicamente el idioma elegido en Configuración.

```js
function aplicarCorrector(ses) {
  try {
    const avail = ses.availableSpellCheckerLanguages || []
    const cod = idioma.idioma()
    const propio = (CANDIDATOS_CORRECTOR[cod] || []).find(l => avail.includes(l))
    if (propio) ses.setSpellCheckerLanguages([propio])
  } catch (e) {}
}
```

`CANDIDATOS_CORRECTOR` se queda como está: sigue haciendo falta para traducir
`es` → `es-419` y para que un idioma sin diccionario no rompa nada. La entrada
`'en'` se mantiene porque es el idioma de la interfaz para quien elige inglés.

Con la app en inglés el corrector queda en inglés, igual que antes. Con la app
en español, portugués o francés, el corrector queda solo en ese idioma, que es
lo que pidió Jean: que siga al idioma que el usuario eligió.

Nada más cambia: `actualizarCorrector()` ya reaplica esto a todas las vistas
cuando se cambia el idioma en caliente.

## Lo que se pierde

Quien escriba correos mezclando español e inglés verá subrayadas las palabras
en inglés. Es el comportamiento normal de cualquier corrector y es el que el
usuario pidió. Si más adelante molesta, la salida no es volver a esto: sería
una casilla en Configuración («corregir también en inglés»), que es una
decisión del usuario y no una impuesta.

## Qué probar

1. Yuki en español, escribir «coneccion» en WhatsApp → las sugerencias traen
   tildes (conexión, confección…).
2. Cambiar a inglés en Configuración sin reiniciar y escribir «conneciton» →
   sugerencias en inglés.
3. Cambiar a francés → «bonjuor» da sugerencias en francés.
4. Que el «Agregar al diccionario» siga funcionando.

## Cierre

- `/code-review` sobre el cambio.
- Commit, push y release v0.4.8 a GitHub (los releases de Yuki son continuos).
- La Store sigue pendiente aparte, con el `.appx` de la 0.4.7 sin subir.
