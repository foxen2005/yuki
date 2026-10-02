# Publicar Yuki en Microsoft Store

Guía del proceso de empaquetado y envío. El paquete se genera con el destino `appx` de electron-builder; Microsoft lo firma al publicarlo, así que **no hace falta comprar certificado de firma**: publicar en la tienda resuelve de paso el aviso de SmartScreen.

## Estado

| | |
|---|---|
| Destino `appx` en `package.json` | ✅ configurado |
| Logos del paquete (`build/appx/`) | ✅ 7 imágenes generadas desde `icons/icon.png` |
| Auto-update desactivado en la tienda | ✅ `process.windowsStore` (actualiza la tienda, no electron-updater) |
| Política de privacidad publicada | ✅ https://foxen2005.github.io/yuki/privacidad.html |
| Paquete de prueba compilado | ✅ 123 MB, sin firmar, `runFullTrust` |
| Identidad de Partner Center | ✅ aplicada y validada contra el manifiesto |

## Identidad (ya aplicada, 1-oct-2026)

| Campo | Valor |
|---|---|
| Package/Identity/Name | `DigitalFox.YukiWorkspace` |
| Package/Identity/Publisher | `CN=9217F805-35E5-4B41-AF4D-F39BE6433208` |
| PublisherDisplayName | `DigitalFox` |
| Package Family Name | `DigitalFox.YukiWorkspace_8zn5xjx807dh2` |
| Store ID | `9NG9R9QH1RT1` |
| Ficha pública | https://apps.microsoft.com/detail/9NG9R9QH1RT1 |

Son valores públicos: aparecen en el manifiesto de cualquier paquete publicado.

## 1. En Partner Center (esto solo lo puede hacer la cuenta registrada)

1. **Reservar el nombre**: Apps y juegos → Nuevo producto → App MSIX/PWA → nombre `Yuki`.
   Si estuviera tomado, sirve cualquier variante (`Yuki Desktop`, `Yuki by Digital Fox`).
2. Entrar al producto → **Administración de productos → Identidad del producto**.
3. Copiar estos tres valores:

| Campo en Partner Center | Va en `build.appx` |
|---|---|
| **Package/Identity/Name** | `identityName` |
| **Package/Identity/Publisher** | `publisher` |
| **Package/Properties/PublisherDisplayName** | `publisherDisplayName` |

## 2. Poner la identidad y compilar

Reemplazar los `PENDIENTE-PARTNER-CENTER` de `build.appx` en `package.json` por los valores reales y:

```bash
npm run assets:appx    # solo si cambió icons/icon.png
npm run build:store    # genera dist/Yuki <version>.appx
```

El build avisa `AppX is not signed — reason=Windows Store only build`: es lo esperado.

## 3. Enviar

En Partner Center → el producto → **Envíos → Paquetes**, subir el `.appx`. Después hay que completar:

- **Precio**: gratis.
- **Mercados**: Chile y el resto, o todos.
- **Clasificación por edad**: cuestionario IARC. Yuki no tiene contenido propio, pero **sí permite acceso irrestricto a internet** — hay que marcarlo, o el envío se rechaza.
- **Privacidad**: https://foxen2005.github.io/yuki/privacidad.html
- **Ficha**: descripción, al menos una captura de 1366×768 o mayor, y los textos. Se puede reutilizar lo de la landing.
- **Notas para la certificación**: conviene explicar que Yuki es un cliente no oficial que solo muestra sitios web elegidos por la persona usuaria, sin afiliación con esos servicios.

## Riesgos reales de certificación

Hay que entrar sabiendo esto, no son trámites garantizados:

1. **Marcas de terceros.** El catálogo trae los logos de WhatsApp, Gmail, Slack y otros. La política de la tienda prohíbe sugerir afiliación o respaldo. Mitigación: el nombre del producto no incluye marcas, la ficha debe decir explícitamente que es un cliente no oficial, y los logos solo identifican el acceso. Otros clientes multi-app están publicados en la tienda, así que es viable, pero es el punto más probable de observación.
2. **"Solo un envoltorio web".** La tienda rechaza apps que son únicamente un sitio web empaquetado. Yuki aporta funciones propias (sesiones aisladas por app, gestión de RAM, bloqueo con PIN, notificaciones, corrector); conviene dejarlo claro en la descripción.
3. **Tamaño**: 123 MB es normal para Electron, no es impedimento.

## Mantener las dos vías

GitHub Releases sigue funcionando igual para quien descargue de la web: el instalador NSIS conserva su auto-update y el portable sigue existiendo. La versión de la tienda simplemente no usa electron-updater. Al publicar una versión nueva hay que subir el `.appx` a Partner Center además del `npm run release` de siempre.

---

# Textos de la ficha (listos para copiar)

## Nombre del producto
```
Yuki Workspace
```
Reservado el 1-oct-2026 («Yuki» a secas ya estaba tomado). Debe coincidir exacto con `build.appx.displayName` en package.json.

## Descripción corta (máx. 200 caracteres)
```
Reúne WhatsApp, Gmail, Telegram, Notion y cualquier sitio web en una sola ventana, con sesiones separadas que no se pierden al reiniciar.
```

## Descripción larga
```
Yuki reúne las aplicaciones web que usas todo el día en una sola ventana de escritorio: WhatsApp, Gmail, Telegram, Slack, Notion, Google Calendar o cualquier dirección que quieras agregar.

Cada aplicación corre aislada, con su propia sesión guardada. Puedes tener dos cuentas de Gmail abiertas al mismo tiempo sin que una interfiera con la otra, y al cerrar Yuki no pierdes ninguna sesión.

QUÉ LO HACE DISTINTO DE UN NAVEGADOR

• Sesiones separadas de verdad: cada app tiene su propio almacenamiento aislado. Varias cuentas del mismo servicio conviven sin conflictos.
• Memoria bajo control: monitor de RAM por aplicación y suspensión automática configurable. Las apps que no usas se duermen y despiertan donde las dejaste.
• Espacio en disco bajo control: puedes ver cuánto ocupa cada aplicación y liberarlo con un botón, sin cerrar sesión en ninguna.
• Bloqueo con PIN: al minimizar, pide un PIN para volver. Se guarda cifrado con el sistema de credenciales de Windows.
• Notificaciones nativas de Windows, con sonido configurable y modo No molestar.
• Corrector ortográfico en español e inglés, con sugerencias al hacer clic derecho.
• Permisos por sitio: cámara, micrófono y ubicación se preguntan una vez y puedes revisarlos o revocarlos cuando quieras.
• Atajos de teclado que no molestan: Ctrl+1 a Ctrl+9 cambian de aplicación solo cuando Yuki está en primer plano, nunca capturan teclas de otros programas.
• Copia de seguridad de tu configuración en un archivo, para cambiar de equipo en un minuto.

PRIVACIDAD

Yuki no tiene cuentas, no recopila datos y no existe ningún servidor al que se envíe información. Todo queda en tu equipo. El código fuente es abierto, con licencia MIT, y cualquiera puede verificarlo.

AVISO

Yuki es un cliente no oficial e independiente. No está afiliado, asociado ni respaldado por WhatsApp, Google, Telegram, Slack, Notion ni ningún otro servicio. Los nombres y logotipos de esos servicios pertenecen a sus respectivos dueños y se usan únicamente para identificar el acceso correspondiente dentro de la aplicación.
```

## Palabras clave (hasta 7)
```
multi app, mensajería, productividad, escritorio, pestañas, cliente web, organizador
```

## Notas para la certificación
```
Yuki es un cliente de escritorio no oficial que muestra, en una sola ventana, sitios web elegidos por la persona usuaria.

No es un simple envoltorio de un sitio web: aporta funcionalidad propia que el navegador no da — aislamiento de sesiones por aplicación (varias cuentas del mismo servicio en paralelo), monitor y liberación de memoria RAM por aplicación, control y limpieza del espacio en disco por aplicación, bloqueo de la ventana con PIN cifrado mediante safeStorage de Windows, gestión de permisos por sitio, notificaciones nativas y corrector ortográfico.

Los logotipos de servicios de terceros que aparecen en el catálogo se usan exclusivamente para identificar a qué sitio corresponde cada acceso. La ficha y la propia aplicación indican que se trata de un cliente no oficial, sin afiliación con esos servicios.

La aplicación no recopila ningún dato, no tiene servidores propios y su código es abierto bajo licencia MIT: https://github.com/foxen2005/yuki

Política de privacidad: https://foxen2005.github.io/yuki/privacidad.html

Sobre la capacidad restringida runFullTrust: Yuki es una aplicación de escritorio Win32 empaquetada como MSIX (EntryPoint Windows.FullTrustApplication), construida con Electron. La capacidad runFullTrust es obligatoria para ese tipo de empaquetado y es la única capacidad restringida que declara el paquete. La aplicación la necesita para funciones propias de escritorio: ejecutar los procesos de renderizado aislados de cada aplicación web, el icono y menú en la bandeja del sistema, las notificaciones nativas de Windows y el cifrado del PIN mediante la API safeStorage del sistema. No se declara ninguna otra capacidad restringida y la aplicación no accede a dispositivos, no instala servicios ni modifica el sistema.
```

## Datos del envío

| Campo | Valor |
|---|---|
| Precio | Gratis |
| Categoría | Productividad |
| Mercados | Todos |
| Política de privacidad | https://foxen2005.github.io/yuki/privacidad.html |
| Sitio web | https://foxen2005.github.io/yuki/ |
| Soporte | https://github.com/foxen2005/yuki/issues |
| Clasificación por edad | Cuestionario IARC — marcar **acceso irrestricto a internet** |

## Características del producto (lista con viñetas de la ficha)

Se agregan una por una con «Agregar más». Aparecen como lista en la página de la tienda.

```
Todas tus apps web en una sola ventana
Sesiones separadas: varias cuentas del mismo servicio a la vez
Monitor de memoria RAM por aplicación
Suspensión automática de las apps que no estás usando
Ver cuánto ocupa cada app en disco y liberarlo con un botón
Bloqueo de la ventana con PIN cifrado
Notificaciones nativas de Windows con sonido configurable
Corrector ortográfico en español e inglés
Permisos de cámara y micrófono por sitio
Copia de seguridad de la configuración en un archivo
Sin telemetría: no se recopila ningún dato
Código abierto con licencia MIT
```

## Campos complementarios

| Campo | Valor |
|---|---|
| Título corto | `Yuki` |
| Descripción corta | la «Descripción corta» de más arriba |
| Desarrollado por | `Digital Fox` |

## Información de copyright y marca registrada

```
© 2025-2026 Digital Fox. Publicado bajo licencia MIT.

Yuki es un cliente no oficial e independiente. WhatsApp, Gmail, Telegram, Slack, Notion y los demás servicios mencionados son marcas de sus respectivos dueños; no existe afiliación, asociación ni respaldo por parte de ellos. Sus logotipos se usan únicamente para identificar el acceso correspondiente dentro de la aplicación.
```

## Arte promocional de la ficha

Generado por `npx electron scripts/make-store-art.js` desde el PNG matriz de la
raíz (1254×1254), sobre el fondo de marca. Queda en `store-shots/arte/`.

| Archivo | Dónde va |
|---|---|
| `poster-9x16-1440x2160.png` | Arte de póster 9:16 — **logotipo principal en Windows 10/11** |
| `caja-1x1-2160x2160.png` | Arte de caja 1:1 |
| `superheroe-16x9-1920x1080.png` | Imagen de superhéroe 16:9 (cabecera de la ficha) |

Sin texto a propósito: la tienda dibuja el nombre del producto encima, y la
imagen 16:9 prohíbe explícitamente incluir el título.

Los logos del listado (300×300, 150×150, 71×71) están en `store-shots/logos/`.

---

# Store listing — English (United States)

The package declares `es` and `en-US`, so Partner Center requires a listing for
each. Spanish (Chile) was dropped from `build.appx.languages`: it is redundant
with Spanish and only forced a duplicate listing.

## Product name
```
Yuki Workspace
```

## Short description
```
Bring WhatsApp, Gmail, Telegram, Notion and any website together in one window, with separate sessions that survive a restart.
```

## Description
```
Yuki brings the web apps you use all day into a single desktop window: WhatsApp, Gmail, Telegram, Slack, Notion, Google Calendar, or any address you want to add.

Every app runs isolated, with its own saved session. You can keep two Gmail accounts open at the same time without one interfering with the other, and closing Yuki never signs you out.

WHAT MAKES IT DIFFERENT FROM A BROWSER

• Genuinely separate sessions: each app gets its own isolated storage. Several accounts of the same service coexist without conflicts.
• Memory under control: per-app RAM monitor and configurable auto-sleep. Apps you are not using go to sleep and wake up right where you left them.
• Disk space under control: see how much each app takes and free it with one button, without signing out of anything.
• PIN lock: asks for a PIN when you restore the window. Stored encrypted with the Windows credential system.
• Native Windows notifications, with a configurable sound and a Do Not Disturb mode.
• Spell checker in Spanish and English, with suggestions on right click.
• Per-site permissions: camera, microphone and location are asked once, and you can review or revoke them whenever you want.
• Keyboard shortcuts that stay out of the way: Ctrl+1 to Ctrl+9 switch apps only while Yuki is in the foreground, never capturing keys from other programs.
• Back up your configuration to a file and move to another machine in a minute.

PRIVACY

Yuki has no accounts, collects no data, and there is no server anywhere that receives your information. Everything stays on your computer. The source code is open under the MIT license, so all of this is verifiable.

NOTICE

Yuki is an unofficial, independent client. It is not affiliated with, associated with, or endorsed by WhatsApp, Google, Telegram, Slack, Notion or any other service. Those names and logos belong to their respective owners and are used solely to identify the corresponding shortcut inside the application.
```

## Product features
```
All your web apps in a single window
Separate sessions: several accounts of the same service at once
Per-app RAM monitor
Automatic sleep for the apps you are not using
See how much disk each app uses and free it with one button
Window lock with an encrypted PIN
Native Windows notifications with a configurable sound
Spell checker in Spanish and English
Per-site camera and microphone permissions
Back up your configuration to a file
No telemetry: no data is collected
Open source under the MIT license
```

## Keywords
```
multi app, messaging, productivity, desktop, web apps, workspace, organizer
```

## Short title / Developed by
```
Yuki
Digital Fox
```

## Copyright and trademark information
```
© 2025-2026 Digital Fox. Released under the MIT license.

Yuki is an unofficial, independent client. WhatsApp, Gmail, Telegram, Slack, Notion and the other services mentioned are trademarks of their respective owners; there is no affiliation, association or endorsement by them. Their logos are used solely to identify the corresponding shortcut inside the application.
```

## Screenshot captions
```
All your apps in one window, each with its own session
Several accounts of the same service running at once
A catalog of apps ready to add, or any URL
Per-app RAM and disk monitor
```

---

## Justificación de runFullTrust (campo obligatorio en Opciones de envío)

Partner Center exige explicar por qué el paquete declara esta capacidad
restringida. Va en inglés: la certificación la revisan equipos globales.

```
Yuki Workspace is a Win32 desktop application built with Electron and packaged as MSIX through the Desktop Bridge (EntryPoint="Windows.FullTrustApplication"). The runFullTrust capability is inherent to that packaging model — a packaged Win32 application cannot run without it — and it is the only restricted capability the package declares.

It is used strictly for standard desktop functionality:

- Running the isolated renderer processes that host each web application in its own separate session.
- The system tray icon and its context menu.
- Native Windows toast notifications forwarded from the hosted web applications.
- Encrypting the optional lock PIN using the Windows credential system (Electron safeStorage, backed by DPAPI).
- Reading and writing the application's own configuration and per-app session data inside its user data folder.

The application does not access hardware devices (MIDI, HID, serial and USB permission requests are always denied), does not install services or drivers, does not modify the system or other applications, does not require administrator elevation, and collects no user data.

The full source code is open under the MIT license and can be audited: https://github.com/foxen2005/yuki
Privacy policy: https://foxen2005.github.io/yuki/privacidad.html
```

**Nota:** las «Notas para la certificación» no se escriben en esta misma página
— el enlace lleva a **Información adicional sobre pruebas**, en el menú de la
izquierda. Ahí va el texto de la sección «Notas para la certificación».
