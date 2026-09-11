import type React from 'react';

/**
 * Enter/Space activation for a Tamagui stack that carries an interactive
 * `role` but is not natively keyboard-operable.
 *
 * Tamagui stacks render as `div`s on web. Giving one `role="button"` (or
 * `role="tab"`) and an `onPress` makes it clickable and announces it correctly
 * to a screen reader, but leaves it unreachable and unactivatable by keyboard —
 * a `div` takes no focus and fires no click on Enter/Space. Pair this with
 * `tabIndex={0}` on any such element.
 *
 * Activation is routed through `currentTarget.click()` rather than by calling
 * `fn` directly, so the element's own press handling (and anything else bound
 * to click) runs exactly as it does for a pointer, instead of a second,
 * divergent code path.
 *
 * `undefined` is accepted so callers can pass a conditionally-present handler
 * without branching at the call site; the key press is then ignored.
 *
 * @example
 * <YStack
 *   role="button"
 *   tabIndex={0}
 *   onPress={onSelect}
 *   onKeyDown={handleKeyActivate(onSelect)}
 * />
 */
export const handleKeyActivate =
  (fn: (() => void) | undefined) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (fn != null && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.currentTarget.click();
    }
  };
