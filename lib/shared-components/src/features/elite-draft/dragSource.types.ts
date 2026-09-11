import type { DraftPlayer } from './types';

/**
 * Shared contract for "drag this player card" (LS-8068, cross-platformed by
 * LS-10066). `PlayerCard.tsx` previously wired the HTML5 native `draggable`
 * API directly — web-only, no React Native equivalent. The mechanism is now
 * behind this interface, implemented per-platform:
 *  - web (`usePlayerCardDragSource.ts`): unchanged HTML5 drag events.
 *  - native (`usePlayerCardDragSource.native.ts`): a
 *    `react-native-gesture-handler` Pan gesture reporting the same
 *    start/end lifecycle.
 *
 * Both implementations call `onDragStartPlayer`/`onDragEndPlayer` at the
 * same points in the gesture lifecycle, so callers (the draft rail's drop
 * target) do not need to know which platform they're running on.
 */
export interface PlayerCardDragSourceOptions {
  player: DraftPlayer;
  enabled: boolean;
  onDragStartPlayer?: (player: DraftPlayer) => void;
  onDragEndPlayer?: () => void;
}
