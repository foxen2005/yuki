// Preload de la ventana de bloqueo. A propósito no reutiliza
// renderer-preload.js: la pantalla de bloqueo no tiene por qué poder abrir
// vistas, leer permisos ni cerrar la app. Solo necesita comprobar un PIN.
const { contextBridge, ipcRenderer } = require('electron')

// Los textos, igual que en el renderer, se piden de forma síncrona: esta
// ventana puede aparecer en un arranque en frío, antes que nada, y no puede
// pintarse primero en español y corregirse después.
// Solo las cadenas: ni la lista de idiomas ni forma de cambiarlo. Desde la
// pantalla de bloqueo no se toca ningún ajuste.
let textos = {}
try { textos = (ipcRenderer.sendSync('i18n:paquete') || {}).textos || {} } catch (e) {}

contextBridge.exposeInMainWorld('yukiLock', {
  verificar: (pin) => ipcRenderer.invoke('lock:verify', pin),
  textos,
})
