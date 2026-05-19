# Yuki

A multi-app desktop client for Windows — one sidebar, all your web apps in persistent sessions.

![Yuki screenshot](docs/screenshot.png)

## Features

- **Persistent sessions** — each app gets its own Chrome partition; cookies and login state survive restarts
- **Google Auth** — built-in OAuth flow for Gmail and other Google apps
- **RAM management** — per-app memory monitor, configurable auto-sleep, two-level sleep/wake
- **PIN lock screen** — optional encrypted PIN stored with Electron safeStorage
- **Notifications** — native OS notifications forwarded from web apps
- **Dark UI** — compact sidebar, smooth transitions, custom CSS injection per app

## Installation

### Prerequisites
- Node.js 20+
- npm 10+

```bash
git clone https://github.com/digitalfox-studio/yuki.git
cd yuki
npm install
npm start
```

### Build Windows installer

```bash
npm run build
```

Generates `dist/Yuki Setup 0.2.0.exe` (NSIS, x64).

## Architecture

```
src/
├── main/
│   ├── index.js          — app entry point, flags, lifecycle
│   ├── window.js         — BrowserWindow + tray + shortcuts
│   ├── view-manager.js   — WebContentsView lifecycle (create/sleep/wake/destroy)
│   ├── session-manager.js— Chrome UA spoofing per session
│   ├── google-auth.js    — OAuth popup flow
│   ├── ipc-handlers.js   — all ipcMain.handle/on registrations
│   └── autosave.js       — before-quit state persistence
├── renderer/
│   ├── index.html        — shell HTML
│   ├── renderer.js       — UI logic (uses window.yukiAPI only)
│   └── styles.css        — all styles
└── preload/
    ├── renderer-preload.js — contextBridge: exposes window.yukiAPI
    ├── webview-preload.js  — Chrome API spoofing for web app windows
    └── auth-preload.js     — spoofing for the Google auth popup
```

**Security model:**
- Main BrowserWindow: `contextIsolation: true`, `nodeIntegration: false` — renderer talks to main only via `window.yukiAPI` (contextBridge)
- WebContentsViews: `contextIsolation: false` — required so `webview-preload.js` can override `window.chrome`, `navigator.*` on the web app's own window

## Adding apps to the catalog

The built-in catalog lives in `renderer.js` → `DEFAULT_CATALOG`. Each entry:

```js
{
  id: 'myapp',
  name: 'My App',
  url: 'https://app.example.com',
  icon: '../../icons/myapp.png',  // 64×64 PNG in icons/
  color: '#1a73e8',
  googleAuth: false,              // true = show Google auth banner when needed
}
```

Place a 64×64 PNG icon in `icons/` and add the entry to the array.

## IPC channels

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full IPC reference.

## License

MIT
