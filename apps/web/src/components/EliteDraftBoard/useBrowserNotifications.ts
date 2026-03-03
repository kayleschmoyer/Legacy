/**
 * useBrowserNotifications
 *
 * Requests the browser Notification permission on first render (if not already
 * granted/denied) and provides a helper that fires a desktop notification only
 * when the page is in the background.  Notifications are silently skipped when
 * the Notification API is unavailable (e.g. Safari < 16 or non-HTTPS contexts).
 */
import { useCallback, useEffect, useState } from 'react';

export type NotificationPermission = 'default' | 'granted' | 'denied';

export interface UseBrowserNotificationsReturn {
  /** Current Notification.permission value (or 'denied' if unsupported). */
  permission: NotificationPermission;
  /**
   * Fire a desktop notification.  Will silently no-op if:
   * - permission is not 'granted'
   * - the page is currently focused
   * - the Notification API is unavailable
   */
  notify: (title: string, options?: NotificationOptions) => void;
}

export function useBrowserNotifications(): UseBrowserNotificationsReturn {
  const supported = typeof window !== 'undefined' && 'Notification' in window;

  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : 'denied',
  );

  // Request permission once on mount if the API is available and not yet decided.
  useEffect(() => {
    if (!supported || Notification.permission !== 'default') return;

    void Notification.requestPermission().then((result) => {
      setPermission(result);
    });
  }, [supported]);

  const notify = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!supported) return;
      if (Notification.permission !== 'granted') return;
      // Only notify when the user isn't actively looking at the tab.
      if (document.visibilityState === 'visible') return;

      try {
        const n = new Notification(title, {
          icon: '/favicon.ico',
          ...options,
        });
        // Auto-close after 8 s so it doesn't linger indefinitely.
        setTimeout(() => n.close(), 8000);
      } catch {
        // Constructing a Notification can throw in some browsers/contexts.
      }
    },
    [supported],
  );

  return { permission, notify };
}
