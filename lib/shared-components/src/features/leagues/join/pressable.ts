import type React from 'react';

/**
 * Keyboard affordances for a non-native pressable (LS-8812).
 *
 * These screens build buttons out of `XStack`/`Text` rather than `<button>`, so
 * on web they are not focusable or Enter/Space-activatable by default. This
 * mirrors what `LeaguesLedgerScreen` does inline for every pressable row; both
 * props are inert on native.
 *
 * Pass `disabled` to keep an inert control out of the tab order.
 */
export function keyboardPressProps(
  onPress: (() => void) | undefined,
  disabled = false,
): {
  tabIndex?: number;
  onKeyDown?: (event: React.KeyboardEvent) => void;
} {
  if (!onPress || disabled) return {};
  return {
    tabIndex: 0,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') onPress();
    },
  };
}
