import { useCallback, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { moveItem } from './reorder';

/**
 * Native counterpart to `DraftQueuePanel.tsx`'s `@dnd-kit`-based
 * drag-to-sort (LS-8786), cross-platformed by LS-10066. `@dnd-kit` is
 * web-only (built on the HTML5 pointer/DOM event model); this hook covers
 * the same "drag a row, drop it at a new index" mechanism with
 * `react-native-gesture-handler`, which is already a dependency.
 *
 * Deliberately does not use `react-native-reanimated` shared values: the
 * web version has no live drag-follow animation either (the row just
 * snaps to its new position once the drop is committed), so a plain
 * `Gesture.Pan()` with `.runOnJS(true)` is enough to compute the target
 * index and call `onReorder` — the same contract `DraftQueuePanel.tsx`'s
 * `handleDragEnd` already has. A future native queue-row render (LS-10067)
 * that wants a live-follow animation can layer `useAnimatedStyle` on top of
 * the same gesture's `.onUpdate(...)` without changing this hook's
 * `onReorder` contract.
 *
 * Named `useNativeQueueReorder` (not `useQueueReorder.native.ts`):
 * `DraftQueuePanel.tsx` has no `.native.tsx` fork yet (LS-10067's job), so a
 * shared stem would let Metro/Jest's platform-extension resolution silently
 * swap this in underneath the still-web-only component. LS-10067's native
 * `DraftQueuePanel.native.tsx` should import this hook by its explicit name.
 */
export interface UseNativeQueueReorderOptions<T> {
  items: T[];
  getId: (item: T) => string;
  /** Row height in points, used to convert vertical drag distance to an index delta. */
  rowHeight: number;
  disabled?: boolean;
  onReorder: (reordered: T[]) => void;
}

export function useNativeQueueReorder<T>({
  items,
  getId,
  rowHeight,
  disabled,
  onReorder,
}: UseNativeQueueReorderOptions<T>) {
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const getRowGesture = useCallback(
    (item: T) => {
      const startIndex = itemsRef.current.findIndex(
        (i) => getId(i) === getId(item),
      );
      let targetIndex = startIndex;

      return Gesture.Pan()
        .enabled(!disabled && startIndex !== -1)
        .runOnJS(true)
        .onUpdate((event: { translationY: number }) => {
          if (startIndex === -1 || rowHeight <= 0) return;
          const offset = Math.round(event.translationY / rowHeight);
          targetIndex = Math.min(
            Math.max(startIndex + offset, 0),
            itemsRef.current.length - 1,
          );
        })
        .onEnd(() => {
          if (startIndex === -1 || targetIndex === startIndex) return;
          onReorder(moveItem(itemsRef.current, startIndex, targetIndex));
        });
    },
    [disabled, getId, rowHeight, onReorder],
  );

  return { getRowGesture };
}
