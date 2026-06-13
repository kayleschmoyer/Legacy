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

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      // Use the already-renewed subscription if the browser provided one;
      // otherwise re-subscribe with the same options as the old subscription.
      let newSubscription = event.newSubscription;
      if (!newSubscription) {
        const options = event.oldSubscription?.options ?? {
          userVisibleOnly: true,
        };
        try {
          newSubscription =
            await self.registration.pushManager.subscribe(options);
        } catch {
          // Re-subscription failed — the client will attempt registration on
          // next page load via useWebPushRegistration.
          return;
        }
      }

      // Forward the new subscription to all open windows so the app can
      // re-register it with the backend (the SW cannot make authed API calls).
      const subscriptionJson = JSON.stringify(newSubscription.toJSON());
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        client.postMessage({
          type: 'PUSH_SUBSCRIPTION_CHANGED',
          subscription: subscriptionJson,
        });
      }
    })(),
  );
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
