import type { DragEvent } from 'react';
import type { PlayerCardDragSourceOptions } from './dragSource.types';

/**
 * Web implementation of the shared drag-source contract (see
 * `dragSource.types.ts`). Unchanged from the pre-LS-10066 inline handlers in
 * `PlayerCard.tsx` — the `text/plain` payload keeps the native drag valid in
 * all browsers, while the rail actually resolves the dragged player from
 * lifted state (`onDragStartPlayer`), not the drag event's payload.
 */
export function usePlayerCardDragSource({
  player,
  enabled,
  onDragStartPlayer,
  onDragEndPlayer,
}: PlayerCardDragSourceOptions) {
  return {
    draggable: enabled,
    onDragStart: enabled
      ? (e: DragEvent) => {
          e.dataTransfer.setData('text/plain', String(player.id));
          e.dataTransfer.effectAllowed = 'move';
          onDragStartPlayer?.(player);
        }
      : undefined,
    onDragEnd: enabled ? () => onDragEndPlayer?.() : undefined,
  };
}
