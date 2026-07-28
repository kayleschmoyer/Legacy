import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Routes Android's system back (hardware button and edge-swipe gesture) to an
 * in-screen action instead of letting the navigator pop the whole route.
 *
 * Screens that drill into sub-views with local state — Trade Center, Direct
 * Messages, Free Agents, League Management, the Home tab's inline sport views —
 * used to render their own in-content back chevron. Those affordances were
 * removed in LS-8766 so back navigation is handled solely by the OS, which
 * means the system back press has to unwind the local drill-down first;
 * otherwise it would skip straight out of the screen and strand the user.
 *
 * The handler is only registered while `enabled` is true and the screen is
 * focused, so a screen at its top level falls through to the default
 * pop-the-route behaviour.
 *
 * @param enabled Whether the screen currently has a sub-view to unwind.
 * @param onBack Invoked instead of the default back behaviour.
 */
export function useSystemBackAction(
  enabled: boolean,
  onBack: () => void,
): void {
  // Keep the latest callback in a ref so an inline arrow function at the call
  // site doesn't re-subscribe the listener on every render.
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          onBackRef.current();
          return true;
        },
      );
      return () => subscription.remove();
    }, [enabled]),
  );
}
