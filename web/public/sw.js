// Shows job reminders when the app is closed or in the background.
self.addEventListener('push', (e) => {
  const d = e.data?.json() ?? {}
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) =>
      cs.some((c) => c.focused)
        ? null
        : self.registration.showNotification(d.title || 'Saathi', { body: d.body, tag: d.tag, icon: '/icon.svg', badge: '/icon.svg', requireInteraction: true, vibrate: [200, 100, 200] }),
    ),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('/'))),
  )
})
