# Contributing to Yuki

## Dev setup

```bash
git clone https://github.com/digitalfox-studio/yuki.git
cd yuki
npm install
npm start        # launch app in dev mode
npm run build    # build Windows NSIS installer
```

DevTools: press **F12** or **Ctrl+Shift+I** while the app is open.

Per-view DevTools: right-click the sidebar icon → "Abrir DevTools" (or call `window.yukiAPI.openDevTools(id)` from the renderer console).

---

## Adding apps to the built-in catalog

1. Create a 64×64 PNG icon and place it in `icons/yourapp.png`
2. Open `src/renderer/renderer.js` and find `DEFAULT_CATALOG`
3. Add an entry:

```js
{
  id: 'yourapp',          // unique slug, used as partition name
  name: 'Your App',
  url: 'https://yourapp.com',
  icon: '../../icons/yourapp.png',
  color: '#hexcolor',
  googleAuth: false,      // set true for Google-authenticated apps
}
```

4. For Google apps, set `googleAuth: true` — the renderer will show the auth banner automatically when the view navigates to `accounts.google.com`

---

## IPC reference

All renderer → main communication goes through `window.yukiAPI` (exposed via contextBridge in `src/preload/renderer-preload.js`).

### View lifecycle (invoke/handle)

| Method | IPC channel | Payload | Returns |
|---|---|---|---|
| `yukiAPI.openView(id, url, partition)` | `view:open` | `{id, url, partition}` | `void` |
| `yukiAPI.sleepView(id)` | `view:sleep` | `{id}` | `void` |
| `yukiAPI.destroyView(id)` | `view:destroy` | `{id}` | `void` |
| `yukiAPI.reloadView(id)` | `view:reload` | `{id}` | `void` |
| `yukiAPI.resizeViews()` | `view:resize-all` | — | `void` |
| `yukiAPI.openDevTools(id)` | `view:devtools` | `{id}` | `void` |
| `yukiAPI.setAutoSleep(ms)` | `view:set-auto-sleep` | `{ms}` | `void` |

### Auth and sessions (invoke/handle)

| Method | IPC channel | Notes |
|---|---|---|
| `yukiAPI.openGoogleAuth(partition, clearFirst)` | `open-google-auth` | `ipcMain.on` (fire and forget) |
| `yukiAPI.clearSession(partition)` | `session:clear` | Clears cookies + cache |

### Config (invoke/handle)

| Method | IPC channel | Notes |
|---|---|---|
| `yukiAPI.exportConfig(data)` | `config:export` | Shows save dialog, writes JSON |
| `yukiAPI.importConfig()` | `config:import` | Shows open dialog, returns parsed JSON |
| `yukiAPI.getUserdataPath()` | `get-userdata-path` | Returns `app.getPath('userData')` |
| `yukiAPI.readAutosave()` | `autosave:read` | Returns parsed JSON or null |
| `yukiAPI.openUserdata()` | `open-userdata` | Opens folder in Explorer (`ipcMain.on`) |

### PIN (invoke/handle, encrypted with safeStorage)

| Method | IPC channel |
|---|---|
| `yukiAPI.savePin(pin)` | `pin:save` |
| `yukiAPI.verifyPin(pin)` | `pin:verify` |
| `yukiAPI.hasPin()` | `pin:has` |
| `yukiAPI.deletePin()` | `pin:delete` |

### Events — Main → Renderer

Subscribe with `yukiAPI.on(channel, callback)`. Returns an unsubscribe function.

| Channel | Payload | When |
|---|---|---|
| `view:loading-start` | `{id}` | View starts loading |
| `view:loading-stop` | `{id}` | View finishes loading |
| `view:title-updated` | `{id, title}` | Page title changes |
| `view:navigate` | `{id, url}` | Navigation completes |
| `view:needs-google-auth` | `{id, partition}` | View redirected to accounts.google.com |
| `view:notification` | `{id, title, body, icon}` | Web app triggered a notification |
| `view:memory-report` | `[{id, privateMB}]` | Every 30s from ViewManager monitor |
| `session:cleared` | `{partition}` | After `session:clear` completes |
| `google-auth-done` | `{partition}` | Google auth popup closed successfully |
| `yuki-window-show` | — | App window restored from tray |
| `switch-app-index` | `{index}` | Keyboard shortcut Ctrl+1-9 |
| `open-webview-devtools` | — | F12 / Ctrl+Shift+I |

### Events from WebContentsView preloads

These are sent from `webview-preload.js` via `ipcRenderer.send()` and received in `view-manager.js` via `wc.ipc.on()`:

| Channel | Payload | Action in ViewManager |
|---|---|---|
| `view:notification` | `{title, body, icon}` | Forwarded to renderer with `{id}` added |
| `view:open-external` | `url` | Opens in system browser via `shell.openExternal` |

---

## Security rules

1. **Never enable `nodeIntegration: true`** on the main BrowserWindow — use contextBridge only
2. **Never add IPC channels** to `ALLOWED_EVENTS` in `renderer-preload.js` without auditing what data they expose
3. **Never commit `client_secret_*.json`** — it contains OAuth credentials; it is gitignored
4. **Never clear sessions** unless the user explicitly requests it — clearing Google cookies logs the user out
5. **`contextIsolation: false`** is intentional on WebContentsViews only — it lets `webview-preload.js` override `window.chrome` and `navigator.*` to avoid bot detection. This is sandboxed to those views and does not affect the main renderer.

---

## Release checklist

- [ ] Bump version in `package.json`
- [ ] `npm run build` — no errors, installer generated in `dist/`
- [ ] Test Gmail login from scratch (clear `userData/Partitions/persist_gmail/`)
- [ ] Test PIN lock/unlock, PIN migration from v0.1.0
- [ ] Test backup export/import round-trip
- [ ] Test sleep/wake on 3+ apps
- [ ] Tag: `git tag v0.2.0 && git push --tags`
