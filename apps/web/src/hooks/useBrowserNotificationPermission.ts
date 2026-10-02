import { useCallback, useEffect, useState } from 'react';

/**
 * The browser's notification permission, or `'unsupported'` where the
 * Notification API does not exist (older browsers, some embedded webviews).
 * Callers treat `'unsupported'` as "cannot verify" and must not block on it.
 */
export type BrowserNotificationPermission =
  | NotificationPermission
  | 'unsupported';

function readPermission(): BrowserNotificationPermission {
  return typeof Notification === 'undefined'
    ? 'unsupported'
    : Notification.permission;
}

/**
 * Tracks the OS/browser notification permission so the push preference toggle
 * can refuse to turn ON while delivery is blocked (LS-7089). The permission is
 * re-read on window focus because the user changes it in browser site
 * settings, outside the page.
 */
export function useBrowserNotificationPermission(): {
  permission: BrowserNotificationPermission;
  request: () => Promise<BrowserNotificationPermission>;
} {
  const [permission, setPermission] =
    useState<BrowserNotificationPermission>(readPermission);

  useEffect(() => {
    const sync = () => setPermission(readPermission());
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const request =
    useCallback(async (): Promise<BrowserNotificationPermission> => {
      if (typeof Notification === 'undefined') return 'unsupported';
      try {
        await Notification.requestPermission();
      } catch {
        // Fall through: re-read below so a failed prompt reports the real state.
      }
      const next = readPermission();
      setPermission(next);
      return next;
    }, []);

  return { permission, request };
}
