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

describe('useAccumulatedPages — stale rows across a query reset (LS-10435/LS-10438)', () => {
  test('clears the accumulated rows while a reset query is loading', () => {
    const isResetRef = { current: true };
    const { result, rerender } = renderHook(
      ({ data, loading }) =>
        useAccumulatedPages<string>(data, loading, undefined, isResetRef),
      {
        initialProps: {
          data: ['aaron', 'cobb', 'bonds', 'ruth'] as readonly string[],
          loading: false,
        },
      },
    );
    expect(result.current).toEqual(['aaron', 'cobb', 'bonds', 'ruth']);

    // Search changes: reset flagged, the new (network-only) request is in
    // flight and has no data yet.
    isResetRef.current = true;
    rerender({ data: [], loading: true });

    expect(result.current).toEqual([]);
    // The flag stays set so the arriving page replaces rather than appends.
    expect(isResetRef.current).toBe(true);

    rerender({ data: ['ruth'], loading: false });
    expect(result.current).toEqual(['ruth']);
    expect(isResetRef.current).toBe(false);
  });

  test('keeps the accumulated rows while a next page (no reset) is loading', () => {
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

    rerender({ data: [], loading: true, cursor: 'cursor-1' });
    expect(result.current).toEqual(['a', 'b']);
  });

  test('wired together with useResettableCursor: a filter change never shows the old rows once the new query is loading', () => {
    // Mirrors the card feeds' wiring: queryKey → cursor hook → query → pages.
    const { result, rerender } = renderHook(
      ({ queryKey, data, loading }) => {
        const { cursor, setCursor, isResetRef } = useResettableCursor(queryKey);
        const rows = useAccumulatedPages<string>(
          data,
          loading,
          cursor,
          isResetRef,
        );
        return { rows, cursor, setCursor };
      },
      {
        initialProps: {
          queryKey: 'ALL|',
          data: ['brady', 'rice', 'manning'] as readonly string[],
          loading: false,
        },
      },
    );
    expect(result.current.rows).toEqual(['brady', 'rice', 'manning']);

    // Scroll to a second page first so the reset also has a cursor to clear.
    // (Real queries flip to loading in the same render the cursor advances.)
    rerender({ queryKey: 'ALL|', data: [], loading: true });
    act(() => result.current.setCursor('cursor-1'));
    expect(result.current.rows).toEqual(['brady', 'rice', 'manning']);
    rerender({ queryKey: 'ALL|', data: ['moss'], loading: false });
    expect(result.current.rows).toEqual(['brady', 'rice', 'manning', 'moss']);

    // Click the RB chip: new key, request in flight.
    rerender({ queryKey: 'RB|', data: [], loading: true });
    expect(result.current.cursor).toBeUndefined();
    expect(result.current.rows).toEqual([]);

    rerender({ queryKey: 'RB|', data: ['smith', 'payton'], loading: false });
    expect(result.current.rows).toEqual(['smith', 'payton']);
  });

  test('wired together: switching to a filter whose first render is already loading clears the rows even without a cursor', () => {
    const { result, rerender } = renderHook(
      ({ queryKey, data, loading }) => {
        const { cursor, isResetRef } = useResettableCursor(queryKey);
        return useAccumulatedPages<string>(data, loading, cursor, isResetRef);
      },
      {
        initialProps: {
          queryKey: 'ALL|',
          data: ['aaron', 'ruth'] as readonly string[],
          loading: false,
        },
      },
    );
    expect(result.current).toEqual(['aaron', 'ruth']);

    rerender({ queryKey: 'ALL|Babe Ruth', data: [], loading: true });
    expect(result.current).toEqual([]);

    rerender({ queryKey: 'ALL|Babe Ruth', data: ['ruth'], loading: false });
    expect(result.current).toEqual(['ruth']);
  });
});
