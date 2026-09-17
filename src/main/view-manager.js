const { WebContentsView, session, shell, Menu } = require('electron')
const path = require('path')
const { spoofSession } = require('./session-manager')
const { bindAppSwitchKeys } = require('./window')

class ViewManager {
  constructor(win) {
    this.win = win
    this.views = new Map()        // id → { view, url, visible, sleeping, sleepUrl }
    this._lastActive = new Map()  // id → timestamp
    this._activeId = null
    this._autoSleepMs = 30 * 60 * 1000
    this._monitorInterval = null
    // Layout vigente pedido por el renderer (72 = normal; 9999 = vistas ocultas
    // porque settings o el lock están abiertos). Se recuerda para que activate()
    // y el resize de la ventana no devuelvan la vista encima del panel.
    this._layout = { leftOffset: 72, rightCrop: 12 }

    win.on('resize', () => this.resizeAll())
    win._viewManager = this
  }

  getViewBounds() {
    const [w, h] = this.win.getContentSize()
    const { leftOffset, rightCrop } = this._layout
    return {
      x: Math.floor(leftOffset),
      y: 40,
      width: Math.max(Math.floor(w - leftOffset - rightCrop), 100),
      height: Math.max(Math.floor(h - 40 - 12), 100),
    }
  }

  create(id, url, partition) {
    if (this.views.has(id)) return

    const ses = session.fromPartition(partition)
    spoofSession(ses)

    ses.setPermissionRequestHandler((_, permission, callback) => {
      callback(!['midi', 'midiSysex'].includes(permission))
    })
    ses.setPermissionCheckHandler((_, permission) => {
      return !['midi', 'midiSysex'].includes(permission)
    })

    // Corrector ortográfico: español + inglés. Sin esto Electron usa solo el
    // idioma del sistema y las sugerencias no aparecen para el otro idioma.
    try {
      // No existe es-CL en Chromium; es-419 (Latinoamérica) es el más cercano
      const avail = ses.availableSpellCheckerLanguages
      const es = ['es-419', 'es', 'es-ES'].find(l => avail.includes(l))
      const langs = [es, 'en-US'].filter(l => l && avail.includes(l))
      if (langs.length) ses.setSpellCheckerLanguages(langs)
    } catch (e) {}

    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: true,
        preload: path.join(__dirname, '../preload/webview-preload.js'),
      },
    })

    this.views.set(id, { view, url, visible: false, sleeping: false, sleepUrl: null, sleepable: false })
    this._attachListeners(view, id)
    view.webContents.loadURL(url)
  }

  openView(id, url, partition) {
    if (!this.views.has(id)) this.create(id, url, partition)
    this.activate(id, url)
  }

  activate(id, url) {
    const entry = this.views.get(id)
    if (!entry) return

    // Despertar si estaba en sleep
    if (entry.sleeping) {
      const wakeUrl = entry.sleepUrl || url || entry.url
      entry.view.webContents.loadURL(wakeUrl)
      entry.sleeping = false
      entry.sleepUrl = null
    }

    // Ocultar todas las otras vistas
    for (const [vid, e] of this.views) {
      if (vid !== id && e.visible) {
        this.win.contentView.removeChildView(e.view)
        e.visible = false
      }
    }

    // Mostrar esta vista
    if (!entry.visible) {
      entry.view.setBounds(this.getViewBounds())
      this.win.contentView.addChildView(entry.view)
      entry.visible = true
    } else {
      entry.view.setBounds(this.getViewBounds())
    }

    this._activeId = id
    this._lastActive.set(id, Date.now())
  }

  sleep(id) {
    if (id === this._activeId) return
    const entry = this.views.get(id)
    if (!entry || entry.sleeping) return

    const currentUrl = entry.view.webContents.getURL()
    entry.sleepUrl = (currentUrl && currentUrl !== 'about:blank') ? currentUrl : entry.url
    entry.view.webContents.loadURL('about:blank')
    entry.sleeping = true

    if (entry.visible) {
      this.win.contentView.removeChildView(entry.view)
      entry.visible = false
    }
  }

  destroy(id) {
    const entry = this.views.get(id)
    if (!entry) return
    if (entry.visible) {
      this.win.contentView.removeChildView(entry.view)
      entry.visible = false
    }
    try { entry.view.webContents.close() } catch(e) {}
    this.views.delete(id)
    this._lastActive.delete(id)
  }

  reload(id) {
    const entry = this.views.get(id)
    if (!entry) return
    if (entry.sleeping) {
      // Dormida = about:blank; recargar eso no sirve. Se despierta (oculta).
      entry.view.webContents.loadURL(entry.sleepUrl || entry.url)
      entry.sleeping = false
      entry.sleepUrl = null
      return
    }
    entry.view.webContents.reload()
  }

  // Tras limpiar la sesión: volver a la URL base para que la página suelte el
  // estado en memoria (un reload conserva la SPA logueada)
  restart(id) {
    const entry = this.views.get(id)
    if (!entry || entry.sleeping) return
    entry.view.webContents.loadURL(entry.url)
  }

  navigate(id, url) {
    const entry = this.views.get(id)
    if (!entry) return
    entry.view.webContents.loadURL(url)
    entry.url = url
  }

  // Sin argumentos (resize de ventana) reaplica el layout vigente
  resizeAll(leftOffset, rightCrop) {
    if (leftOffset !== undefined) this._layout = { leftOffset, rightCrop: rightCrop ?? 12 }
    const bounds = this.getViewBounds()
    for (const entry of this.views.values()) {
      if (entry.visible) entry.view.setBounds(bounds)
    }
  }

  async captureActive() {
    if (!this._activeId) return null
    const entry = this.views.get(this._activeId)
    if (!entry || entry.sleeping) return null
    try {
      const image = await entry.view.webContents.capturePage()
      return image.toDataURL()
    } catch(e) { return null }
  }

  openDevTools(id) {
    const entry = this.views.get(id)
    if (entry) entry.view.webContents.openDevTools()
  }

  setSleepable(id, value) {
    const entry = this.views.get(id)
    if (entry) entry.sleepable = !!value
  }

  setAutoSleepMinutes(minutes) {
    this._autoSleepMs = minutes > 0 ? minutes * 60 * 1000 : 0
  }

  startMemoryMonitor(intervalMs = 30000) {
    this._monitorInterval = setInterval(async () => {
      await this._checkAutoDeepSleep()

      const report = []
      for (const [id, entry] of this.views) {
        if (entry.sleeping) continue
        try {
          const info = await entry.view.webContents.getProcessMemoryInfo()
          report.push({ id, privateMB: Math.round(info.private / 1024) })
        } catch(e) {}
      }
      // Enviar también vacío para que la lista muestre 'Sin apps activas'
      if (!this.win.isDestroyed()) {
        this.win.webContents.send('view:memory-report', report)
      }
    }, intervalMs)
  }

  stopMemoryMonitor() {
    if (this._monitorInterval) {
      clearInterval(this._monitorInterval)
      this._monitorInterval = null
    }
  }

  async _checkAutoDeepSleep() {
    if (!this._autoSleepMs) return
    const now = Date.now()
    for (const [id, entry] of this.views) {
      if (id === this._activeId) continue
      if (entry.sleeping) continue
      if (!entry.sleepable) continue  // respetar el toggle del usuario
      const lastActive = this._lastActive.get(id) || 0
      if (now - lastActive > this._autoSleepMs) {
        this.sleep(id)
      }
    }
  }

  _attachListeners(view, id) {
    const wc = view.webContents
    bindAppSwitchKeys(wc, this.win)

    wc.on('did-start-loading', () => {
      if (!this.win.isDestroyed()) this.win.webContents.send('view:loading-start', { id })
    })

    wc.on('did-stop-loading', () => {
      if (!this.win.isDestroyed()) this.win.webContents.send('view:loading-stop', { id })
      this._injectCSS(view, id)
    })

    wc.on('page-title-updated', (_, title) => {
      if (!this.win.isDestroyed()) this.win.webContents.send('view:title-updated', { id, title })
    })

    wc.on('did-navigate', (_, navUrl) => {
      if (!this.win.isDestroyed()) {
        this.win.webContents.send('view:navigate', { id, url: navUrl })
        // Detectar redirección a login de Google
        if (navUrl.includes('accounts.google.com') && !navUrl.includes('ServiceLogin')) {
          this.win.webContents.send('view:needs-google-auth', { id, partition: `persist:${id}` })
        }
      }
    })

    wc.on('did-fail-load', (_, errCode, errDesc) => {
      if (!this.win.isDestroyed()) this.win.webContents.send('view:loading-stop', { id })
    })

    wc.setWindowOpenHandler(({ url: openUrl }) => {
      if (/^https?:/.test(openUrl)) {
        try {
          const currentBase = new URL(wc.getURL()).hostname.split('.').slice(-2).join('.')
          const openBase    = new URL(openUrl).hostname.split('.').slice(-2).join('.')
          if (openBase !== currentBase) shell.openExternal(openUrl)
        } catch(e) {
          shell.openExternal(openUrl)
        }
      }
      return { action: 'deny' }
    })

    wc.on('context-menu', (_, params) => {
      const { selectionText, isEditable, editFlags, misspelledWord, dictionarySuggestions } = params
      const items = []
      // Sugerencias del corrector: al reemplazar el menú nativo se perdían.
      // replaceMisspelling() sustituye la palabra bajo el cursor en la página.
      if (isEditable && misspelledWord) {
        const sugg = (dictionarySuggestions || []).slice(0, 6)
        if (sugg.length) {
          sugg.forEach(word => items.push({ label: word, click: () => wc.replaceMisspelling(word) }))
        } else {
          items.push({ label: 'Sin sugerencias', enabled: false })
        }
        items.push({
          label: `Agregar "${misspelledWord}" al diccionario`,
          click: () => wc.session.addWordToSpellCheckerDictionary(misspelledWord),
        })
        items.push({ type: 'separator' })
      }
      if (isEditable) {
        if (editFlags.canCut && selectionText)  items.push({ role: 'cut',       label: 'Cortar' })
        if (editFlags.canCopy && selectionText) items.push({ role: 'copy',      label: 'Copiar' })
        if (editFlags.canPaste)                 items.push({ role: 'paste',     label: 'Pegar' })
        if (editFlags.canSelectAll)             items.push({ type: 'separator' }, { role: 'selectAll', label: 'Seleccionar todo' })
      } else if (selectionText && selectionText.trim()) {
        items.push({ role: 'copy', label: 'Copiar' })
      }
      if (items.length) Menu.buildFromTemplate(items).popup()
    })

    // Mensajes desde webview-preload.js
    wc.ipc.on('view:notification', (_, data) => {
      if (!this.win.isDestroyed()) this.win.webContents.send('view:notification', { id, ...data })
    })

    wc.ipc.on('view:open-external', (_, url) => {
      if (/^https?:/.test(url)) shell.openExternal(url)
    })
  }

  _injectCSS(view, id) {
    const url = view.webContents.getURL()
    if (url.includes('web.whatsapp.com')) {
      view.webContents.insertCSS(
        '[data-testid="app-download-banner"],[data-testid="banner-container"],' +
        'a[href*="whatsapp.com/dl"],div:has(>a[href*="whatsapp.com/dl"]){display:none!important}'
      ).catch(() => {})
    }
    if (url.includes('mail.google.com')) {
      // Suprimir el error 2002 de Gmail (Locksmith / SW sync failure):
      // - Auto-click en dialogs de error
      // - Ocultar el banner superior "N.º 2002"
      view.webContents.executeJavaScript(`
        (function() {
          // Guard: did-stop-loading se dispara varias veces por sesión; sin esto
          // se acumulaban observers que recorrían todo el DOM en cada mutación
          if (window.__yukiGmail2002) return
          window.__yukiGmail2002 = true
          const ERROR_RE = /N\\.\\u00ba\\s*2002|n\\.\\u00b0\\s*2002/i

          const dismissDialogs = () => {
            document.querySelectorAll('[role="dialog"],[role="alertdialog"]').forEach(d => {
              if (/2002|se produjo un error|error occurred/i.test(d.textContent)) {
                d.querySelectorAll('button').forEach(b => {
                  if (/^(aceptar|accept|ok)$/i.test(b.textContent.trim())) b.click()
                })
              }
            })
          }

          const hideBanner = () => {
            // Busca el banner delgado en la parte superior que contiene "N.º 2002"
            const walk = (root) => {
              for (const el of root.querySelectorAll('*')) {
                if (el.children.length > 0) continue
                if (!ERROR_RE.test(el.textContent)) continue
                // Sube por el árbol hasta encontrar el contenedor del banner
                let node = el.parentElement
                while (node && node !== document.body) {
                  const r = node.getBoundingClientRect()
                  if (r.width > 200 && r.height > 0 && r.height < 60) {
                    node.style.setProperty('display', 'none', 'important')
                    return
                  }
                  node = node.parentElement
                }
              }
            }
            walk(document)
          }

          const handle = () => { dismissDialogs(); hideBanner() }
          // Coalescer ráfagas de mutaciones en una sola pasada por frame
          let scheduled = false
          const schedule = () => {
            if (scheduled) return
            scheduled = true
            requestAnimationFrame(() => { scheduled = false; handle() })
          }
          new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true })
          handle()
        })()
      `).catch(() => {})
    }
  }
}

module.exports = ViewManager
