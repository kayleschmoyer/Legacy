import { useEffect, useRef } from 'react';

/**
 * Callback fired when the app/tab returns to the foreground.
 * @param backgroundMs How long it was in the background, in milliseconds.
 */
export type AppForegroundCallback = (backgroundMs: number) => void;

/**
 * Fires `onForeground` when the page becomes visible again after being
 * hidden, with the hidden duration (LS-10593).
 *
 * Web variant — keyed on `visibilitychange`. The React Native variant
 * (`useAppForeground.native.ts`) uses `AppState` instead; platform
 * resolution picks the right file, so callers import `./useAppForeground`.
 *
 * The callback is read through a ref, so passing an inline function does not
 * re-register the listener on every render.
 */
export function useAppForeground(onForeground: AppForegroundCallback): void {
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;

  useEffect(() => {
    if (
      typeof document === 'undefined' ||
      typeof document.addEventListener !== 'function'
    ) {
      return undefined;
    }

    let hiddenAt: number | null =
      document.visibilityState === 'hidden' ? Date.now() : null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt ??= Date.now();
        return;
      }
      if (document.visibilityState !== 'visible' || hiddenAt === null) return;
      const backgroundMs = Date.now() - hiddenAt;
      hiddenAt = null;
      callbackRef.current(backgroundMs);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
