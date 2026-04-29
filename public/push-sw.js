// Minimal HomeKeeper push-notification service worker.
//
// Separate from next-pwa's /sw.js (which handles app caching) so iOS
// Safari can activate this one cleanly — its caching logic is the
// usual culprit for SW activation hangs on iOS PWAs.
//
// Scope is /push-sw/ so it doesn't fight next-pwa's root-scoped SW.

self.addEventListener('install', (event) => {
  // Skip the waiting phase so the SW activates immediately.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all clients so subscribeToPush() can use this SW right
  // away after registration.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {
      title: 'HomeKeeper',
      body: event.data ? event.data.text() : 'You have a task to review.',
    };
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
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            try {
              client.navigate(url);
            } catch (_) {
              /* may fail across origins; just focus */
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
