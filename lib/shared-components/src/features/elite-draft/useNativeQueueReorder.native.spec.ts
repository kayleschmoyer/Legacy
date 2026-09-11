/**
 * LS-10066: native counterpart to DraftQueuePanel.spec.tsx's
 * "drag-to-sort (LS-8786)" coverage. Drives the captured gesture callbacks
 * directly (translationY deltas), the same way DraftQueuePanel.spec.tsx
 * drives the captured `@dnd-kit` `onDragEnd` directly rather than simulating
 * real pointer gestures.
 */
import { act, renderHook } from '@testing-library/react';
import { useNativeQueueReorder } from './useNativeQueueReorder.native';

const ROW_HEIGHT = 48;
const items = [
  { id: 'a', name: 'Lou Gehrig' },
  { id: 'b', name: 'Rogers Hornsby' },
  { id: 'c', name: 'Honus Wagner' },
];

// jest-setup-mobile.js replaces `react-native-gesture-handler` with a
// minimal manual mock (a chainable `Gesture.Pan()` builder whose registered
// callbacks land in `_handlers`) — the real package can't run under jsdom.
// That shape has no equivalent in the real `react-native-gesture-handler`
// types the hook is declared against, so the test types its own view of it
// rather than fighting the real types, the same way DraftQueuePanel.spec.tsx
// types its captured `@dnd-kit` `onDragEnd` independently.
interface MockPanGesture {
  enabled: jest.Mock;
  _handlers: {
    onUpdate?: (event: { translationY: number }) => void;
    onEnd?: () => void;
  };
}

function asMock(gesture: unknown): MockPanGesture {
  return gesture as MockPanGesture;
}

function drive(gesture: MockPanGesture, translationY: number) {
  act(() => {
    gesture._handlers.onUpdate?.({ translationY });
    gesture._handlers.onEnd?.();
  });
}

describe('useNativeQueueReorder', () => {
  it('reorders forward when dragged down past the row height', () => {
    const onReorder = jest.fn();
    const { result } = renderHook(() =>
      useNativeQueueReorder({
        items,
        getId: (i) => i.id,
        rowHeight: ROW_HEIGHT,
        onReorder,
      }),
    );

    const gesture = asMock(result.current.getRowGesture(items[0]));
    // round(1.5) = 2 rows down: index 0 -> 2.
    drive(gesture, ROW_HEIGHT * 1.5);

    expect(onReorder).toHaveBeenCalledWith([items[1], items[2], items[0]]);
  });

  it('reorders backward when dragged up', () => {
    const onReorder = jest.fn();
    const { result } = renderHook(() =>
      useNativeQueueReorder({
        items,
        getId: (i) => i.id,
        rowHeight: ROW_HEIGHT,
        onReorder,
      }),
    );

    const gesture = asMock(result.current.getRowGesture(items[2]));
    // JS rounds -1.5 up to -1 (toward +Infinity): one row up, index 2 -> 1.
    drive(gesture, -ROW_HEIGHT * 1.5);

    expect(onReorder).toHaveBeenCalledWith([items[0], items[2], items[1]]);
  });

  it('is a no-op when the drag does not cross a row boundary', () => {
    const onReorder = jest.fn();
    const { result } = renderHook(() =>
      useNativeQueueReorder({
        items,
        getId: (i) => i.id,
        rowHeight: ROW_HEIGHT,
        onReorder,
      }),
    );

    const gesture = asMock(result.current.getRowGesture(items[0]));
    drive(gesture, ROW_HEIGHT * 0.2);

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('clamps the target index to the list bounds', () => {
    const onReorder = jest.fn();
    const { result } = renderHook(() =>
      useNativeQueueReorder({
        items,
        getId: (i) => i.id,
        rowHeight: ROW_HEIGHT,
        onReorder,
      }),
    );

    const gesture = asMock(result.current.getRowGesture(items[0]));
    drive(gesture, ROW_HEIGHT * 100);

    expect(onReorder).toHaveBeenCalledWith([items[1], items[2], items[0]]);
  });

  it('disables the gesture when `disabled` is true', () => {
    const { result } = renderHook(() =>
      useNativeQueueReorder({
        items,
        getId: (i) => i.id,
        rowHeight: ROW_HEIGHT,
        disabled: true,
        onReorder: jest.fn(),
      }),
    );

    const gesture = asMock(result.current.getRowGesture(items[0]));
    expect(gesture.enabled).toHaveBeenCalledWith(false);
  });
});
