/* eslint-disable no-restricted-globals -- Service worker context relies on globals like `self` and `clients`; keep for editor linting even though public/** is excluded from ESLint */

/**
 * Legacy Sports Service Worker — Web Push Notifications
 *
 * Handles incoming push events and notification click events.
 * Registered by useWebPushRegistration hook on login.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Legacy Sports', body: event.data.text() };
  }

  const title = payload.title || 'Legacy Sports';
  const options = {
    body: payload.body || '',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    data: payload.data || {},
    tag: payload.notificationType || 'default',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/notifications';

  if (data.leagueId && data.matchupId) {
    url = `/baseball/league/${data.leagueId}/matchups/${data.matchupId}`;
  } else if (data.leagueId) {
    url = `/baseball/league/${data.leagueId}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => client.navigate(url));
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
