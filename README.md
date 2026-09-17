<div align="center">

<img src="icons/icon.png" width="96" alt="Yuki">

# Yuki

**Todas tus apps web. Una sola ventana.**

Cliente de escritorio para Windows que reúne WhatsApp, Gmail, Telegram, Notion, Slack y cualquier URL en un solo lugar, con sesiones persistentes, control de RAM y bloqueo con PIN.

[![Descargar instalador](https://img.shields.io/badge/Descargar-Yuki%20Setup%200.2.0-7c3aed?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/foxen2005/yuki/releases/download/v0.2.0/Yuki.Setup.0.2.0.exe)
[![Portable](https://img.shields.io/badge/Portable-Yuki%200.2.0.exe-2d264b?style=for-the-badge)](https://github.com/foxen2005/yuki/releases/download/v0.2.0/Yuki.0.2.0.exe)

[![Sitio](https://img.shields.io/badge/sitio-foxen2005.github.io%2Fyuki-0ea5e9?style=flat-square)](https://foxen2005.github.io/yuki/)
[![Electron 35](https://img.shields.io/badge/Electron-35-47848f?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Licencia MIT](https://img.shields.io/badge/licencia-MIT-green?style=flat-square)](LICENSE)
[![Windows x64](https://img.shields.io/badge/Windows-10%20%2F%2011%20x64-0078d4?style=flat-square&logo=windows&logoColor=white)](#instalación)

</div>

---

## Instalación

| | Archivo | Para qué |
|---|---|---|
| **Instalador** | [`Yuki.Setup.0.2.0.exe`](https://github.com/foxen2005/yuki/releases/download/v0.2.0/Yuki.Setup.0.2.0.exe) (85 MB) | Uso normal. Crea acceso directo, permite elegir carpeta, se desinstala desde Windows. |
| **Portable** | [`Yuki.0.2.0.exe`](https://github.com/foxen2005/yuki/releases/download/v0.2.0/Yuki.0.2.0.exe) (85 MB) | Sin instalación. Los datos quedan en `%APPDATA%\Yuki`. |

Requiere Windows 10/11 x64. El ejecutable aún no está firmado, así que SmartScreen puede pedir confirmación la primera vez ("Más información → Ejecutar de todas formas"). Todas las versiones en [Releases](https://github.com/foxen2005/yuki/releases).

## Qué hace

- **Sesiones persistentes** — cada app tiene su propia partición de Chromium. Cookies y login sobreviven al reinicio; puedes tener dos Gmail con cuentas distintas.
- **RAM bajo control** — monitor de memoria por app y auto-sleep configurable (por app y por minutos de inactividad). Las apps dormidas despiertan donde estaban.
- **Bloqueo con PIN** — al minimizar, pide PIN al restaurar. El PIN se guarda cifrado con `safeStorage` (llavero de Windows).
- **Notificaciones nativas** — reenviadas desde las apps web, con sonido configurable (o el tuyo), volumen y No molestar.
- **Corrector ortográfico** — español (es-419) + inglés; click derecho sobre la palabra subrayada muestra sugerencias, en cualquier app.
- **Login de Google** — ventana dedicada para iniciar sesión en Gmail y apps de Google, que bloquean el login embebido. Incluye supresión del error 2002 de Gmail.
- **Atajos que no molestan** — `Ctrl+1…9` cambia de app solo cuando Yuki está en primer plano. Nunca captura teclas globalmente.
- **Instancia única** — abrir Yuki de nuevo trae la ventana existente al frente.
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
npm run build      # genera dist/Yuki Setup 0.2.0.exe (NSIS) y dist/Yuki 0.2.0.exe (portable)
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

**Modelo de seguridad:** la ventana principal corre con `contextIsolation: true` y `nodeIntegration: false`; el renderer habla con el proceso principal solo a través de `window.yukiAPI`. Las vistas de apps web usan `contextIsolation: false` únicamente para que `webview-preload.js` pueda ajustar `window.chrome` / `navigator.*` y las apps no rechacen el cliente; ese preload no expone Node.

La referencia completa de IPC y las reglas para contribuir están en [CONTRIBUTING.md](CONTRIBUTING.md).

## Licencia

MIT. Hecho en Chile por [Digital Fox](https://github.com/foxen2005).
