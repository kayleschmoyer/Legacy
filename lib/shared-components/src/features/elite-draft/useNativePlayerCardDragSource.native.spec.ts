/**
 * LS-10066: native counterpart to PlayerCard.spec.tsx's
 * "drag-to-draft source" coverage. Mirrors the web assertions (enabled only
 * when it's the user's pick, reports the player on drag start, notifies on
 * drag end) against the `react-native-gesture-handler` Pan gesture instead
 * of an HTML5 drag event.
 */
import { useNativePlayerCardDragSource } from './useNativePlayerCardDragSource.native';
import type { DraftPlayer } from './types';

const player: DraftPlayer = {
  id: 9,
  name: 'Tester',
  position: 'SS',
  eligiblePositions: ['SS'],
  avg: 0.3,
  hr: 10,
  rbi: 50,
  runs: 60,
  sb: 5,
  games: 100,
  hits: 120,
  obp: 0.36,
  slg: 0.45,
};

// jest-setup-mobile.js replaces `react-native-gesture-handler` with a
// minimal manual mock (a chainable `Gesture.Pan()` builder) — the real
// package can't run under jsdom. That mock's shape (an `_handlers` bag the
// test can invoke directly) has no equivalent in the real
// `react-native-gesture-handler` types the hook is declared against, so
// tests need their own view of it, the same way DraftQueuePanel.spec.tsx
// types its captured `@dnd-kit` `onDragEnd` independently of the real
// `@dnd-kit/core` types rather than fighting them.
interface MockPanGesture {
  enabled: jest.Mock;
  runOnJS: jest.Mock;
  _handlers: {
    onStart?: () => void;
    onEnd?: () => void;
    onFinalize?: () => void;
  };
}

function asMock(gesture: unknown): MockPanGesture {
  return gesture as MockPanGesture;
}

describe('useNativePlayerCardDragSource', () => {
  it('builds an enabled Pan gesture and reports the player on gesture start', () => {
    const onDragStartPlayer = jest.fn();
    const onDragEndPlayer = jest.fn();

    const gesture = asMock(
      useNativePlayerCardDragSource({
        player,
        enabled: true,
        onDragStartPlayer,
        onDragEndPlayer,
      }).gesture,
    );

    expect(gesture.enabled).toHaveBeenCalledWith(true);
    expect(gesture.runOnJS).toHaveBeenCalledWith(true);

    gesture._handlers.onStart?.();
    expect(onDragStartPlayer).toHaveBeenCalledWith(player);
    expect(onDragEndPlayer).not.toHaveBeenCalled();
  });

  it('notifies drag-end on gesture end and on finalize', () => {
    const onDragEndPlayer = jest.fn();
    const gesture = asMock(
      useNativePlayerCardDragSource({
        player,
        enabled: true,
        onDragEndPlayer,
      }).gesture,
    );

    gesture._handlers.onEnd?.();
    expect(onDragEndPlayer).toHaveBeenCalledTimes(1);

    gesture._handlers.onFinalize?.();
    expect(onDragEndPlayer).toHaveBeenCalledTimes(2);
  });

  it('builds a disabled gesture when not the user pick (mirrors dragEnabled in PlayerCard.tsx)', () => {
    const gesture = asMock(
      useNativePlayerCardDragSource({
        player,
        enabled: false,
      }).gesture,
    );

    expect(gesture.enabled).toHaveBeenCalledWith(false);
  });

  it('is a no-op when the callbacks are omitted', () => {
    const gesture = asMock(
      useNativePlayerCardDragSource({
        player,
        enabled: true,
      }).gesture,
    );

    expect(() => gesture._handlers.onStart?.()).not.toThrow();
    expect(() => gesture._handlers.onEnd?.()).not.toThrow();
  });
});
