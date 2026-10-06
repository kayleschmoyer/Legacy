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
 * `onBackground`, when given, fires on the transition into the `background`
 * state (LS-10625) — not on the transient `inactive` state (app switcher,
 * control center, system dialogs) — so callers can park realtime connections
 * instead of letting them churn while minimized. It also fires once on mount
 * if the app is already backgrounded.
 *
 * The callbacks are read through refs, so passing inline functions does not
 * re-register the listener on every render.
 */
export function useAppForeground(
  onForeground: AppForegroundCallback,
  onBackground?: () => void,
): void {
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;
  const backgroundCallbackRef = useRef(onBackground);
  backgroundCallbackRef.current = onBackground;

  useEffect(() => {
    let backgroundedAt: number | null =
      AppState.currentState === 'active' ? null : Date.now();
    let notifiedBackground = false;

    const notifyBackground = () => {
      if (notifiedBackground) return;
      notifiedBackground = true;
      backgroundCallbackRef.current?.();
    };

    if (AppState.currentState === 'background') notifyBackground();

    const handleChange = (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        backgroundedAt ??= Date.now();
        if (nextState === 'background') notifyBackground();
        return;
      }
      notifiedBackground = false;
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
