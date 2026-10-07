import { type RefObject, useEffect } from 'react';

/**
 * Keyboard behaviour for a header menu button (LS-10706): while the menu is
 * open, Escape closes it and returns focus to the trigger, and
 * ArrowDown/ArrowUp move focus through the `role="menuitem"` elements inside
 * `containerRef` (wrapping at either end). ArrowDown from the trigger lands
 * on the first item, ArrowUp on the last.
 *
 * Arrow keys are only handled while focus is inside `containerRef`, so the
 * listener never steals arrows from the rest of the page.
 */
export function useMenuKeyboard({
  isOpen,
  onClose,
  containerRef,
  triggerRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
}): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      const container = containerRef.current;
      if (!container || !container.contains(document.activeElement)) return;
      const items = Array.from(
        container.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      );
      if (items.length === 0) return;

      event.preventDefault();
      const currentIndex = items.findIndex((el) =>
        el.contains(document.activeElement),
      );
      let nextIndex: number;
      if (event.key === 'ArrowDown') {
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      }
      items[nextIndex]?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, containerRef, triggerRef]);
}
