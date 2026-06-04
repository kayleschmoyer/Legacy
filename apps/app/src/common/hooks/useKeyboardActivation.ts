import { useCallback } from 'react';
import { Platform } from 'react-native';

/**
 * Returns keyboard activation props for interactive elements that are not
 * native <button> elements. Spread the result onto a Pressable or View that
 * has accessibilityRole="button" to make it keyboard-accessible on web.
 *
 * On native (iOS/Android) returns an empty object — the platform
 * accessibility framework (VoiceOver, TalkBack) triggers onPress directly
 * and no keyboard handler is needed.
 *
 * On web (Expo Web) returns an onKeyDown handler that calls `onActivate`
 * when the user presses Enter or Space, matching the ARIA button contract.
 *
 * Usage:
 *   const keyboardProps = useKeyboardActivation(() => doSomething());
 *   <Pressable accessibilityRole="button" tabIndex={0} {...keyboardProps} />
 */
export function useKeyboardActivation(onActivate: () => void): {
  onKeyDown?: (e: React.KeyboardEvent<Element>) => void;
} {
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<Element>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
    [onActivate],
  );

  return Platform.OS === 'web' ? { onKeyDown } : {};
}
