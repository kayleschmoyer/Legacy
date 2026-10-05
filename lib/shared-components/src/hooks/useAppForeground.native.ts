import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { AppForegroundCallback } from './useAppForeground';

export type { AppForegroundCallback };

/**
 * Fires `onForeground` when the app returns to the `active` state after being
 * backgrounded (or `inactive`), with the time spent away (LS-10593).
 *
 * React Native variant — the browser `visibilitychange`/`online` signals the
 * web variant and `useWebSocket` rely on never fire on native, so without
 * this a minimized app's draft socket (frozen or silently dropped by the OS)
 * was never recovered or resynced when the user came back.
 *
 * The callback is read through a ref, so passing an inline function does not
 * re-register the listener on every render.
 */
export function useAppForeground(onForeground: AppForegroundCallback): void {
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;

  useEffect(() => {
    let backgroundedAt: number | null =
      AppState.currentState === 'active' ? null : Date.now();

    const handleChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        backgroundedAt ??= Date.now();
        return;
      }
      if (backgroundedAt === null) return;
      const backgroundMs = Date.now() - backgroundedAt;
      backgroundedAt = null;
      callbackRef.current(backgroundMs);
    };

    const subscription = AppState.addEventListener('change', handleChange);
    return () => {
      // Optional call: test environments mock `addEventListener` without a
      // subscription return value.
      subscription?.remove();
    };
  }, []);
}
