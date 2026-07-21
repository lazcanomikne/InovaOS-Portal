// Suscripción a Web Push y captura de aprobación del usuario.
// En iOS solo funciona con la app instalada (standalone) y tras un gesto.
import axios from '~/utils/axios'

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export const pushSupported = () =>
  import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const getPermission = () => (pushSupported() ? Notification.permission : 'unsupported')

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export const isIOS = () => {
  const ua = window.navigator.userAgent.toLowerCase()
  const classic = /iphone|ipad|ipod/.test(ua)
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
  return classic || iPadOS
}

// iOS necesita la app instalada para poder suscribirse a push.
export const needsInstallForPush = () => isIOS() && !isStandalone()

// Crea (o reutiliza) la suscripción y la registra en el backend.
export async function subscribeCurrent() {
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { data } = await axios.get('/notifications/vapid-public')
    if (!data || !data.publicKey) throw new Error('no-vapid')
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey)
    })
  }
  const json = sub.toJSON()
  await axios.post('/notifications/subscribe', { endpoint: sub.endpoint, keys: json.keys })
  return sub
}

// Pide permiso (debe llamarse desde un gesto del usuario) y suscribe.
export async function enablePush() {
  if (!pushSupported()) throw new Error('unsupported')
  if (needsInstallForPush()) throw new Error('needs-install')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('denied')
  await subscribeCurrent()
  return 'granted'
}

// Reasegura la suscripción al abrir la app si el permiso ya está concedido.
// Es la clave de la fiabilidad: si el navegador rotó la suscripción, se
// vuelve a registrar en el backend en cada arranque.
export async function ensureSubscribed() {
  try {
    if (pushSupported() && getPermission() === 'granted' && !needsInstallForPush()) {
      await subscribeCurrent()
    }
  } catch { /* silencioso */ }
}

// Cancela la suscripción local y en el backend.
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await axios.post('/notifications/unsubscribe', { endpoint: sub.endpoint }).catch(() => {})
      await sub.unsubscribe().catch(() => {})
    }
  } catch { /* silencioso */ }
}
