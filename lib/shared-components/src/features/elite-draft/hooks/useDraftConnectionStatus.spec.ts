/**
 * useDraftConnectionStatus — LS-9856.
 *
 * The debounce is the whole point of this hook: a micro-blip must stay
 * completely silent, a real drop must escalate, and recovery must clear the
 * warning the instant the socket comes back. These tests pin the thresholds'
 * behavior (not their exact values — those are read from the exported
 * constants so a deliberate retune doesn't read as a regression).
 */
import { act, renderHook } from '@testing-library/react';
import {
  DRAFT_CONNECTION_LOST_DELAY_MS,
  DRAFT_RECONNECTING_DELAY_MS,
  useDraftConnectionStatus,
} from './useDraftConnectionStatus';

describe('useDraftConnectionStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const advance = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('reports online while the socket is connected', () => {
    const { result } = renderHook(() =>
      useDraftConnectionStatus({ connected: true, enabled: true }),
    );

    expect(result.current).toBe('online');
    advance(DRAFT_CONNECTION_LOST_DELAY_MS * 2);
    expect(result.current).toBe('online');
  });

  it('stays silent through a blip that recovers inside the debounce window', () => {
    const { result, rerender } = renderHook(
      ({ connected }) => useDraftConnectionStatus({ connected, enabled: true }),
      { initialProps: { connected: true } },
    );

    rerender({ connected: false });
    advance(DRAFT_RECONNECTING_DELAY_MS - 1);
    expect(result.current).toBe('online');

    rerender({ connected: true });
    advance(DRAFT_CONNECTION_LOST_DELAY_MS * 2);
    expect(result.current).toBe('online');
  });

  it('escalates to reconnecting, then lost, on a sustained drop', () => {
    const { result, rerender } = renderHook(
      ({ connected }) => useDraftConnectionStatus({ connected, enabled: true }),
      { initialProps: { connected: true } },
    );

    rerender({ connected: false });
    advance(DRAFT_RECONNECTING_DELAY_MS);
    expect(result.current).toBe('reconnecting');

    advance(DRAFT_CONNECTION_LOST_DELAY_MS - DRAFT_RECONNECTING_DELAY_MS);
    expect(result.current).toBe('lost');
  });

  it('clears back to online on the reconnect edge', () => {
    const { result, rerender } = renderHook(
      ({ connected }) => useDraftConnectionStatus({ connected, enabled: true }),
      { initialProps: { connected: true } },
    );

    rerender({ connected: false });
    advance(DRAFT_CONNECTION_LOST_DELAY_MS);
    expect(result.current).toBe('lost');

    rerender({ connected: true });
    expect(result.current).toBe('online');
  });

  // Auction drafts and the signed-out state never open a socket, so a
  // permanently-false `connected` there is correct, not an outage.
  it('never escalates when no socket is expected', () => {
    const { result } = renderHook(() =>
      useDraftConnectionStatus({ connected: false, enabled: false }),
    );

    advance(DRAFT_CONNECTION_LOST_DELAY_MS * 2);
    expect(result.current).toBe('online');
  });

  it('drops back to online if the socket stops being expected mid-outage', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useDraftConnectionStatus({ connected: false, enabled }),
      { initialProps: { enabled: true } },
    );

    advance(DRAFT_CONNECTION_LOST_DELAY_MS);
    expect(result.current).toBe('lost');

    rerender({ enabled: false });
    expect(result.current).toBe('online');
  });
});
