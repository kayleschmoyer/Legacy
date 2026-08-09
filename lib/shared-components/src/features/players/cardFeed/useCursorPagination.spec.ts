import { act, renderHook } from '@testing-library/react';
import {
  useAccumulatedPages,
  useResettableCursor,
} from './useCursorPagination';

describe('useResettableCursor', () => {
  test('starts with an undefined cursor and a reset flag set', () => {
    const { result } = renderHook(() => useResettableCursor('key-a'));
    expect(result.current.cursor).toBeUndefined();
    expect(result.current.isResetRef.current).toBe(true);
  });

  test('setCursor advances the cursor without touching the reset flag', () => {
    const { result } = renderHook(() => useResettableCursor('key-a'));

    act(() => {
      result.current.isResetRef.current = false;
      result.current.setCursor('cursor-1');
    });

    expect(result.current.cursor).toBe('cursor-1');
    expect(result.current.isResetRef.current).toBe(false);
  });

  test('changing the query key resets the cursor and flags a reset', () => {
    const { result, rerender } = renderHook(
      ({ queryKey }) => useResettableCursor(queryKey),
      { initialProps: { queryKey: 'key-a' } },
    );

    act(() => {
      result.current.isResetRef.current = false;
      result.current.setCursor('cursor-1');
    });
    expect(result.current.cursor).toBe('cursor-1');

    rerender({ queryKey: 'key-b' });

    expect(result.current.cursor).toBeUndefined();
    expect(result.current.isResetRef.current).toBe(true);
  });

  test('re-rendering with the same query key leaves the cursor untouched', () => {
    const { result, rerender } = renderHook(
      ({ queryKey }) => useResettableCursor(queryKey),
      { initialProps: { queryKey: 'key-a' } },
    );

    act(() => {
      result.current.isResetRef.current = false;
      result.current.setCursor('cursor-1');
    });

    rerender({ queryKey: 'key-a' });

    expect(result.current.cursor).toBe('cursor-1');
  });
});

describe('useAccumulatedPages', () => {
  test('returns an empty list while loading, before any page has arrived', () => {
    const isResetRef = { current: true };
    const { result } = renderHook(() =>
      useAccumulatedPages<string>(['a', 'b'], true, undefined, isResetRef),
    );

    expect(result.current).toEqual([]);
  });

  test('commits the first page once loading finishes, on a reset', () => {
    const isResetRef = { current: true };
    const { result, rerender } = renderHook(
      ({ data, loading }) =>
        useAccumulatedPages<string>(data, loading, undefined, isResetRef),
      { initialProps: { data: ['a', 'b'], loading: true } },
    );

    rerender({ data: ['a', 'b'], loading: false });

    expect(result.current).toEqual(['a', 'b']);
    expect(isResetRef.current).toBe(false);
  });

  test('appends a new page onto the accumulated list when the cursor advances', () => {
    const isResetRef = { current: true };
    const { result, rerender } = renderHook(
      ({ data, loading, cursor }) =>
        useAccumulatedPages<string>(data, loading, cursor, isResetRef),
      {
        initialProps: {
          data: ['a', 'b'] as readonly string[],
          loading: false,
          cursor: undefined as string | undefined,
        },
      },
    );
    expect(result.current).toEqual(['a', 'b']);

    rerender({ data: ['c', 'd'], loading: true, cursor: 'cursor-1' });
    // Still loading the next page — nothing appended yet.
    expect(result.current).toEqual(['a', 'b']);

    rerender({ data: ['c', 'd'], loading: false, cursor: 'cursor-1' });
    expect(result.current).toEqual(['a', 'b', 'c', 'd']);
  });

  test('replaces (not appends) when isResetRef is flagged again, e.g. a filter change', () => {
    const isResetRef = { current: true };
    const { result, rerender } = renderHook(
      ({ data, loading, cursor }) =>
        useAccumulatedPages<string>(data, loading, cursor, isResetRef),
      {
        initialProps: {
          data: ['a', 'b'] as readonly string[],
          loading: false,
          cursor: undefined as string | undefined,
        },
      },
    );
    expect(result.current).toEqual(['a', 'b']);

    // Simulate a filter/sort change: caller resets the cursor and flags reset.
    isResetRef.current = true;
    rerender({ data: ['x'], loading: false, cursor: undefined });

    expect(result.current).toEqual(['x']);
  });
});
