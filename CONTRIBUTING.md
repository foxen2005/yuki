# Contributing to Yuki

## Dev setup

```bash
git clone https://github.com/foxen2005/yuki.git
cd yuki
npm install
npm start        # launch app in dev mode
npm run build    # NSIS installer + portable exe in dist/
npm run start:dev  # same as start, with --inspect=9229 for the main process
```

DevTools: there are no global shortcuts (they were removed so Yuki never captures keys from other apps). Open the shell DevTools with `win.webContents.openDevTools()` from the inspector, or a view's DevTools with `window.yukiAPI.openDevTools(id)` from the renderer console.

---

## Adding apps to the built-in catalog

The catalog is plain HTML in `src/renderer/index.html` (sections "Mensajería", "Email", "Productividad", "Videollamadas"). Add a `.catalog-item` to the right `.catalog-grid`:

```html
<div class="catalog-item" role="button" tabindex="0"
     data-name="Your App"
     data-icon="lucide:globe"
     data-url="https://yourapp.com">
  <div class="icon"><i data-lucide="globe" class="icon-lucide"></i></div><div class="name">Your App</div>
</div>
```

- `data-icon` is either `lucide:<name>` (any current [Lucide](https://lucide.dev) icon; brand icons like `github`/`twitter` no longer exist) or an emoji.
- For an animated default icon, add `data-icon-key` and register the file in `DEFAULT_ICONS` (`renderer.js`).
- Google apps need nothing special: `view-manager.js` detects navigation to `accounts.google.com` and the renderer shows the login banner.

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
| `yukiAPI.resizeViews(leftOffset, rightCrop)` | `view:resize-all` | `72,12` normal · `9999,12` hides views (settings/lock open). ViewManager remembers the last layout. | `void` |
| `yukiAPI.captureActive()` | `view:capture-active` | — | data URL of the active view (blur behind settings) |
| `yukiAPI.openDevTools(id)` | `view:devtools` | `{id}` | `void` |
| `yukiAPI.setAutoSleep(minutes)` | `view:set-auto-sleep` | `0` disables | `void` |
| `yukiAPI.setSleepable(id, bool)` | `view:set-sleepable` | per-app toggle honoured by auto-sleep | `void` |

### Auth and sessions (invoke/handle)

| Method | IPC channel | Notes |
|---|---|---|
| `yukiAPI.openGoogleAuth(partition, clearFirst)` | `open-google-auth` | `ipcMain.on` (fire and forget) |
| `yukiAPI.clearSession(partition)` | `session:clear` | Clears cookies + cache, then reloads the view's base URL |

### Config (invoke/handle)

| Method | IPC channel | Notes |
|---|---|---|
| `yukiAPI.exportConfig(data)` | `config:export` | Shows save dialog, writes JSON |
| `yukiAPI.importConfig()` | `config:import` | Shows open dialog, returns parsed JSON |
| `yukiAPI.getUserdataPath()` | `get-userdata-path` | Returns `app.getPath('userData')` |
| `yukiAPI.readAutosave()` | `autosave:read` | Returns parsed JSON or null |
| `yukiAPI.openUserdata()` | `open-userdata` | Opens folder in Explorer (`ipcMain.on`) |
| `yukiAPI.hideWindow()` | `window:hide` | Minimize to tray (`ipcMain.on`) |
| `yukiAPI.quitApp()` | `window:quit` | Real quit (`ipcMain.on`) |

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
| `view:memory-report` | `[{id, privateMB}]` | Every 30s from ViewManager monitor (also sent empty) |
| `session:cleared` | `{id}` | After `session:clear` completes |
| `google-auth-done` | `partition` | Google auth popup closed successfully |
| `yuki-window-show` | — | Window shown/restored (tray, menu, second instance, taskbar restore) — triggers the PIN lock |
| `switch-app-index` | `index` | Ctrl+1..9 while Yuki (shell or a view) has focus |

### Events from WebContentsView preloads

These are sent from `webview-preload.js` via `ipcRenderer.send()` and received in `view-manager.js` via `wc.ipc.on()`:

| Channel | Payload | Action in ViewManager |
|---|---|---|
| `view:notification` | `{title, body, icon}` | Forwarded to renderer with `{id}` added |
| `view:open-external` | `url` | Opens in system browser via `shell.openExternal` |

---

## Native views vs DOM

`WebContentsView`s are native and always paint **above** the renderer DOM. Anything in the shell that must be visible over an app (settings panel, PIN lock, toast, Google banner) either lives in the top 40px strip (the views start at y=40) or hides the views first. `syncViewLayout()` in `renderer.js` is the single place that decides that; call it instead of `resizeViews()` directly.

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
- [ ] Test PIN lock/unlock (views must be hidden behind the lock), PIN migration from v0.1.0
- [ ] Test Ctrl+1..9 does NOT fire while another app is focused
- [ ] Test spellcheck suggestions in WhatsApp and Gmail
- [ ] Test backup export/import round-trip
- [ ] Test sleep/wake on 3+ apps
- [ ] Tag and release with both exes: `git tag vX.Y.Z && git push --tags && gh release create vX.Y.Z "dist/Yuki Setup X.Y.Z.exe" "dist/Yuki X.Y.Z.exe"`
- [ ] Update the download links in `README.md` and `docs/index.html`
