<div align="center">

<img src="icons/icon.png" width="96" alt="Yuki">

# Yuki

**Todas tus apps web. Una sola ventana.**

Cliente de escritorio para Windows que reúne WhatsApp, Gmail, Telegram, Notion, Slack y cualquier URL en un solo lugar, con sesiones persistentes, control de RAM y bloqueo con PIN.

[![Descargar instalador](https://img.shields.io/badge/Descargar-Yuki%20Setup-7c3aed?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/foxen2005/yuki/releases/latest/download/Yuki-Setup.exe)
[![Portable](https://img.shields.io/badge/Portable-Yuki--Portable.exe-2d264b?style=for-the-badge)](https://github.com/foxen2005/yuki/releases/latest/download/Yuki-Portable.exe)

[![Sitio](https://img.shields.io/badge/sitio-foxen2005.github.io%2Fyuki-0ea5e9?style=flat-square)](https://foxen2005.github.io/yuki/)
[![Electron 35](https://img.shields.io/badge/Electron-35-47848f?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-green?style=flat-square)](LICENSE)
[![Windows x64](https://img.shields.io/badge/Windows-10%20%2F%2011%20x64-0078d4?style=flat-square&logo=windows&logoColor=white)](#instalación)

</div>

---

## Instalación

| | Archivo | Para qué |
|---|---|---|
| **Instalador** (recomendado) | [`Yuki-Setup.exe`](https://github.com/foxen2005/yuki/releases/latest/download/Yuki-Setup.exe) (85 MB) | Uso normal. Crea acceso directo, permite elegir carpeta, se desinstala desde Windows. **Se actualiza solo.** |
| **Portable** | [`Yuki-Portable.exe`](https://github.com/foxen2005/yuki/releases/latest/download/Yuki-Portable.exe) (85 MB) | Sin instalación. Los datos quedan en `%APPDATA%\Yuki`. No se auto-actualiza. |

Requiere Windows 10/11 x64. El ejecutable aún no está firmado, así que SmartScreen puede pedir confirmación la primera vez ("Más información → Ejecutar de todas formas"). Todas las versiones en [Releases](https://github.com/foxen2005/yuki/releases).

## Qué hace

- **Sesiones persistentes** — cada app tiene su propia partición de Chromium. Cookies y login sobreviven al reinicio; puedes tener dos Gmail con cuentas distintas.
- **RAM bajo control** — monitor de memoria por app y auto-sleep configurable (por app y por minutos de inactividad). Las apps dormidas despiertan donde estaban, y tras 2 h de sueño se libera su proceso completo.
- **Disco bajo control** — límite de caché de 200 MB por app y un botón para liberar cachés (incluido el CacheStorage de los Service Workers) sin cerrar sesión en ninguna app.
- **Bloqueo con PIN** — al minimizar, pide PIN al restaurar. El PIN se guarda cifrado con `safeStorage` (llavero de Windows).
- **Notificaciones nativas** — reenviadas desde las apps web, con sonido configurable (o el tuyo), volumen y No molestar.
- **Corrector ortográfico** — español (es-419) + inglés; click derecho sobre la palabra subrayada muestra sugerencias, en cualquier app.
- **Login de Google** — ventana dedicada para iniciar sesión en Gmail y apps de Google, que bloquean el login embebido. Incluye supresión del error 2002 de Gmail.
- **Atajos que no molestan** — `Ctrl+1…9` cambia de app solo cuando Yuki está en primer plano. Nunca captura teclas globalmente.
- **Instancia única** — abrir Yuki de nuevo trae la ventana existente al frente.
- **Actualizaciones automáticas** — el instalador revisa GitHub Releases al arrancar y cada 4 h, descarga en segundo plano y avisa; tú eliges cuándo reiniciar (si no, se instala al cerrar).
- **Backup** — exporta/importa toda la configuración (apps, íconos, ajustes) en un JSON.
- **Interfaz oscura** — sidebar compacto con drag & drop, efecto acrílico, íconos Lucide o los tuyos.

## Cómo empezar

1. Instala y abre Yuki.
2. Abre **Configuración** (⚙ abajo del sidebar). Elige apps del catálogo (Mensajería, Email, Productividad, Videollamadas) o agrega cualquier URL con nombre e ícono.
3. Inicia sesión una vez en cada app. Después Yuki vive en la bandeja del sistema: click en el ícono para mostrar/ocultar, click derecho para salir.

## Desarrollo

```bash
git clone https://github.com/foxen2005/yuki.git
cd yuki
npm install
npm start          # app en modo dev
npm run build      # genera dist/Yuki-Setup.exe (NSIS) y dist/Yuki-Portable.exe
npm run release    # build + publica en GitHub Releases con latest.yml (requiere GH_TOKEN)
```

Requiere Node.js 20+ y npm 10+.

### Arquitectura

```
src/
├── main/
│   ├── index.js           — entrada, instancia única, flags de Chromium, ciclo de vida
│   ├── window.js          — BrowserWindow, bandeja, atajos locales (Ctrl+1..9)
│   ├── view-manager.js    — WebContentsView por app: crear/dormir/despertar/destruir,
│   │                        layout, menú contextual + corrector, monitor de RAM
│   ├── session-manager.js — User-Agent y client hints por sesión
│   ├── google-auth.js     — ventana de login de Google
│   ├── ipc-handlers.js    — todos los ipcMain.handle/on
│   ├── permissions.js     — permisos de sitios (preguntar una vez, recordar)
│   ├── updater.js         — auto-actualización desde GitHub Releases
│   └── autosave.js        — persistencia de estado antes de salir
├── renderer/
│   ├── index.html         — shell + panel de configuración + catálogo de apps
│   ├── renderer.js        — lógica de UI (solo usa window.yukiAPI)
│   └── styles.css
└── preload/
    ├── renderer-preload.js — contextBridge: expone window.yukiAPI
    ├── webview-preload.js  — ajustes de compatibilidad en las apps web
    └── auth-preload.js     — ídem para la ventana de login de Google
```

**Modelo de seguridad:** la ventana principal corre con `contextIsolation: true` y `nodeIntegration: false`; el renderer habla con el proceso principal solo a través de `window.yukiAPI`. Las vistas de apps web corren con `sandbox: true` y `nodeIntegration: false`; usan `contextIsolation: false` únicamente para que `webview-preload.js` pueda ajustar `window.chrome` / `navigator.*` y las apps no rechacen el cliente. Detalle completo en [Seguridad](#seguridad).

La referencia completa de IPC y las reglas para contribuir están en [CONTRIBUTING.md](CONTRIBUTING.md).

## Seguridad

Yuki abre sitios de terceros con tus sesiones dentro, así que esto importa. Lo que hay hoy, verificable en el código:

| | Dónde |
|---|---|
| **El shell no tiene acceso a Node.** `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`; la UI habla con el proceso principal solo por `window.yukiAPI` (contextBridge) con una lista cerrada de canales. | `src/main/window.js`, `src/preload/renderer-preload.js` |
| **Content-Security-Policy estricta en el shell.** Solo scripts locales; Lucide va vendorizado con versión fijada, no desde una CDN. | `src/renderer/index.html` |
| **Una sesión aislada por app.** Cada app vive en su propia partición de Chromium (`persist:<id>`): cookies, storage y caché no se comparten entre apps. | `src/main/view-manager.js` |
| **Las apps web corren sandboxed y sin Node.** `sandbox: true`, `nodeIntegration: false`. El preload solo puede enviar dos mensajes al proceso principal: notificación y abrir-enlace-externo. | `src/main/view-manager.js`, `src/preload/webview-preload.js` |
| **Permisos con pregunta.** Cámara, micrófono, ubicación y captura de pantalla se preguntan una vez por sitio y se recuerdan (`permissions.json`, reiniciable desde Configuración). MIDI, HID, serial y USB se niegan siempre. | `src/main/permissions.js` |
| **PIN cifrado** con `safeStorage` (DPAPI, ligado a tu usuario de Windows), nunca en texto plano. Con el PIN activo, las vistas se ocultan de verdad. | `src/main/ipc-handlers.js` |
| **Enlaces a otros dominios abren en tu navegador**, no dentro de Yuki. Solo `http(s):`. | `src/main/view-manager.js` |
| **Sin telemetría, sin cuenta, sin servidor propio.** La única conexión de Yuki (no de tus apps) es a GitHub Releases para buscar actualizaciones. | — |
| **Entradas escapadas.** Nombres, URLs, íconos e ids de apps (incluidos backups importados) se escapan antes de tocar el DOM. | `src/renderer/renderer.js` |

Lo que **no** hay todavía: el ejecutable no está firmado con certificado de código (SmartScreen avisa la primera vez y no hay forma de verificar el origen del binario). Las actualizaciones se descargan por HTTPS desde GitHub y `electron-updater` valida el hash SHA-512 publicado en `latest.yml`.

¿Encontraste algo? Abre un issue o escribe a Digital Fox; se agradece el reporte responsable.

## Licencia

MIT. Hecho en Chile por [Digital Fox](https://github.com/foxen2005).
