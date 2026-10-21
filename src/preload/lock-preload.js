// Preload de la ventana de bloqueo. A propósito no reutiliza
// renderer-preload.js: la pantalla de bloqueo no tiene por qué poder abrir
// vistas, leer permisos ni cerrar la app. Solo necesita comprobar un PIN.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('yukiLock', {
  verificar: (pin) => ipcRenderer.invoke('lock:verify', pin),
})
