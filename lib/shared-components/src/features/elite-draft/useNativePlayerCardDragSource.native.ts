import { Gesture } from 'react-native-gesture-handler';
import type { PlayerCardDragSourceOptions } from './dragSource.types';

/**
 * Native implementation of the shared drag-source contract (see
 * `dragSource.types.ts`), built on `react-native-gesture-handler` (already a
 * dependency — see `usePlayerCardDragSource.ts` for why gesture-handler +
 * reanimated won over a third-party DnD library in the LS-10066 spike).
 *
 * `onDragStartPlayer`/`onDragEndPlayer` are notified at gesture
 * start/finalize, mirroring the web HTML5 dragstart/dragend lifecycle.
 * `.runOnJS(true)` keeps the callbacks plain JS functions rather than
 * worklets — this mechanism only needs the start/end notification the rail
 * already consumes, not a UI-thread-driven drag animation, so no
 * `react-native-reanimated` shared values are needed here. A future native
 * PlayerCard render (LS-10067) that wants live drag-follow visuals can layer
 * `useSharedValue`/`useAnimatedStyle` on top of this same gesture via
 * `gesture.onUpdate(...)` without changing this contract.
 *
 * Deliberately NOT named `usePlayerCardDragSource.native.ts`: `PlayerCard.tsx`
 * itself has no `.native.tsx` fork yet (that's LS-10067's job) but still runs
 * under the mobile Jest project as a generic spec, so if this file shared
 * `usePlayerCardDragSource`'s stem, Metro/Jest's platform-extension
 * resolution would silently swap this native implementation in underneath
 * the still-web-only component and break it. LS-10067's native
 * `PlayerCard.native.tsx` should import this hook by its explicit name.
 */
export function useNativePlayerCardDragSource({
  player,
  enabled,
  onDragStartPlayer,
  onDragEndPlayer,
}: PlayerCardDragSourceOptions) {
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .runOnJS(true)
    .onStart(() => {
      onDragStartPlayer?.(player);
    })
    .onEnd(() => {
      onDragEndPlayer?.();
    })
    .onFinalize(() => {
      onDragEndPlayer?.();
    });

  return { gesture };
}
