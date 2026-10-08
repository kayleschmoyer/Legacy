import { act, renderHook } from '@testing-library/react';
import {
  nextScoreboardRefetchDelayMs,
  SCOREBOARD_PREGAME_RECHECK_MS,
} from './partition';
import {
  SCOREBOARD_LIVE_POLL_MS,
  useScoreboardLivePolling,
  type UseScoreboardLivePollingOptions,
} from './useScoreboardLivePolling';
import { todayISO } from './dateUtils';
import type { ScoreboardGame } from '../../components/scoreboard/types';

const MINUTE = 60_000;

function makeGame(
  gamePk: number,
  status: ScoreboardGame['status'],
  startTime?: string,
): ScoreboardGame {
  const team = {
    teamName: 'T',
    abbreviation: 'T',
    runs: 0,
    hits: 0,
    errors: 0,
  };
  return { gamePk, status, startTime, homeTeam: team, awayTeam: team };
}

describe('SCOREBOARD_LIVE_POLL_MS', () => {
  it("matches the server's 15s live cache TTL (LS-10721)", () => {
    expect(SCOREBOARD_LIVE_POLL_MS).toBe(15_000);
  });
});

describe('nextScoreboardRefetchDelayMs (LS-10721)', () => {
  const now = new Date();
  const nowMs = now.getTime();
  const inMinutes = (minutes: number) =>
    new Date(nowMs + minutes * MINUTE).toISOString();

  it('waits until the earliest upcoming first pitch', () => {
    const games = [
      makeGame(1, 'Final', inMinutes(-180)),
      makeGame(2, 'Preview', inMinutes(14 * 60)),
      makeGame(3, 'Preview', inMinutes(30)),
    ];
    expect(nextScoreboardRefetchDelayMs(games, todayISO(), nowMs)).toBe(
      30 * MINUTE,
    );
  });

  it('rechecks on the pregame cadence once first pitch has passed', () => {
    const games = [makeGame(1, 'Preview', inMinutes(-1))];
    expect(nextScoreboardRefetchDelayMs(games, todayISO(), nowMs)).toBe(
      SCOREBOARD_PREGAME_RECHECK_MS,
    );
    expect(SCOREBOARD_PREGAME_RECHECK_MS).toBeLessThanOrEqual(5 * MINUTE);
  });

  it('schedules nothing for other dates, finished slates, or unknown start times', () => {
    expect(
      nextScoreboardRefetchDelayMs(
        [makeGame(1, 'Preview', inMinutes(30))],
        '2000-01-01',
        nowMs,
      ),
    ).toBeNull();
    expect(
      nextScoreboardRefetchDelayMs(
        [makeGame(1, 'Final'), makeGame(2, 'Postponed', inMinutes(30))],
        todayISO(),
        nowMs,
      ),
    ).toBeNull();
    expect(
      nextScoreboardRefetchDelayMs([makeGame(1, 'Preview')], todayISO(), nowMs),
    ).toBeNull();
  });
});

describe('useScoreboardLivePolling', () => {
  beforeEach(() => {
    // Pin a morning clock: the hook only schedules refetches while `date` is
    // still today, so a slate 14h out must not cross local midnight. With the
    // real clock this suite failed whenever it ran after ~10:00 (LS-10993).
    jest.useFakeTimers({ now: new Date(2026, 5, 15, 9, 0, 0) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup(overrides: Partial<UseScoreboardLivePollingOptions> = {}) {
    const options: UseScoreboardLivePollingOptions = {
      games: [],
      date: todayISO(),
      startPolling: jest.fn(),
      stopPolling: jest.fn(),
      refetch: jest.fn(),
      ...overrides,
    };
    const hook = renderHook(
      (props: UseScoreboardLivePollingOptions) =>
        useScoreboardLivePolling(props),
      { initialProps: options },
    );
    return { ...hook, options };
  }

  const inMinutes = (minutes: number) =>
    new Date(Date.now() + minutes * MINUTE).toISOString();

  it('polls every 15s while a game is live', () => {
    const { options, unmount } = setup({ games: [makeGame(1, 'Live')] });
    expect(options.startPolling).toHaveBeenCalledWith(15_000);
    unmount();
  });

  it('does not poll before first pitch, then refetches once at first pitch', () => {
    const { options, unmount } = setup({
      games: [
        makeGame(1, 'Final', inMinutes(-180)),
        makeGame(2, 'Preview', inMinutes(14 * 60)),
      ],
    });

    expect(options.startPolling).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(14 * 60 * MINUTE - 1);
    });
    expect(options.refetch).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(options.refetch).toHaveBeenCalledTimes(1);

    // Still Preview after first pitch: recheck within 5 minutes, not at 15s.
    act(() => {
      jest.advanceTimersByTime(SCOREBOARD_PREGAME_RECHECK_MS);
    });
    expect(options.refetch).toHaveBeenCalledTimes(2);
    expect(options.startPolling).not.toHaveBeenCalled();
    unmount();
  });

  it('starts live polling once the refetched slate has a live game', () => {
    const { options, rerender, unmount } = setup({
      games: [makeGame(1, 'Preview', inMinutes(5))],
    });
    rerender({ ...options, games: [makeGame(1, 'Live', inMinutes(-1))] });
    expect(options.startPolling).toHaveBeenCalledWith(SCOREBOARD_LIVE_POLL_MS);
    unmount();
  });

  it('lets only one instance poll a date, handing off when the owner unmounts', () => {
    const live = [makeGame(1, 'Live')];
    const ticker = setup({ games: live });
    const page = setup({ games: live });

    expect(ticker.options.startPolling).toHaveBeenCalledTimes(1);
    expect(page.options.startPolling).not.toHaveBeenCalled();

    ticker.unmount();
    expect(page.options.startPolling).toHaveBeenCalledWith(
      SCOREBOARD_LIVE_POLL_MS,
    );
    page.unmount();
  });

  it('does not claim the poller slot while disabled', () => {
    const live = [makeGame(1, 'Live')];
    const skipped = setup({ games: live, enabled: false });
    const page = setup({ games: live });

    expect(skipped.options.startPolling).not.toHaveBeenCalled();
    expect(page.options.startPolling).toHaveBeenCalledWith(
      SCOREBOARD_LIVE_POLL_MS,
    );
    skipped.unmount();
    page.unmount();
  });
});
