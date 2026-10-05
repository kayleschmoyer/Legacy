import { useEffect } from 'react';
import { LOGGER } from '@legacy-sports/logging';

/**
 * Hold a Screen Wake Lock while `active`, so a draft left on screen (often in
 * browser fullscreen) doesn't let the PC sleep mid-draft (LS-10593).
 *
 * Fullscreen alone never keeps the display awake, and the browser releases a
 * held lock whenever the page is hidden (tab switch, minimise, OS lock) — so
 * the lock is re-acquired on `visibilitychange` and `fullscreenchange`.
 *
 * No-op where the API is missing (older browsers, React Native — native
 * screens use `expo-keep-awake` at the route level instead).
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (
      !active ||
      typeof document === 'undefined' ||
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator)
    ) {
      return;
    }

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async (): Promise<void> => {
      if (
        cancelled ||
        document.visibilityState !== 'visible' ||
        (sentinel && !sentinel.released)
      ) {
        return;
      }
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
      } catch (error) {
        // Denied (no user activation yet, battery saver, permissions policy):
        // the next visibility/fullscreen change retries.
        LOGGER.debug('[useScreenWakeLock] wake lock request failed', {
          error,
        });
      }
    };

    const onChange = (): void => {
      void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onChange);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onChange);
      document.removeEventListener('fullscreenchange', onChange);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
