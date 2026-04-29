// Custom service worker code appended by next-pwa to the generated
// /sw.js. We add push-notification handlers here so the same SW that
// caches the app shell also delivers reminders.
//
// The push payload is JSON: { title, body, url? }. Falls back to a
// generic reminder if the payload is empty.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'HomeKeeper', body: event.data ? event.data.text() : 'You have a task to review.' };
  }
  const title = data.title || 'HomeKeeper';
  const options = {
    body: data.body || 'You have a task to review.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/dashboard' },
    tag: data.tag || 'homekeeper-reminder',
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            client.navigate(url);
          } catch (_) {
            /* navigation may fail across origins; just focus */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
