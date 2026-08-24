import { act, renderHook } from '@testing-library/react';
import { useLineupLockCountdown } from './useLineupLockCountdown';

describe('useLineupLockCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-24T10:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null nextLockAt/secondsRemaining when there is no lockTime', () => {
    const { result } = renderHook(() =>
      useLineupLockCountdown({ status: 'scheduled', lockTime: null }),
    );
    expect(result.current.nextLockAt).toBeNull();
    expect(result.current.secondsRemaining).toBeNull();
  });

  it('returns null when matchup is undefined', () => {
    const { result } = renderHook(() => useLineupLockCountdown(undefined));
    expect(result.current.nextLockAt).toBeNull();
    expect(result.current.secondsRemaining).toBeNull();
  });

  it('computes secondsRemaining from lockTime and ticks down every second', () => {
    // 2h 14m from "now" (system time set above).
    const lockTime = new Date('2026-08-24T12:14:00.000Z').toISOString();
    const { result } = renderHook(() =>
      useLineupLockCountdown({ status: 'scheduled', lockTime }),
    );

    expect(result.current.nextLockAt).toEqual(new Date(lockTime));
    expect(result.current.secondsRemaining).toBe(2 * 60 * 60 + 14 * 60);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.secondsRemaining).toBe(2 * 60 * 60 + 13 * 60);
  });

  it('is timezone-agnostic: the same instant yields the same countdown regardless of how it is expressed', () => {
    // 1pm ET kickoff expressed in UTC vs. an explicit -04:00 offset are the
    // same instant — the hook must not care which representation it's given
    // (LS-6368: the underlying bug was never a timezone-math error, it was
    // that nothing displayed this value at all).
    const utcLockTime = '2026-08-24T17:00:00.000Z';
    const offsetLockTime = '2026-08-24T13:00:00.000-04:00';

    const utcResult = renderHook(() =>
      useLineupLockCountdown({ status: 'scheduled', lockTime: utcLockTime }),
    ).result;
    const offsetResult = renderHook(() =>
      useLineupLockCountdown({
        status: 'scheduled',
        lockTime: offsetLockTime,
      }),
    ).result;

    expect(utcResult.current.secondsRemaining).toBe(
      offsetResult.current.secondsRemaining,
    );
    expect(utcResult.current.nextLockAt).toEqual(
      offsetResult.current.nextLockAt,
    );
  });

  it('floors at 0 once the lock time has passed', () => {
    const lockTime = new Date('2026-08-24T09:00:00.000Z').toISOString();
    const { result } = renderHook(() =>
      useLineupLockCountdown({ status: 'scheduled', lockTime }),
    );
    expect(result.current.secondsRemaining).toBe(0);
  });

  it('returns null nextLockAt/secondsRemaining for a malformed lockTime instead of NaN', () => {
    const { result } = renderHook(() =>
      useLineupLockCountdown({
        status: 'scheduled',
        lockTime: 'not-a-real-timestamp',
      }),
    );
    expect(result.current.nextLockAt).toBeNull();
    expect(result.current.secondsRemaining).toBeNull();
  });
});
