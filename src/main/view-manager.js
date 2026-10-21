const { WebContentsView, session, shell, Menu, clipboard, dialog, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { spoofSession } = require('./session-manager')
const { bindAppSwitchKeys } = require('./window')
const permissions = require('./permissions')
const lockWindow = require('./lock-window')

// Gmail, Docs y el buscador no enlazan al destino directamente: lo envuelven en
// su propio redirector (https://www.google.com/url?q=<destino>). Sin deshacer
// ese envoltorio el destino parece ser google.com, el enlace se tomaba como
// interno y el clic se perdía sin abrir nada.
function destinoReal(url) {
  try {
    const u = new URL(url)
    // google.com, google.cl, google.co.uk — pero NO www.google.evil.ru
    if (/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2,3})?$/i.test(u.hostname) && (u.pathname === '/url' || u.pathname === '/imgres')) {
      const real = u.searchParams.get('imgurl') || u.searchParams.get('q') || u.searchParams.get('url')
      if (real && /^https?:/.test(real)) return real
    }
  } catch (e) {}
  return url
}

// ¿El destino parece una pantalla de inicio de sesión?
//
// Es una heurística y va a fallar alguna vez: siempre habrá un sitio que llame
// "portal" a su login. Por eso equivocarse sale barato — el menú contextual de
// una flotante lleva "Abrir enlace en el navegador", que desatasca el caso.
// Preferimos el falso positivo: mandar un login al navegador molesta; atrapar
// un 2FA dentro de una flotante deja al usuario sin poder entrar.
const SUBDOMINIOS_LOGIN = /^(accounts|login|signin|auth|sso|oauth|idp|id|secure)\./i
const RUTAS_LOGIN = /\/(oauth2?|openid|saml|signin|sign-in|login|log-in|authorize|authenticate|servicelogin)(\/|$|\?)/i

function pareceLogin(url) {
  try {
    const u = new URL(url)
    return SUBDOMINIOS_LOGIN.test(u.hostname) || RUTAS_LOGIN.test(u.pathname)
  } catch (e) { return false }
}

// Esquemas que se pueden entregar al sistema. Es una lista blanca y no una
// negra a propósito: shell.openExternal lanza lo que Windows tenga registrado,
// y hay esquemas que ejecutan cosas (file:, ms-msdt:, search-ms:). Lo que no
// esté aquí no sale de Yuki.
// Deliberadamente corta. Se quedaron fuera msteams:, zoommtg:, slack: y
// compañía: esos lanzan una aplicación instalada, y una página puede llegar
// aquí con window.open() sin que el usuario haya hecho clic en nada. Los que
// quedan abren a lo sumo la ventana de redactar del cliente de correo o del
// teléfono.
const ESQUEMAS_EXTERNOS = /^(https?|mailto|tel|callto|sms|webcal):/i

function abrirFuera(url) {
  const destino = destinoReal(String(url || ''))
  if (!ESQUEMAS_EXTERNOS.test(destino)) return false
  // Con catch: openExternal devuelve una promesa y rechaza si Windows no tiene
  // nada registrado para el esquema (callto:, webcal: y sms: muy a menudo no lo
  // tienen). Sin él, una promesa rechazada suelta en el proceso principal.
  shell.openExternal(destino).catch(() => {})
  return true
}


class ViewManager {
  constructor(win) {
    this.win = win
    this.views = new Map()        // id → { view, url, visible, sleeping, sleepUrl }
    this._lastActive = new Map()  // id → timestamp
    this._activeId = null
    this._autoSleepMs = 30 * 60 * 1000
    this._monitorInterval = null
    // getProcessMemoryInfo() de cada vista solo se pide cuando el panel de
    // Configuración está abierto: es lo único que mira esos datos.
    this._reportMemory = false
    // Una vista dormida sigue teniendo su proceso vivo (~50 MB). Tras estas
    // horas se destruye entera y se recrea sola cuando el usuario vuelve.
    this._deepSleepMs = 2 * 60 * 60 * 1000
    // Layout vigente pedido por el renderer (72 = normal; 9999 = vistas ocultas
    // porque el panel de Configuración está abierto). Se recuerda para que
    // activate() y el resize de la ventana no devuelvan la vista encima del
    // panel. El bloqueo con PIN ya no pasa por aquí: lo tapa una ventana.
    this._layout = { leftOffset: 72, rightCrop: 12 }

    win.on('resize', () => this.resizeAll())
    // Las flotantes acompañan a la ventana principal a la bandeja (hide) o a la
    // barra de tareas (minimize) y vuelven con ella. Si está bloqueada no
    // vuelven: de eso se encarga lock-window al desbloquear.
    const verFlotantes = (visibles) => {
      // estaHabilitado() además de bloqueado(): al volver de la bandeja la
      // ventana se muestra antes de que el renderer pida el bloqueo, y en ese
      // hueco las flotantes aparecían con el correo abierto.
      if (visibles && (lockWindow.bloqueado() || lockWindow.estaHabilitado())) return
      this._verFlotantes(visibles)
    }
    win.on('hide',     () => verFlotantes(false))
    win.on('minimize', () => verFlotantes(false))
    win.on('show',     () => verFlotantes(true))
    win.on('restore',  () => verFlotantes(true))
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

    // Cámara/micrófono/ubicación se preguntan una vez por sitio (ver permissions.js)
    permissions.attach(ses, this.win)

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
        // contextIsolation:false es necesario para que webview-preload.js ajuste
        // window.chrome / navigator.* en el mundo de la página. sandbox:true sigue
        // siendo posible: el preload solo usa ipcRenderer, que Electron expone
        // también en renderers sandboxed.
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: true,
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
      entry.sleepSince = null
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

  // manual = lo pidió el usuario con "Liberar memoria". Esa orden se obedece
  // aunque haya flotantes abiertas; el que se frena es el automático.
  sleep(id, { manual = false } = {}) {
    if (id === this._activeId) return
    const entry = this.views.get(id)
    if (!entry || entry.sleeping) return

    // Trabajar dentro de una flotante no cuenta como actividad de la app (solo
    // activate() toca _lastActive), así que el auto-sleep de 30 min le cerraría
    // al usuario el documento que está editando. Mientras tenga flotantes
    // abiertas, la app no se duerme sola.
    if (!manual && this._tieneFlotantes(entry)) {
      this._lastActive.set(id, Date.now())
      return
    }

    const currentUrl = entry.view.webContents.getURL()
    entry.sleepUrl = (currentUrl && currentUrl !== 'about:blank') ? currentUrl : entry.url
    this._cerrarFlotantes(entry)
    entry.view.webContents.loadURL('about:blank')
    entry.sleeping = true
    entry.sleepSince = Date.now()

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
    // La entrada se borra justo después: si una flotante sobreviviera a un
    // beforeunload quedaría sin dueño, sin esconderse con la bandeja y sin
    // cerrarse nunca.
    this._cerrarFlotantes(entry, { forzar: true })
    try { entry.view.webContents.close() } catch(e) {}
    this.views.delete(id)
    this._lastActive.delete(id)
  }

  // Las flotantes son ventanas del sistema, no hijas del layout de Yuki: si no
  // se cierran a mano quedan huérfanas en pantalla cuando su app se duerme o
  // se borra.
  // No se vacía el conjunto a mano: close() puede rechazarlo un beforeunload
  // ("¿seguro que quieres salir?") y la ventana sigue viva. Quien las quita es
  // el listener de 'closed' de cada una, que solo salta si se cerró de verdad.
  //
  // forzar = destroy() en vez de close(): se usa cuando la app desaparece
  // (borrarla, limpiar su sesión) y ya no va a quedar nadie que siga la pista
  // de esa ventana. Un beforeunload la dejaría suelta e inalcanzable.
  _cerrarFlotantes(entry, { forzar = false } = {}) {
    if (!entry || !entry.popups) return
    for (const v of entry.popups) {
      try { if (!v.isDestroyed()) (forzar ? v.destroy() : v.close()) } catch (e) {}
    }
    if (forzar) entry.popups.clear()
  }

  // Una flotante es una ventana del sistema: mandar Yuki a la bandeja no se la
  // lleva consigo y se quedaba sola en el escritorio con la app "cerrada".
  // Solo se devuelven las que escondimos nosotros (marca __yukiOculta): si no,
  // una flotante que el usuario minimizó o cerró a su manera volvía a saltar a
  // la cara cada vez que Yuki vuelve de la bandeja.
  _verFlotantes(visibles) {
    for (const entry of this.views.values()) {
      if (!entry.popups) continue
      for (const v of entry.popups) {
        try {
          if (v.isDestroyed()) continue
          if (visibles) {
            if (!v.__yukiOculta) continue
            v.__yukiOculta = false
            // showInactive: volver de la bandeja no debe poner las flotantes
            // por delante de la ventana que el usuario acaba de pedir.
            v.showInactive()
          } else {
            // isVisible() es true para una ventana minimizada en Windows, y
            // una minimizada ya no estorba en el escritorio: se deja estar.
            if (v.isMinimized() || !v.isVisible()) continue
            v.__yukiOculta = true
            v.hide()
          }
        } catch (e) {}
      }
    }
  }

  // Tras desbloquear: lock-window devuelve las que escondió él, pero las que
  // había escondido la bandeja antes de bloquear se quedaban invisibles para
  // siempre, y de paso impedían que esa app volviera a dormirse nunca.
  sincronizarFlotantes() {
    const alaVista = this.win && !this.win.isDestroyed() &&
      this.win.isVisible() && !this.win.isMinimized()
    if (alaVista) this._verFlotantes(true)
  }

  _tieneFlotantes(entry) {
    if (!entry || !entry.popups) return false
    for (const v of entry.popups) {
      try { if (!v.isDestroyed()) return true } catch (e) {}
    }
    return false
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
    if (!entry) return
    // Antes del return por "dormida": una flotante que sobrevivió al close()
    // de un sueño manual (un beforeunload) seguiría pintando la sesión que
    // acabamos de borrar, y de paso impediría el sueño profundo para siempre.
    this._cerrarFlotantes(entry, { forzar: true })
    if (entry.sleeping) return
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

  setMemoryReporting(enabled) {
    this._reportMemory = !!enabled
    // Un informe inmediato: si no, el panel mostraría el del ciclo anterior
    // (hasta 30 s viejo, con vistas que quizá ya se destruyeron).
    if (this._reportMemory) this._sendMemoryReport()
  }

  async _sendMemoryReport() {
    if (!this._reportMemory || this.win.isDestroyed() || !this.win.isVisible()) return
    const report = []
    for (const [id, entry] of this.views) {
      if (entry.sleeping) continue
      try {
        const info = await entry.view.webContents.getProcessMemoryInfo()
        report.push({ id, privateMB: Math.round(info.private / 1024) })
      } catch(e) {}
    }
    if (!this.win.isDestroyed()) this.win.webContents.send('view:memory-report', report)
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

      // Sin panel abierto o con la ventana oculta no hay a quién informar:
      // se evita consultar la memoria de cada proceso y el IPC.
      await this._sendMemoryReport()
    }, intervalMs)
  }

  stopMemoryMonitor() {
    if (this._monitorInterval) {
      clearInterval(this._monitorInterval)
      this._monitorInterval = null
    }
  }

  async _checkAutoDeepSleep() {
    const now = Date.now()

    // Sueño profundo: una vista lleva horas dormida → destruirla libera su
    // proceso completo, no solo la página. Se recrea al volver a abrirla.
    for (const [id, entry] of this.views) {
      if (id === this._activeId || !entry.sleeping || !entry.sleepSince) continue
      if (now - entry.sleepSince < this._deepSleepMs) continue
      // Una app dormida puede conservar una flotante si su close() lo vetó un
      // beforeunload (un documento sin guardar). destroy() la mataría sin
      // preguntar: mejor dejar la app dormida y volver a intentarlo luego.
      if (this._tieneFlotantes(entry)) continue
      this.destroy(id)
      if (!this.win.isDestroyed()) this.win.webContents.send('view:destroyed', { id })
    }

    if (!this._autoSleepMs) return
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
      // Una navegación real descarta la CSS insertada: hay que permitir que se
      // vuelva a inyectar (dormir, despertar, recargar y limpiar sesión pasan por aquí).
      const e = this.views.get(id)
      if (e) e.cssWhatsApp = false
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

    // Destinos ya desenvueltos, en cola. Chromium carga la URL cruda, así que
    // un enlace de Gmail abriría el redirector (google.com/url?q=…) y su
    // pantalla de "vas a salir de Google" dentro de la ventana;
    // did-create-window la reconduce al destino real.
    //
    // Es una cola y no un hueco único porque una página puede autorizar dos
    // emergentes en la misma tanda: con un solo hueco, la primera cargaba el
    // destino de la segunda.
    const destinosPendientes = []

    wc.setWindowOpenHandler(({ url: openUrl, disposition }) => {
      if (!/^https?:/.test(openUrl)) return { action: 'deny' }

      const destino = destinoReal(openUrl)

      // <a download>: descargar, no abrir una ventana
      if (disposition === 'save-to-disk') {
        wc.downloadURL(destino)
        return { action: 'deny' }
      }
      // El login de Google tiene su propia ventana, que comparte la partición
      // de la app y sabe cerrarse al terminar. Mandarlo al navegador dejaría
      // la sesión en el navegador y no en Yuki.
      //
      // Solo vale cuando la app es de Google: el banner lleva a ServiceLogin de
      // Gmail, así que en una app ajena con "Iniciar sesión con Google" robaría
      // el OAuth y el usuario nunca podría terminarlo. Ahí va al navegador.
      let hostDestino = ''
      try { hostDestino = new URL(destino).hostname } catch (e) {}
      let hostApp = ''
      try { hostApp = new URL(wc.getURL()).hostname } catch (e) {}
      const appEsDeGoogle = /(^|\.)google\.com$/i.test(hostApp)
      if (hostDestino === 'accounts.google.com' && appEsDeGoogle) {
        if (!this.win.isDestroyed()) {
          this.win.webContents.send('view:needs-google-auth', { id, partition: `persist:${id}` })
        }
        return { action: 'deny' }
      }

      // Cualquier otro inicio de sesión al navegador: una ventana flotante no
      // es sitio para un login con 2FA, donde cada paso abre otra ventana y la
      // cadena se rompe. Y si la sesión acaba en el navegador, al menos el
      // usuario la ve.
      if (pareceLogin(destino)) {
        shell.openExternal(destino).catch(() => {})
        return { action: 'deny' }

      }

      // Todo lo demás, ventana flotante con la sesión de la app. Antes se
      // denegaba y se mandaba al navegador, donde no hay sesión: un adjunto de
      // Drive enlazado en un correo es drive.google.com visto desde
      // mail.google.com y terminaba pidiendo iniciar sesión otra vez.
      destinosPendientes.push({ destino: destino !== openUrl ? destino : null, cuando: Date.now() })
      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: {
          width: 1000,
          height: 800,
          autoHideMenuBar: true,
          backgroundColor: '#0f0c1c',
          // Se muestra a mano en did-create-window: con Yuki bloqueado o en la
          // bandeja no debe asomar, y sin esto parpadeaba antes de esconderse.
          show: false,
          webPreferences: {
            // Mismas que la vista que la abre: si no coinciden, la página se
            // comporta distinto dentro de la flotante que dentro de la app.
            contextIsolation: false,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: true,
            preload: path.join(__dirname, '../preload/webview-preload.js'),
          },
        },
      }
    })

    this._menuContextual(wc)

    // Una ventana emergente nace sin nada de lo que la vista tiene: sin esto no
    // tendría menú contextual, sus enlaces externos no abrirían nada (el
    // preload manda un IPC que nadie escucha) y seguiría viva aunque la app que
    // la abrió se duerma o se borre.
    wc.on('did-create-window', (ventana) => {
      const pwc = ventana.webContents

      // Se dispara en el mismo orden en que se autorizaron, así que el primero
      // de la cola es el de esta ventana. Se tiran los rancios: si una
      // autorizada no llegó a crearse, su destino se quedaría ahí y lo cargaría
      // la siguiente ventana, que no tiene nada que ver.
      const ahora = Date.now()
      while (destinosPendientes.length && ahora - destinosPendientes[0].cuando > 2000) {
        destinosPendientes.shift()
      }
      const pendiente = destinosPendientes.shift()
      if (pendiente && pendiente.destino) {
        // .catch además del try: loadURL devuelve una promesa y rechaza con
        // ERR_ABORTED cuando el destino resulta ser una descarga — justo el
        // caso del adjunto de Drive que motivó todo esto.
        try { pwc.loadURL(pendiente.destino).catch(() => {}) } catch (e) {}
      }

      this._menuContextual(pwc, { esFlotante: true })
      // Sin bindAppSwitchKeys a propósito: Ctrl+1..9 dentro de una flotante
      // cambiaría de app en la ventana principal, que ni siquiera se está
      // mirando. Aquí esa tecla la usa la página.

      // Sin barra de direcciones, lo único que identifica a la página es un
      // título que ella misma escribe. Se antepone el dominio real para que un
      // login que pareceLogin() no haya cazado no pueda hacerse pasar por otro.
      const ponerTitulo = (titulo) => {
        let host = ''
        try { host = new URL(pwc.getURL()).host } catch (e) {}
        try { ventana.setTitle(host ? `${host} — ${titulo || ''}`.trim() : (titulo || 'Yuki')) } catch (e) {}
      }
      pwc.on('page-title-updated', (e, titulo) => { e.preventDefault(); ponerTitulo(titulo) })
      pwc.on('did-navigate', () => ponerTitulo(pwc.getTitle()))

      // No solo http(s): el preload manda aquí todo lo que Chromium no puede
      // abrir en una ventana propia, que es justo mailto:, tel: y compañía.
      pwc.ipc.on('view:open-external', (_, url) => { abrirFuera(url) })

      // Los nietos van al navegador: una cadena de flotantes abriendo flotantes
      // no la puede seguir nadie.
      pwc.setWindowOpenHandler(({ url: u, disposition }) => {
        if (!/^https?:/.test(u)) return { action: 'deny' }
        if (disposition === 'save-to-disk') pwc.downloadURL(destinoReal(u))
        else shell.openExternal(destinoReal(u)).catch(() => {})
        return { action: 'deny' }
      })

      const entrada = this.views.get(id)
      if (entrada) {
        if (!entrada.popups) entrada.popups = new Set()
        entrada.popups.add(ventana)
        ventana.on('closed', () => entrada.popups.delete(ventana))
      }

      // Nace oculta (show:false). Solo se muestra si hay algo a lo que
      // acompañar: con Yuki bloqueado la taparía la capa, y con Yuki en la
      // bandeja quedaría suelta en el escritorio con la app "cerrada".
      // ready-to-show puede no llegar nunca: si la navegación acaba siendo una
      // descarga, si el renderer se cae antes de pintar o si la carga se
      // aborta. La ventana se quedaría invisible y viva, y _tieneFlotantes()
      // dejaría a esa app sin dormirse jamás. El plazo es la red de seguridad.
      let decidida = false
      const decidir = () => {
        if (decidida || ventana.isDestroyed()) return
        decidida = true
        if (lockWindow.bloqueado()) { lockWindow.taparNueva(ventana); return }
        const padreALaVista = this.win && !this.win.isDestroyed() &&
          this.win.isVisible() && !this.win.isMinimized()
        // bloqueado(), no estaHabilitado(): lo que importa es si hay una capa
        // delante ahora mismo. Mirando el interruptor, cualquiera que use PIN
        // no vería ninguna flotante nunca.
        if (padreALaVista) ventana.show()
        // Marcarla como escondida por nosotros: si no, al volver de la bandeja
        // _verFlotantes la saltaría y se quedaría invisible para siempre.
        else ventana.__yukiOculta = true
      }
      ventana.once('ready-to-show', decidir)
      const plazo = setTimeout(() => {
        if (decidida || ventana.isDestroyed()) return
        let cargada = ''
        try { cargada = pwc.getURL() } catch (e) {}
        // Nada cargado tras 15 s: la navegación acabó siendo una descarga o se
        // abortó, y no va a pintar nunca. Enseñarla dejaría una ventana en
        // blanco delante del usuario; se cierra. Si llegó a cargar algo, solo
        // va lenta: se muestra.
        if (!cargada || cargada === 'about:blank') { try { ventana.close() } catch (e) {} ; return }
        decidir()
      }, 15000)
      ventana.once('closed', () => clearTimeout(plazo))
    })

    // Mensajes desde webview-preload.js
    wc.ipc.on('view:notification', (_, data) => {
      if (!this.win.isDestroyed()) this.win.webContents.send('view:notification', { id, ...data })
    })

    // Lo que llega aquí es lo que Chromium no puede abrir en una ventana
    // propia: mailto:, tel:, un enlace de Teams. Los http(s) no pasan por aquí,
    // los decide setWindowOpenHandler.
    wc.ipc.on('view:open-external', (_, url) => { abrirFuera(url) })
  }

  // El menú nativo se sustituye por uno propio, así que todo lo que falte aquí
  // simplemente no existe para el usuario. Lo usan las vistas y sus emergentes.
  // Guarda la imagen del menú contextual. Hay dos caminos porque no existe uno
  // que sirva para ambos casos:
  //   http(s)      -> downloadURL, que descarga con las cookies de la sesión.
  //                   Leerla desde la página fallaría por CORS en todo lo que
  //                   viene de otro dominio (googleusercontent, pps.whatsapp.net).
  //   blob:/data:  -> solo existen dentro del documento que los creó, así que
  //                   el proceso principal no puede descargarlos: se leen en la
  //                   página y se escriben aquí. Es el caso de WhatsApp Web.
  async _guardarImagen(wc, srcURL, marco) {
    try {
      if (/^https?:/.test(srcURL)) { wc.downloadURL(srcURL); return }

      let dataURL = srcURL
      if (!/^data:/.test(srcURL)) {
        // Un blob: de un adjunto de Gmail vive en su iframe, no en el marco
        // principal: hay que pedírselo al marco donde se hizo clic derecho.
        const donde = marco || wc
        dataURL = await donde.executeJavaScript(`(async () => {
          const r = await fetch(${JSON.stringify(srcURL)})
          const b = await r.blob()
          return await new Promise(res => {
            const fr = new FileReader()
            fr.onload = () => res(fr.result)
            fr.readAsDataURL(b)
          })
        })()`)
      }
      if (typeof dataURL !== 'string' || !dataURL.startsWith('data:')) return

      const cabecera = dataURL.slice(0, dataURL.indexOf(','))
      const cuerpo = dataURL.slice(dataURL.indexOf(',') + 1)
      const tipo = (/^data:([^;,]+)/.exec(dataURL) || [])[1] || 'image/png'
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                    'image/webp': 'webp', 'image/svg+xml': 'svg' }[tipo] || 'png'

      // Un data: sin ';base64' lleva el contenido como texto con escapes de URL
      const datos = cabecera.includes(';base64')
        ? Buffer.from(cuerpo, 'base64')
        : Buffer.from(decodeURIComponent(cuerpo), 'utf8')

      // El diálogo cuelga de la ventana donde se hizo clic: si lo colgáramos
      // siempre de la principal, quedaría detrás de una emergente o invisible
      // con Yuki minimizado en la bandeja.
      const duena = BrowserWindow.fromWebContents(wc) || this.win
      const { canceled, filePath } = await dialog.showSaveDialog(duena, {
        defaultPath: `imagen-${Date.now()}.${ext}`,
        filters: [{ name: 'Imagen', extensions: [ext] }],
      })
      if (canceled || !filePath) return
      fs.writeFileSync(filePath, datos)
    } catch (e) {
      // Antes un fallo aquí no decía nada y parecía que la imagen se guardó
      const duena = BrowserWindow.fromWebContents(wc) || this.win
      try {
        dialog.showMessageBox(duena, {
          type: 'warning', title: 'Yuki', noLink: true,
          message: 'No se pudo guardar la imagen',
          detail: String((e && e.message) || e),
        })
      } catch (e2) {}
    }
  }

  // esFlotante añade la salida de emergencia: la clasificación de pareceLogin()
  // es una heurística y alguna vez dejará un login dentro de una flotante donde
  // no pueda terminar. Con esto el usuario se lo lleva al navegador en vez de
  // quedarse atascado.
  _menuContextual(wc, { esFlotante = false } = {}) {
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
      // Imágenes: al sustituir el menú nativo se perdían guardar y copiar, así
      // que el clic derecho sobre una foto de WhatsApp no ofrecía nada.
      if (params.mediaType === 'image' && params.srcURL) {
        items.push(
          { label: 'Guardar imagen como…', click: () => this._guardarImagen(wc, params.srcURL, params.frame) },
          { label: 'Copiar imagen',        click: () => wc.copyImageAt(params.x, params.y) },
        )
        // Una dirección blob: o data: no sirve fuera de la página que la creó
        if (/^https?:/.test(params.srcURL)) {
          items.push(
            { label: 'Copiar dirección de la imagen', click: () => clipboard.writeText(params.srcURL) },
            { label: 'Abrir imagen en el navegador',  click: () => { shell.openExternal(params.srcURL).catch(() => {}) } },
          )
        }
        items.push({ type: 'separator' })
      }

      // Enlaces: el destino real, deshaciendo el redirector de Google
      if (params.linkURL && /^https?:/.test(params.linkURL)) {
        const destino = destinoReal(params.linkURL)
        items.push(
          { label: 'Abrir enlace en el navegador', click: () => { shell.openExternal(destino).catch(() => {}) } },
          { label: 'Copiar dirección del enlace',  click: () => clipboard.writeText(destino) },
          { type: 'separator' },
        )
      }

      if (isEditable) {
        if (editFlags.canCut && selectionText)  items.push({ role: 'cut',       label: 'Cortar' })
        if (editFlags.canCopy && selectionText) items.push({ role: 'copy',      label: 'Copiar' })
        if (editFlags.canPaste)                 items.push({ role: 'paste',     label: 'Pegar' })
        if (editFlags.canSelectAll)             items.push({ type: 'separator' }, { role: 'selectAll', label: 'Seleccionar todo' })
      } else if (selectionText && selectionText.trim()) {
        items.push({ role: 'copy', label: 'Copiar' })
      }

      if (esFlotante) {
        if (items.length) items.push({ type: 'separator' })
        items.push({
          label: 'Abrir esta página en el navegador',
          click: () => {
            const aqui = wc.getURL()
            if (abrirFuera(aqui)) {
              const v = BrowserWindow.fromWebContents(wc)
              if (v && !v.isDestroyed()) v.close()
            }
          },
        })
      }

      // Siempre algo que ofrecer: antes, el clic derecho sobre una zona sin
      // texto ni campo editable no abría ningún menú.
      if (!items.length) {
        items.push({ label: 'Recargar', click: () => wc.reload() })
      }

      // Un separador final suelto queda feo
      while (items.length && items[items.length - 1].type === 'separator') items.pop()
      if (items.length) Menu.buildFromTemplate(items).popup()
    })
  }

  _injectCSS(view, id) {
    const url = view.webContents.getURL()
    // did-stop-loading se dispara en cada navegación; sin este guard cada
    // recarga añadía otra hoja de estilo que nunca se quitaba.
    const entry = this.views.get(id)
    if (url.includes('web.whatsapp.com') && entry && !entry.cssWhatsApp) {
      entry.cssWhatsApp = true
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
