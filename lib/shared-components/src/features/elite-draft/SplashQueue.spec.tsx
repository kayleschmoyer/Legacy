/**
 * SplashQueue (LS-8942) — FIFO pick-reveal queue for the spectator screen.
 *
 * Timing contract under test (fake timers):
 *  - FIFO ordering with a guaranteed minimum hold per splash
 *  - catch-up compression when the backlog exceeds the threshold
 *  - flood trim: only the newest pending picks survive
 *  - no replay: a pick number splashes at most once; nothing shows unless
 *    explicitly enqueued (historical picks are never enqueued)
 *  - undo: removePick drops the pick from stage or backlog immediately
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { type SplashPick, SplashQueue, useSplashQueue } from './SplashQueue';
import { render } from '../../test-utils';

jest.mock('./styles', () => ({ CSS: '' }));

const EXIT_MS = 400;

function makePick(overallPick: number): SplashPick {
  return {
    player: {
      id: overallPick * 100,
      name: `Player ${overallPick}`,
      position: 'OF',
      avg: 0.3,
      hr: 20,
      rbi: 80,
      runs: 90,
      sb: 10,
      games: 150,
      hits: 160,
      obp: 0.38,
      slg: 0.5,
    },
    overallPick,
    round: Math.ceil(overallPick / 10),
    roundPickNumber: ((overallPick - 1) % 10) + 1,
    isAuto: false,
    teamName: `Team ${overallPick}`,
  };
}

describe('useSplashQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows nothing until a pick is enqueued (no historical replay)', () => {
    const { result } = renderHook(() => useSplashQueue());
    expect(result.current.active).toBeNull();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.active).toBeNull();
  });

  it('plays picks FIFO, holding each for the minimum duration', () => {
    const { result } = renderHook(() => useSplashQueue());

    act(() => {
      result.current.enqueue(makePick(1));
      result.current.enqueue(makePick(2));
    });
    expect(result.current.active?.overallPick).toBe(1);
    expect(result.current.pendingCount).toBe(1);

    // Just before the 8s hold elapses the first splash is still up.
    act(() => {
      jest.advanceTimersByTime(7_900);
    });
    expect(result.current.active?.overallPick).toBe(1);
    expect(result.current.leaving).toBe(false);

    // Hold elapses → exit animation → next pick enters.
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.leaving).toBe(true);
    act(() => {
      jest.advanceTimersByTime(EXIT_MS);
    });
    expect(result.current.active?.overallPick).toBe(2);
    expect(result.current.pendingCount).toBe(0);
  });

  it('does not restart the active hold when picks arrive mid-splash', () => {
    const { result } = renderHook(() => useSplashQueue());
    act(() => {
      result.current.enqueue(makePick(1));
    });
    act(() => {
      jest.advanceTimersByTime(6_000);
    });
    act(() => {
      result.current.enqueue(makePick(2));
    });
    // Pick 1's 8s hold started at t=0 — it exits at 8s, not 6s + 8s.
    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(result.current.leaving).toBe(true);
  });

  it('compresses hold duration when the queue is catching up (> 3 queued)', () => {
    const { result } = renderHook(() => useSplashQueue());
    act(() => {
      for (let i = 1; i <= 5; i++) result.current.enqueue(makePick(i));
    });
    // 5 queued (1 active + 4 pending) > 3 → ~4s holds.
    expect(result.current.active?.overallPick).toBe(1);
    act(() => {
      jest.advanceTimersByTime(3_900);
    });
    expect(result.current.leaving).toBe(false);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.leaving).toBe(true);
    act(() => {
      jest.advanceTimersByTime(EXIT_MS);
    });
    expect(result.current.active?.overallPick).toBe(2);
  });

  it('keeps only the newest 3 pending picks in a flood (> 8 queued)', () => {
    const { result } = renderHook(() => useSplashQueue());
    act(() => {
      for (let i = 1; i <= 10; i++) result.current.enqueue(makePick(i));
    });
    // The backlog was trimmed to the newest picks; early ones never splash.
    const splashed: number[] = [];
    for (let guard = 0; guard < 12 && result.current.active; guard++) {
      splashed.push(result.current.active.overallPick);
      act(() => {
        jest.advanceTimersByTime(8_000 + EXIT_MS);
      });
    }
    expect(splashed).not.toContain(1);
    expect(splashed).not.toContain(6);
    expect(splashed[splashed.length - 1]).toBe(10);
    expect(splashed.length).toBeLessThanOrEqual(4);
  });

  it('never splashes the same pick twice', () => {
    const { result } = renderHook(() => useSplashQueue());
    act(() => {
      result.current.enqueue(makePick(1));
      result.current.enqueue(makePick(1));
    });
    expect(result.current.active?.overallPick).toBe(1);
    expect(result.current.pendingCount).toBe(0);
    act(() => {
      jest.advanceTimersByTime(8_000 + EXIT_MS);
    });
    expect(result.current.active).toBeNull();
    act(() => {
      result.current.enqueue(makePick(1));
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current.active).toBeNull();
  });

  it('removePick drops an undone pick from stage and backlog immediately', () => {
    const { result } = renderHook(() => useSplashQueue());
    act(() => {
      result.current.enqueue(makePick(1));
      result.current.enqueue(makePick(2));
      result.current.enqueue(makePick(3));
    });
    expect(result.current.active?.overallPick).toBe(1);

    // Undo a pending pick — it never shows.
    act(() => {
      result.current.removePick(2);
    });
    expect(result.current.pendingCount).toBe(1);

    // Undo the on-screen pick — it vanishes without an exit animation and
    // the next pick enters.
    act(() => {
      result.current.removePick(1);
    });
    expect(result.current.active?.overallPick).toBe(3);
  });

  it('dismiss skips ahead to the next queued pick', () => {
    const { result } = renderHook(() => useSplashQueue());
    act(() => {
      result.current.enqueue(makePick(1));
      result.current.enqueue(makePick(2));
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.leaving).toBe(true);
    act(() => {
      jest.advanceTimersByTime(EXIT_MS);
    });
    expect(result.current.active?.overallPick).toBe(2);
  });
});

describe('SplashQueue component', () => {
  const basePick = makePick(7);

  it('renders nothing when no splash is active', () => {
    const { container } = render(
      <SplashQueue
        active={null}
        leaving={false}
        pendingCount={0}
        onDismiss={jest.fn()}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the pick announcement with headshot and queue badge', () => {
    const { getByText, getByTestId, getByAltText } = render(
      <SplashQueue
        active={basePick}
        leaving={false}
        pendingCount={2}
        onDismiss={jest.fn()}
        mlbPlayerIdFor={() => 592450}
      />,
    );
    expect(getByText('Player 7')).toBeTruthy();
    expect(getByText('Team 7')).toBeTruthy();
    expect(getByTestId('splash-queue-badge').textContent).toBe('+2 more picks');
    const img = getByAltText('Player 7') as HTMLImageElement;
    expect(img.src).toContain('img.mlbstatic.com');
    expect(img.src).toContain('592450');
  });

  it('falls back to the silhouette when no MLB id is known', () => {
    const { queryByAltText, getByText } = render(
      <SplashQueue
        active={basePick}
        leaving={false}
        pendingCount={0}
        onDismiss={jest.fn()}
        mlbPlayerIdFor={() => null}
      />,
    );
    expect(queryByAltText('Player 7')).toBeNull();
    expect(getByText('Player 7')).toBeTruthy();
  });
});
