window.addEventListener('error', (e) => {
  console.error('[Yuki] Error:', e.message, 'at', e.filename, e.lineno)
})

// ── Estado ───────────────────────────────────────────────────────────────────
const STORAGE_KEY  = 'yuki-apps'
const SETTINGS_KEY = 'yuki-settings'
let activeId = null
let pickerTargetId = null
const createdViews = new Set()  // IDs de vistas ya creadas en el proceso principal
const badgeCounts  = {}

// ── Persistencia ─────────────────────────────────────────────────────────────
function loadApps() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}
function saveApps(apps) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps))
}
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {} } catch { return {} }
}
function saveSettings(obj) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...obj }))
}
function getVolume()     { const s = loadSettings(); return s.volume !== undefined ? s.volume : 0.5 }
function isDND()         { return loadSettings().dnd === true }
function getNotifSound() { return loadSettings().notifSound || 'default' }
function getCustomSoundData() {
  try { return localStorage.getItem('yuki-custom-sound') || null } catch { return null }
}

// ── Lock screen ───────────────────────────────────────────────────────────────
function getLock() {
  try { return JSON.parse(localStorage.getItem('yuki-lock') || '{}') } catch { return {} }
}
function saveLock(s) { localStorage.setItem('yuki-lock', JSON.stringify(s)) }

function showLock() {
  const overlay = document.getElementById('lock-overlay')
  overlay.classList.add('visible')
  const inp = document.getElementById('lock-pin-input')
  inp.value = ''
  setTimeout(() => inp.focus(), 80)
}
function hideLock() {
  document.getElementById('lock-overlay').classList.remove('visible')
}

async function tryUnlock(pin) {
  const res = await window.yukiAPI.verifyPin(pin)
  if (res.match) {
    hideLock()
  } else {
    const inp = document.getElementById('lock-pin-input')
    const err = document.getElementById('lock-error')
    inp.classList.remove('lock-shake')
    void inp.offsetWidth
    inp.classList.add('lock-shake')
    err.classList.add('show')
    inp.value = ''
    setTimeout(() => { inp.classList.remove('lock-shake'); err.classList.remove('show') }, 1600)
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 2000) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), duration)
}

// ── Render icon ───────────────────────────────────────────────────────────────
function renderIconHTML(icon) {
  if (icon && icon.startsWith('data:image')) return `<img src="${icon}" alt="" aria-hidden="true" />`
  if (icon && icon.startsWith('lucide:')) return `<i data-lucide="${icon.split(':')[1]}" class="icon-lucide"></i>`;
  return icon || '<i data-lucide="globe" class="icon-lucide"></i>'
}

// ── Loading overlay ───────────────────────────────────────────────────────────
function showLoading(name) {
  document.getElementById('loading-label').textContent = `Cargando ${name}...`
  document.getElementById('loading-overlay').classList.add('visible')
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('visible')
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function updateBadge(appId, count) {
  const badge = document.getElementById(`badge-${appId}`)
  if (!badge) return
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count
    badge.style.display = 'block'
  } else {
    badge.style.display = 'none'
  }
}
function clearBadge(appId) { updateBadge(appId, 0) }

// ── Sleep mode ────────────────────────────────────────────────────────────────
function sleepInactive() {
  const apps = loadApps()
  apps.forEach(app => {
    if (app.sleep && app.id !== activeId && createdViews.has(app.id)) {
      window.yukiAPI.sleepView(app.id).catch(() => {})
    }
  })
}

// ── Navegación ────────────────────────────────────────────────────────────────
function switchTo(id) {
  const mainContainer = document.getElementById('main-container');
  mainContainer.style.opacity = '0';
  mainContainer.style.transform = 'scale(0.98)';
  setTimeout(() => {
    mainContainer.style.transition = 'var(--transition)';
    mainContainer.style.opacity = '1';
    mainContainer.style.transform = 'scale(1)';
  }, 50);
  const apps  = loadApps()
  const app   = apps.find(a => a.id === id)
  if (!app) return

  // Crear vista la primera vez que se abre
  if (!createdViews.has(id)) {
    window.yukiAPI.openView(id, app.url, `persist:${id}`).catch(e => console.error('[Yuki] openView:', e))
    createdViews.add(id)
  } else {
    // La vista ya existe — activarla (despierta si dormía)
    window.yukiAPI.openView(id, app.url, `persist:${id}`).catch(() => {})
  }

  if (activeId === id) {
    clearBadge(id)
    return
  }

  activeId = id

  // Actualizar sidebar
  document.querySelectorAll('.app-btn').forEach(btn => btn.classList.remove('active'))
  const btn = document.querySelector(`[data-id="${id}"]`)
  if (btn) btn.classList.add('active')

  hideGoogleAuthBanner()
  clearBadge(id)
  badgeCounts[id] = 0

  // Mostrar loading si la vista está cargando
  showLoading(app.name)

  // Dormir inactivas con sleep activado
  setTimeout(sleepInactive, 5000)
}

// ── Render sidebar ────────────────────────────────────────────────────────────
function render() {
  const apps    = loadApps()
  const sidebar = document.getElementById('apps-list')
  sidebar.innerHTML = ''

  // Destruir vistas de apps eliminadas
  const currentIds = new Set(apps.map(a => a.id))
  for (const id of [...createdViews]) {
    if (!currentIds.has(id)) {
      window.yukiAPI.destroyView(id).catch(() => {})
      createdViews.delete(id)
    }
  }

  apps.forEach(app => {
    const item = document.createElement('div')
    item.className = 'app-item'
    item.innerHTML = `
      <button class="app-btn ${activeId === app.id ? 'active' : ''}"
              data-id="${app.id}" title="${app.name}" aria-label="${app.name}">
        ${renderIconHTML(app.icon)}
      </button>
      <span class="badge" id="badge-${app.id}"></span>
      <div class="app-label">${app.name}</div>
    `
    item.querySelector('.app-btn').addEventListener('click', () => switchTo(app.id))

    // Drag & drop
    item.setAttribute('draggable', 'true')
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', app.id)
      e.dataTransfer.effectAllowed = 'move'
      setTimeout(() => item.classList.add('dragging'), 0)
    })
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging')
      sidebar.querySelectorAll('.app-item').forEach(el => el.classList.remove('drag-over'))
    })
    item.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      sidebar.querySelectorAll('.app-item').forEach(el => el.classList.remove('drag-over'))
      item.classList.add('drag-over')
    })
    item.addEventListener('dragleave', (e) => {
      if (!item.contains(e.relatedTarget)) item.classList.remove('drag-over')
    })
    item.addEventListener('drop', (e) => {
      e.preventDefault()
      item.classList.remove('drag-over')
      const draggedId = e.dataTransfer.getData('text/plain')
      if (!draggedId || draggedId === app.id) return
      const allApps = loadApps()
      const from = allApps.findIndex(a => a.id === draggedId)
      const to   = allApps.findIndex(a => a.id === app.id)
      if (from === -1 || to === -1) return
      const [moved] = allApps.splice(from, 1)
      allApps.splice(to, 0, moved)
      saveApps(allApps)
      render()
    })

    sidebar.appendChild(item)
  })

  if (apps.length > 0 && (!activeId || !currentIds.has(activeId))) {
    switchTo(apps[0].id)
  }

  renderServicesList(apps)
}

// ── Settings list ─────────────────────────────────────────────────────────────
function renderServicesList(apps) {
  const list = document.getElementById('services-list')
  if (apps.length === 0) {
    list.innerHTML = '<div class="empty-msg">No hay apps configuradas aun</div>'
    return
  }
  list.innerHTML = ''
  apps.forEach((app, i) => {
    const card = document.createElement('div')
    card.className = 'service-card'
    card.innerHTML = `
      <div class="svc-top-row">
        <div class="svc-icon-wrap" title="Click para cambiar imagen" role="button" tabindex="0" aria-label="Cambiar imagen">
          ${renderIconHTML(app.icon)}
        </div>
        <div class="service-info">
          <div class="svc-name-wrap">
            <span class="svc-name" title="Click para renombrar">${app.name}</span>
            <input class="svc-name-input" type="text" value="${app.name}" style="display:none" />
          </div>
          <div class="svc-url">${app.url}</div>
        </div>
      </div>
      <div class="service-actions">
        <div class="sleep-toggle-wrap" title="Sleep: hiberna esta app cuando no está activa para ahorrar RAM">
          <span class="sleep-label"><i data-lucide="moon" class="icon-lucide"></i> Sleep</span>
          <label class="toggle">
            <input type="checkbox" class="sleep-checkbox" aria-label="Habilitar hibernación para ${app.name}" ${app.sleep ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <button class="icon-btn move-up" title="Subir" aria-label="Subir app" ${i === 0 ? 'disabled' : ''}><i data-lucide="chevron-up" class="icon-lucide"></i></button>
        <button class="icon-btn move-down" title="Bajar" aria-label="Bajar app" ${i === apps.length - 1 ? 'disabled' : ''}><i data-lucide="chevron-down" class="icon-lucide"></i></button>
        <button class="icon-btn reload-btn" title="Recargar" aria-label="Recargar app"><i data-lucide="refresh-cw" class="icon-lucide"></i></button>
        <button class="icon-btn clear-session-btn" title="Limpiar caché y sesión (reinicia el login)" aria-label="Limpiar caché y sesión"><i data-lucide="eraser" class="icon-lucide"></i></button>
        ${app.url.includes('google.com') ? `<button class="icon-btn google-login-btn" title="Iniciar sesion Google" aria-label="Iniciar sesión en Google"><i data-lucide="key" class="icon-lucide"></i></button>` : ''}
        <button class="icon-btn danger" title="Eliminar" aria-label="Eliminar app"><i data-lucide="trash-2" class="icon-lucide"></i></button>
      </div>
    `

    // Cambiar icono
    const iconWrap = card.querySelector('.svc-icon-wrap')
    iconWrap.addEventListener('click', () => openIconPicker(app.id))
    iconWrap.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openIconPicker(app.id)
      }
    })

    // Renombrar inline
    const nameSpan  = card.querySelector('.svc-name')
    const nameInput = card.querySelector('.svc-name-input')
    nameSpan.setAttribute('role', 'button')
    nameSpan.setAttribute('tabindex', '0')
    const triggerRename = (e) => {
      e.stopPropagation()
      nameSpan.style.display = 'none'
      nameInput.style.display = 'block'
      setTimeout(() => { nameInput.focus(); nameInput.select() }, 0)
    }
    nameSpan.addEventListener('click', triggerRename)
    nameSpan.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        triggerRename(e)
      }
    })
    let renaming = false
    const commitRename = () => {
      if (renaming) return
      renaming = true
      const newName = nameInput.value.trim()
      if (newName && newName !== app.name) {
        const allApps = loadApps()
        const target  = allApps.find(a => a.id === app.id)
        if (target) {
          target.name = newName
          saveApps(allApps)
          render()
          showToast(`Renombrado a "${newName}"`)
          return
        }
      }
      renaming = false
      nameSpan.style.display = ''
      nameInput.style.display = 'none'
    }
    nameInput.addEventListener('blur', commitRename)
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
      if (e.key === 'Escape') { renaming = true; nameInput.value = app.name; nameSpan.style.display = ''; nameInput.style.display = 'none'; nameInput.blur() }
    })

    // Mover arriba / abajo
    card.querySelector('.move-up').addEventListener('click', () => {
      const allApps = loadApps(); const idx = allApps.findIndex(a => a.id === app.id)
      if (idx > 0) { [allApps[idx - 1], allApps[idx]] = [allApps[idx], allApps[idx - 1]]; saveApps(allApps); render() }
    })
    card.querySelector('.move-down').addEventListener('click', () => {
      const allApps = loadApps(); const idx = allApps.findIndex(a => a.id === app.id)
      if (idx < allApps.length - 1) { [allApps[idx], allApps[idx + 1]] = [allApps[idx + 1], allApps[idx]]; saveApps(allApps); render() }
    })

    // Sleep toggle
    card.querySelector('.sleep-checkbox').addEventListener('change', (e) => {
      const allApps = loadApps()
      const target  = allApps.find(a => a.id === app.id)
      if (target) {
        target.sleep = e.target.checked
        saveApps(allApps)
        if (!target.sleep) {
          // Si se desactiva sleep, dejar que la vista se despierte sola al visitarla
        }
        showToast(target.sleep ? `<i data-lucide="moon" class="icon-lucide"></i> Sleep activado en ${app.name}` : `▶ Sleep desactivado en ${app.name}`)
      }
    })

    // Login Google
    const googleBtn = card.querySelector('.google-login-btn')
    if (googleBtn) {
      googleBtn.addEventListener('click', () => {
        window.yukiAPI.openGoogleAuth(`persist:${app.id}`, false)
      })
    }

    // Reload
    card.querySelector('.reload-btn').addEventListener('click', () => {
      showLoading(app.name)
      window.yukiAPI.reloadView(app.id).catch(() => {})
      switchTo(app.id)
    })

    // Limpiar sesión
    card.querySelector('.clear-session-btn').addEventListener('click', () => {
      if (!confirm(`¿Borrar caché y sesión de ${app.name}?\nDeberás iniciar sesión de nuevo.`)) return
      window.yukiAPI.clearSession(`persist:${app.id}`)
        .then(() => showToast(`Limpiando sesión de ${app.name}...`, 2000))
        .catch(() => {})
    })

    // Eliminar
    card.querySelector('.icon-btn.danger').addEventListener('click', () => removeApp(app.id))

    list.appendChild(card)
  })
}

// ── Agregar apps ──────────────────────────────────────────────────────────────
function generateId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const apps = loadApps()
  let id = base, n = 2
  while (apps.find(a => a.id === id)) id = `${base}-${n++}`
  return id
}

function addFromCatalog(name, icon, url) {
  const apps  = loadApps()
  const same  = apps.filter(a => a.url === url)
  const label = same.length === 0 ? name : `${name} ${same.length + 1}`
  const id    = generateId(label)
  apps.push({ id, name: label, icon, url })
  saveApps(apps)
  render()
  switchTo(id)
  showToast(`${label} agregado`)
}

function addCustomApp() {
  const name = document.getElementById('custom-name').value.trim()
  const url  = document.getElementById('custom-url').value.trim()
  const icon = document.getElementById('custom-icon').value.trim() || '🌐'
  if (!name || !url) return
  const apps = loadApps()
  const id   = generateId(name)
  apps.push({ id, name, icon, url })
  saveApps(apps)
  document.getElementById('custom-name').value = ''
  document.getElementById('custom-url').value  = ''
  document.getElementById('custom-icon').value = ''
  render()
  switchTo(id)
  showToast(`${name} agregado`)
}

function removeApp(id) {
  let apps = loadApps()
  const app = apps.find(a => a.id === id)
  apps = apps.filter(a => a.id !== id)
  saveApps(apps)
  if (activeId === id) activeId = null
  render()
  if (app) showToast(`${app.name} eliminado`)
}

// ── Icon picker ───────────────────────────────────────────────────────────────
function openIconPicker(appId) {
  pickerTargetId = appId
  const fi = document.getElementById('file-input')
  fi.value = ''
  fi.click()
}

function resizeImage(dataUrl, size, callback) {
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const min = Math.min(img.width, img.height)
    const sx  = (img.width  - min) / 2
    const sy  = (img.height - min) / 2
    ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
    callback(canvas.toDataURL('image/png'))
  }
  img.onerror = () => showToast('Error al cargar imagen')
  img.src = dataUrl
}

// ── Settings panel ────────────────────────────────────────────────────────────
// Las WebContentsViews son ventanas nativas — se superponen sobre el DOM.
// Al abrir settings, empujamos las vistas hacia la derecha del panel (64+340=404).
const SETTINGS_WIDTH = 340

function toggleSettings() {
  const isOpen = document.getElementById('settings-overlay').classList.contains('open')
  document.getElementById('settings-overlay').classList.toggle('open')
  document.getElementById('settings-toggle').classList.toggle('open', !isOpen)
  if (!isOpen) {
    renderServicesList(loadApps())
    window.yukiAPI.resizeViews(64 + SETTINGS_WIDTH)
  } else {
    window.yukiAPI.resizeViews(64)
  }
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('open')
  document.getElementById('settings-toggle').classList.remove('open')
  window.yukiAPI.resizeViews(64)
}

// ── Sonido de notificación ────────────────────────────────────────────────────
let audioCtx = null

const BUILT_IN_SOUNDS = {
  default: [
    { freq: 880,  start: 0,    dur: 0.15, type: 'sine' },
    { freq: 1100, start: 0.18, dur: 0.12, type: 'sine' },
  ],
  suave:   [{ freq: 660,  start: 0,    dur: 0.25, type: 'sine' }],
  campana: [
    { freq: 1318, start: 0,    dur: 0.08, type: 'triangle' },
    { freq: 1318, start: 0.10, dur: 0.40, type: 'sine' },
  ],
  alerta: [
    { freq: 1000, start: 0,    dur: 0.10, type: 'square' },
    { freq: 1000, start: 0.15, dur: 0.10, type: 'square' },
    { freq: 1200, start: 0.30, dur: 0.15, type: 'square' },
  ],
}

function playNotificationSound() {
  if (isDND()) return
  const vol = getVolume()
  if (vol === 0) return
  const sound = getNotifSound()

  if (sound === 'custom') {
    const data = getCustomSoundData()
    if (data) { const a = new Audio(data); a.volume = vol; a.play().catch(() => {}); return }
  }

  if (!audioCtx) audioCtx = new AudioContext()
  const tones = BUILT_IN_SOUNDS[sound] || BUILT_IN_SOUNDS.default

  tones.forEach(({ freq, start, dur, type }) => {
    const osc  = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.type = type || 'sine'
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start)
    gain.gain.setValueAtTime(0, audioCtx.currentTime + start)
    gain.gain.linearRampToValueAtTime(vol * 0.35, audioCtx.currentTime + start + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur)
    osc.start(audioCtx.currentTime + start)
    osc.stop(audioCtx.currentTime  + start + dur)
  })
}

// ── Memoria RAM ───────────────────────────────────────────────────────────────
function updateMemoryUI(report) {
  const list = document.getElementById('memory-list')
  if (!list) return
  if (!report || !report.length) {
    list.innerHTML = '<div style="font-size:11px;color:#667781">Sin apps activas</div>'
    return
  }
  const apps = loadApps()
  list.innerHTML = report.map(({ id, privateMB }) => {
    const app  = apps.find(a => a.id === id)
    const name = app ? app.name : id
    const icon = app ? renderIconHTML(app.icon) : '🌐'
    return `<div class="memory-item">
      <span style="font-size:14px">${icon}</span>
      <span class="memory-app-name">${name}</span>
      <span class="memory-mb">${privateMB} MB</span>
      <button class="icon-btn" onclick="window.yukiAPI.sleepView('${id}')" title="Liberar memoria"><i data-lucide="moon" class="icon-lucide"></i></button>
    </div>`
  }).join('')
}

// ── Google Auth Banner ────────────────────────────────────────────────────────
let googleAuthPartition = null

function showGoogleAuthBanner(appId, partition) {
  googleAuthPartition = partition
  document.getElementById('google-auth-banner').style.display = 'block'
}
function hideGoogleAuthBanner() {
  document.getElementById('google-auth-banner').style.display = 'none'
  googleAuthPartition = null
}

// ── Event listeners de settings ───────────────────────────────────────────────
;(function initSettings() {
  try {
    document.getElementById('settings-toggle').addEventListener('click', toggleSettings)
    document.getElementById('settings-close-btn').addEventListener('click', closeSettings)

    const volSlider  = document.getElementById('vol-slider')
    const volValue   = document.getElementById('vol-value')
    const dndToggle  = document.getElementById('dnd-toggle')

    const savedVol = Math.round(getVolume() * 100)
    if (volSlider) volSlider.value = savedVol
    if (volValue)  volValue.textContent = savedVol + '%'
    if (dndToggle) dndToggle.checked = isDND()

    const soundSelect   = document.getElementById('sound-select')
    const soundFileRow  = document.getElementById('sound-file-row')
    const soundFileName = document.getElementById('sound-file-name')
    const savedSound = getNotifSound()
    if (soundSelect) {
      soundSelect.value = savedSound
      if (savedSound === 'custom' && soundFileRow) {
        soundFileRow.style.display = 'flex'
        const d = getCustomSoundData()
        if (soundFileName) soundFileName.textContent = d ? 'Archivo cargado' : 'Sin archivo'
      }
    }

    if (volSlider) volSlider.addEventListener('input', () => {
      const pct = parseInt(volSlider.value)
      if (volValue) volValue.textContent = pct + '%'
      saveSettings({ volume: pct / 100 })
      playNotificationSound()
    })
    if (dndToggle) dndToggle.addEventListener('change', () => {
      saveSettings({ dnd: dndToggle.checked })
      showToast(dndToggle.checked ? 'No molestar No molestar activado' : 'Notificaciones Notificaciones activadas')
    })
    if (soundSelect) soundSelect.addEventListener('change', () => {
      const val = soundSelect.value
      saveSettings({ notifSound: val })
      if (soundFileRow) soundFileRow.style.display = val === 'custom' ? 'flex' : 'none'
      if (val !== 'custom') playNotificationSound()
    })

    const btnSoundFile = document.getElementById('btn-sound-file')
    const audioInput   = document.getElementById('audio-file-input')
    if (btnSoundFile && audioInput) {
      btnSoundFile.addEventListener('click', () => audioInput.click())
      audioInput.addEventListener('change', function () {
        const file = this.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = e => {
          try {
            localStorage.setItem('yuki-custom-sound', e.target.result)
            saveSettings({ notifSound: 'custom' })
            if (soundSelect) soundSelect.value = 'custom'
            if (soundFileRow) soundFileRow.style.display = 'flex'
            if (soundFileName) soundFileName.textContent = file.name
            showToast('Sonido personalizado guardado')
            playNotificationSound()
          } catch {
            showToast('Archivo demasiado grande — usa uno más corto')
          }
        }
        reader.onerror = () => showToast('Error leyendo archivo de audio')
        reader.readAsDataURL(file)
        this.value = ''
      })
    }

    // Auto-sleep
    const autoSleepSelect = document.getElementById('auto-sleep-select')
    if (autoSleepSelect) {
      const savedAutoSleep = loadSettings().autoSleepMinutes ?? 30
      autoSleepSelect.value = String(savedAutoSleep)
      autoSleepSelect.addEventListener('change', () => {
        const val = parseInt(autoSleepSelect.value)
        saveSettings({ autoSleepMinutes: val })
        window.yukiAPI.setAutoSleep(val)
      })
    }

    // Seguridad — lock screen
    const lockToggle  = document.getElementById('lock-enabled-toggle')
    const pinSetupInp = document.getElementById('pin-setup-input')
    const pinSaveBtn  = document.getElementById('pin-save-btn')
    const pinStatus   = document.getElementById('pin-status')

    const lockCfg = getLock()
    if (lockToggle) lockToggle.checked = !!lockCfg.enabled

    window.yukiAPI.hasPin().then(has => {
      if (pinStatus) pinStatus.textContent = has ? 'PIN configurado configurado' : 'Sin PIN configurado'
    })

    if (lockToggle) lockToggle.addEventListener('change', () => {
      saveLock({ ...getLock(), enabled: lockToggle.checked })
    })
    if (pinSaveBtn) pinSaveBtn.addEventListener('click', async () => {
      const val = pinSetupInp.value.trim()
      if (val.length < 4) { showToast('El PIN debe tener mínimo 4 caracteres'); return }
      const res = await window.yukiAPI.savePin(val)
      if (res.ok) {
        pinSetupInp.value = ''
        if (pinStatus) pinStatus.textContent = 'PIN configurado configurado'
        showToast('PIN guardado')
      }
    })

    const lockPinInput = document.getElementById('lock-pin-input')
    if (lockPinInput) {
      lockPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryUnlock(lockPinInput.value)
      })
    }

    document.getElementById('settings-backdrop').addEventListener('click', closeSettings)
    document.getElementById('btn-add-custom').addEventListener('click', addCustomApp)

    document.querySelectorAll('.catalog-grid').forEach(grid => {
      grid.addEventListener('click', e => {
        const item = e.target.closest('.catalog-item')
        if (!item) return
        addFromCatalog(item.dataset.name, item.dataset.icon, item.dataset.url)
      })
      grid.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          const item = e.target.closest('.catalog-item')
          if (!item) return
          e.preventDefault()
          addFromCatalog(item.dataset.name, item.dataset.icon, item.dataset.url)
        }
      })
    })

    const fileInput = document.getElementById('file-input')
    if (fileInput) fileInput.addEventListener('change', function () {
      const file = this.files[0]
      if (!file || !pickerTargetId) return
      const reader = new FileReader()
      reader.onload = e => {
        resizeImage(e.target.result, 128, resized => {
          const apps = loadApps()
          const app  = apps.find(a => a.id === pickerTargetId)
          if (app) { app.icon = resized; saveApps(apps); render(); showToast('Icono actualizado') }
          pickerTargetId = null
        })
      }
      reader.onerror = () => showToast('Error leyendo archivo')
      reader.readAsDataURL(file)
    })

    // Backup / Restore
    document.getElementById('btn-export-config').addEventListener('click', async () => {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        apps: loadApps(),
        settings: loadSettings(),
        customSound: getCustomSoundData(),
      }
      const res = await window.yukiAPI.exportConfig(data)
      if (res.ok)           showToast('Backup guardado correctamente', 3000)
      else if (!res.canceled) showToast('Error al guardar: ' + res.error, 4000)
    })
    document.getElementById('btn-import-config').addEventListener('click', async () => {
      const res = await window.yukiAPI.importConfig()
      if (!res.ok) { if (!res.canceled) showToast('Error al leer el archivo: ' + res.error, 4000); return }
      const { data } = res
      if (!data || data.version !== 1) { showToast('Archivo de backup no válido', 3000); return }
      try {
        if (data.apps)       localStorage.setItem(STORAGE_KEY,  JSON.stringify(data.apps))
        if (data.settings)   localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings))
        if (data.customSound) localStorage.setItem('yuki-custom-sound', data.customSound)
        showToast('Configuración restaurada', 2500)
        render()
      } catch(e) { showToast('Error al restaurar: ' + e.message, 4000) }
    })
    document.getElementById('btn-open-userdata').addEventListener('click', () => {
      window.yukiAPI.openUserdata()
    })

    // Google auth banner
    document.getElementById('google-auth-btn').addEventListener('click', () => {
      if (googleAuthPartition) window.yukiAPI.openGoogleAuth(googleAuthPartition, false)
    })

  } catch(e) { console.error('[Yuki] initSettings error:', e) }
})()

// ── Eventos desde el proceso principal ───────────────────────────────────────
window.yukiAPI.on('view:loading-start', ({ id }) => {
  if (id === activeId) {
    const app = loadApps().find(a => a.id === id)
    showLoading(app ? app.name : '')
  }
})

window.yukiAPI.on('view:loading-stop', ({ id }) => {
  if (id === activeId) hideLoading()
})

window.yukiAPI.on('view:title-updated', ({ id, title }) => {
  const match = title.match(/\((\d+)\)/)
  const count = match ? parseInt(match[1]) : 0
  const prev  = badgeCounts[id] || 0
  if (count > prev && id !== activeId) playNotificationSound()
  badgeCounts[id] = count
  updateBadge(id, count)
})

window.yukiAPI.on('view:navigate', ({ id, url }) => {
  if (id === activeId && url.includes('mail.google.com')) hideGoogleAuthBanner()
})

window.yukiAPI.on('view:needs-google-auth', ({ id, partition }) => {
  if (id === activeId) showGoogleAuthBanner(id, partition)
})

window.yukiAPI.on('view:notification', ({ id }) => {
  if (id !== activeId) playNotificationSound()
})

window.yukiAPI.on('view:memory-report', (report) => {
  updateMemoryUI(report)
})

window.yukiAPI.on('session:cleared', ({ id }) => {
  const allApps = loadApps()
  const app     = allApps.find(a => a.id === id)
  if (app) {
    window.yukiAPI.openView(id, app.url, `persist:${id}`).catch(() => {})
    switchTo(id)
  }
  showToast(`Sesión de ${app ? app.name : id} limpiada`, 2500)
})

window.yukiAPI.on('google-auth-done', (partition) => {
  hideGoogleAuthBanner()
  const apps = loadApps()
  const app  = apps.find(a => `persist:${a.id}` === partition)
  if (!app) return
  window.yukiAPI.openView(app.id, 'https://mail.google.com/mail/u/0/', `persist:${app.id}`).catch(() => {})
  switchTo(app.id)
  showToast('Sesion iniciada — cargando Gmail...', 3000)
})

window.yukiAPI.on('yuki-window-show', () => {
  const { enabled } = getLock()
  if (enabled) showLock()
})

window.yukiAPI.on('switch-app-index', (index) => {
  const apps = loadApps()
  if (apps[index]) switchTo(apps[index].id)
})

window.yukiAPI.on('open-webview-devtools', () => {
  if (activeId) window.yukiAPI.openDevTools(activeId).catch(() => {})
})

// ── Iconos por defecto ────────────────────────────────────────────────────────
const DEFAULT_ICONS = {
  whatsapp: { file: '../../icons/wired-flat-2543-logo-whatsapp-hover-pinch.apng', elId: 'cat-icon-whatsapp' },
  gmail:    { file: '../../icons/wired-flat-3090-document-letter-hover-pinch.apng', elId: 'cat-icon-gmail' },
}
const loadedIcons = {}

async function loadDefaultIcons() {
  for (const [key, { file, elId }] of Object.entries(DEFAULT_ICONS)) {
    try {
      const res  = await fetch(file)
      if (!res.ok) continue
      const blob = await res.blob()
      const b64  = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.readAsDataURL(blob)
      })
      loadedIcons[key] = b64
      const el = document.getElementById(elId)
      if (el) el.innerHTML = `<img src="${b64}" style="width:28px;height:28px;object-fit:contain;" />`
      const item = document.querySelector(`[data-icon-key="${key}"]`)
      if (item) item.dataset.icon = b64
    } catch(e) {}
  }
}

// ── Migraciones ───────────────────────────────────────────────────────────────
function migrateUrls() {
  const apps = loadApps()
  let changed = false
  const fixes = {
    'https://mail.google.com': 'https://mail.google.com/mail/u/0/',
    'https://mail.google.com/mail/': 'https://mail.google.com/mail/u/0/',
    'https://mail.google.com/mail/u/0/#inbox': 'https://mail.google.com/mail/u/0/',
    'https://accounts.google.com/signin/v2/identifier?service=mail&flowName=GlifWebSignIn&flowEntry=ServiceLogin&continue=https://mail.google.com/mail/': 'https://mail.google.com/mail/u/0/',
  }
  apps.forEach(app => { if (fixes[app.url]) { app.url = fixes[app.url]; changed = true } })
  if (changed) saveApps(apps)
}

async function migratePinFromStorage() {
  try {
    const lockData = JSON.parse(localStorage.getItem('yuki-lock') || '{}')
    if (lockData.pin) {
      await window.yukiAPI.savePin(lockData.pin)
      localStorage.setItem('yuki-lock', JSON.stringify({ enabled: !!lockData.enabled }))
      console.log('[Yuki] PIN migrado a almacenamiento seguro')
    }
  } catch(e) { console.warn('[Yuki] PIN migration error:', e) }
}

async function tryRestoreFromDisk() {
  try {
    if (loadApps().length > 0) return
    const data = await window.yukiAPI.readAutosave()
    if (!data || data.version !== 1) return
    if (data.apps     && data.apps.length > 0)              localStorage.setItem(STORAGE_KEY,  JSON.stringify(data.apps))
    if (data.settings && Object.keys(data.settings).length) localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings))
    if (data.customSound) localStorage.setItem('yuki-custom-sound', data.customSound)
    console.log('[Yuki] config restaurada desde autosave')
  } catch(e) { console.warn('[Yuki] tryRestoreFromDisk error:', e) }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await tryRestoreFromDisk()
  await migratePinFromStorage()

  // Detectar primera ejecución de v0.2.0 para migraciones
  if (!localStorage.getItem('yuki-version')) {
    migrateUrls()
    localStorage.setItem('yuki-version', '0.2.0')
  }

  // Inicializar auto-sleep en el proceso principal
  const autoSleepMinutes = loadSettings().autoSleepMinutes ?? 30
  window.yukiAPI.setAutoSleep(autoSleepMinutes)

  await loadDefaultIcons()
  render()
}

init().catch(e => { console.error('[Yuki] init error:', e); render() })
(function() {
  const observer = new MutationObserver(() => {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', () => {
    if (window.lucide) window.lucide.createIcons();
  });
})();
