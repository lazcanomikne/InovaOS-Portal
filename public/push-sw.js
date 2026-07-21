/* push-sw.js
 * Manejadores de Web Push que se añaden al service worker de Workbox
 * (vía workbox.importScripts). Muestra la notificación y enfoca/abre la app
 * en la URL indicada al tocarla.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Inovatech', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Inovatech';
  const options = {
    body: data.body || '',
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/app/dashboard', notifId: data.notifId },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/app/dashboard';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        try { await client.navigate(url); } catch (e) { /* algunas plataformas no permiten navigate */ }
        return client.focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
