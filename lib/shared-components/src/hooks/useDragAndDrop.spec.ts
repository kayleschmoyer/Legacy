import { act, renderHook } from '@testing-library/react';

import { useDragAndDrop } from './useDragAndDrop';

describe('useDragAndDrop', () => {
  it('starts with null draggedItem and dropZone', () => {
    const { result } = renderHook(() => useDragAndDrop());

    expect(result.current.draggedItem).toBeNull();
    expect(result.current.dropZone).toBeNull();
  });

  it('sets draggedItem on handleDragStart', () => {
    const { result } = renderHook(() => useDragAndDrop());

    act(() => {
      result.current.handleDragStart({ id: '1', type: 'player' });
    });

    expect(result.current.draggedItem).toEqual({ id: '1', type: 'player' });
  });

  it('sets dropZone and clears draggedItem on handleDrop', () => {
    const { result } = renderHook(() => useDragAndDrop());

    act(() => {
      result.current.handleDragStart({ id: '1', type: 'player' });
    });

    act(() => {
      result.current.handleDrop('zone-a');
    });

    expect(result.current.dropZone).toBe('zone-a');
    expect(result.current.draggedItem).toBeNull();
  });

  it('clears both draggedItem and dropZone on handleDragEnd', () => {
    const { result } = renderHook(() => useDragAndDrop());

    act(() => {
      result.current.handleDragStart({ id: '2', type: 'card' });
    });

    act(() => {
      result.current.handleDrop('zone-b');
    });

    // Both should now be set / cleared from drop
    expect(result.current.dropZone).toBe('zone-b');

    act(() => {
      result.current.handleDragEnd();
    });

    expect(result.current.draggedItem).toBeNull();
    expect(result.current.dropZone).toBeNull();
  });

  it('resets state when drag is cancelled (start then end, no drop)', () => {
    const { result } = renderHook(() => useDragAndDrop());

    act(() => {
      result.current.handleDragStart({ id: '3', type: 'item' });
    });

    expect(result.current.draggedItem).toEqual({ id: '3', type: 'item' });

    // Simulate cancelled drag — user releases without dropping
    act(() => {
      result.current.handleDragEnd();
    });

    expect(result.current.draggedItem).toBeNull();
    expect(result.current.dropZone).toBeNull();
  });

  it('returns stable callback references across renders', () => {
    const { result, rerender } = renderHook(() => useDragAndDrop());

    const first = {
      handleDragStart: result.current.handleDragStart,
      handleDrop: result.current.handleDrop,
      handleDragEnd: result.current.handleDragEnd,
    };

    rerender();

    expect(result.current.handleDragStart).toBe(first.handleDragStart);
    expect(result.current.handleDrop).toBe(first.handleDrop);
    expect(result.current.handleDragEnd).toBe(first.handleDragEnd);
  });
});
