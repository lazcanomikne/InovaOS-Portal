// Auto-actualización de la PWA.
//
// El service worker cachea la app, así que un deploy nuevo no se ve hasta que
// el SW se actualiza. Con `registerType: 'autoUpdate'` + `skipWaiting` el SW
// nuevo se activa solo, pero una sesión ya abierta sólo revisa si hay versión
// nueva al cargar. Este plugin cierra esos huecos:
//
//   1. Revisa si hay versión nueva al cargar, al volver a la pestaña y cada
//      minuto, para que una sesión abierta mucho tiempo no se quede atrás.
//   2. Cuando el SW nuevo toma el control (hubo actualización), recarga una
//      sola vez para aplicarla. No recarga en la primera instalación.
export default defineNuxtPlugin(() => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  // Si YA había un SW controlando la página, un cambio de controlador quiere
  // decir que se activó una versión nueva -> se recarga para aplicarla. En la
  // primera instalación no había controlador, así que no se recarga.
  const habiaControlador = !!navigator.serviceWorker.controller
  let recargando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControlador || recargando) return
    recargando = true
    window.location.reload()
  })

  navigator.serviceWorker.ready.then((registro) => {
    const revisar = () => { registro.update().catch(() => {}) }
    revisar()
    setInterval(revisar, 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revisar()
    })
  }).catch(() => {})
})
