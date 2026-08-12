/**
 * Unit tests for MlbStatsApiProvider (LS-3800, LS-2737, LS-2735).
 *
 * Covers:
 * - status normalisation so "In Progress" maps to "Live"
 *   (the root cause of the game ticker not reporting live data).
 * - getPlayerGameStats season passthrough (LS-2737).
 * - getPlayerGameStats returning null when the requested gamePk is absent
 *   from the player's game log (LS-2735).
 */

import axios from 'axios';
import type { AxiosError } from 'axios';
import {
  isRetryableError,
  mapMlbStatus,
  MlbStatsApiProvider,
} from './mlb-statsapi';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// The lint and build TS programs disagree on setTimeout's return type, so a
// direct assertion is stripped by eslint --fix under one yet required by the
// other. Route through `unknown` in a helper so the assertion survives --fix.
const asTimeoutHandle = (value: unknown): ReturnType<typeof setTimeout> =>
  value as ReturnType<typeof setTimeout>;

// Plain-object stand-ins for AxiosError — axios is fully jest.mock()'d in
// this file, so `new AxiosError(...)` would construct from the automocked
// (behavior-stripped) class. `axios.isAxiosError` is stubbed below to key
// off the `isAxiosError` marker instead of a real instanceof check.
function makeAxiosError(
  status?: number,
  retryAfter?: string,
  code?: string,
): AxiosError {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: status !== undefined ? `HTTP ${status}` : 'Network Error',
    code,
    response:
      status !== undefined
        ? {
            status,
            headers: retryAfter ? { 'retry-after': retryAfter } : {},
            data: {},
            statusText: '',
          }
        : undefined,
  } as unknown as AxiosError;
}

function makeTimeoutError(): AxiosError {
  return makeAxiosError(undefined, undefined, 'ECONNABORTED');
}

const SCHEDULE_RESPONSE = {
  data: {
    dates: [
      {
        date: '2024-07-04',
        games: [
          {
            gamePk: 1,
            gameDate: '2024-07-04T19:05:00Z',
            status: { detailedState: 'Final' },
            teams: {
              home: { team: { id: 147, name: 'Yankees', abbreviation: 'NYY' } },
              away: { team: { id: 111, name: 'Red Sox', abbreviation: 'BOS' } },
            },
            linescore: {
              teams: {
                home: { runs: 4, hits: 7, errors: 0, innings: [] },
                away: { runs: 2, hits: 5, errors: 1, innings: [] },
              },
            },
            venue: { name: 'Yankee Stadium' },
          },
        ],
      },
    ],
  },
};

describe('mapMlbStatus', () => {
  it('maps "In Progress" → "Live"', () => {
    expect(mapMlbStatus('In Progress')).toBe('Live');
  });

  it('maps "Manager Challenge" → "Live"', () => {
    expect(mapMlbStatus('Manager Challenge')).toBe('Live');
  });

  it('maps "Final" → "Final"', () => {
    expect(mapMlbStatus('Final')).toBe('Final');
  });

  it('maps "Game Over" → "Final"', () => {
    expect(mapMlbStatus('Game Over')).toBe('Final');
  });

  it('maps "Completed Early" → "Final"', () => {
    expect(mapMlbStatus('Completed Early')).toBe('Final');
  });

  it('maps "Postponed" → "Postponed"', () => {
    expect(mapMlbStatus('Postponed')).toBe('Postponed');
  });

  it('maps "Cancelled" → "Postponed"', () => {
    expect(mapMlbStatus('Cancelled')).toBe('Postponed');
  });

  it('maps "Suspended" → "Suspended"', () => {
    expect(mapMlbStatus('Suspended')).toBe('Suspended');
  });

  it.each(['Scheduled', 'Pre-Game', 'Warmup', 'Delayed', 'Delayed: Rain'])(
    'maps "%s" → "Preview"',
    (state) => {
      expect(mapMlbStatus(state)).toBe('Preview');
    },
  );

  it('maps undefined → "Preview"', () => {
    expect(mapMlbStatus(undefined)).toBe('Preview');
  });
});

describe('MlbStatsApiProvider.getPlayerGameStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as never;
    // Default to an empty splits response so each test can override only the
    // shape it cares about.
    mockedAxios.get.mockResolvedValue({
      data: {
        stats: [
          {
            group: { displayName: 'hitting' },
            splits: [{ game: { gamePk: 999 }, stat: {} }],
          },
        ],
      },
    });
  });

  // ── LS-2737: season parameter ───────────────────────────────────────────

  it('forwards the season param when provided so prior-season games are found', async () => {
    const provider = new MlbStatsApiProvider();
    await provider.getPlayerGameStats(12345, 999, 2024);

    const calls = mockedAxios.get.mock.calls;
    expect(calls).toHaveLength(1);
    const params = calls[0][1]?.params as Record<string, unknown>;
    expect(params).toMatchObject({
      stats: 'gameLog',
      sportId: 1,
      season: 2024,
    });
  });

  it('omits the season param when not provided (current-season default)', async () => {
    const provider = new MlbStatsApiProvider();
    await provider.getPlayerGameStats(12345, 999);

    const calls = mockedAxios.get.mock.calls;
    expect(calls).toHaveLength(1);
    const params = calls[0][1]?.params as Record<string, unknown>;
    expect(params).toEqual({ stats: 'gameLog', sportId: 1 });
    expect(params).not.toHaveProperty('season');
  });

  // ── LS-2735: null when gamePk not in splits ─────────────────────────────

  it('returns null when the requested gamePk is absent from the splits', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        stats: [
          {
            group: { displayName: 'hitting' },
            splits: [
              { game: { gamePk: 111 }, stat: { hits: 2, atBats: 4 } },
              { game: { gamePk: 222 }, stat: { hits: 0, atBats: 3 } },
            ],
          },
        ],
      },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerGameStats(545361, 999);

    expect(result).toBeNull();
  });

  it('returns null when splits is empty (player has no game log)', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { stats: [{ group: { displayName: 'hitting' }, splits: [] }] },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerGameStats(545361, 123);

    expect(result).toBeNull();
  });

  it('returns mapped stats when the gamePk is present', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        stats: [
          {
            group: { displayName: 'hitting' },
            splits: [
              {
                game: { gamePk: 123 },
                stat: { hits: 2, atBats: 4, homeRuns: 1, rbi: 3 },
              },
            ],
          },
        ],
      },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerGameStats(545361, 123);

    expect(result).toEqual({
      playerId: 545361,
      gamePk: 123,
      group: 'hitting',
      hits: 2,
      atBats: 4,
      homeRuns: 1,
      rbi: 3,
    });
  });
});

// ── LS-8597: getPlayerInfo (team affiliation + jersey number) ───────────────

describe('MlbStatsApiProvider.getPlayerInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError = jest.fn().mockReturnValue(false) as never;
  });

  it('maps currentTeam.abbreviation and primaryNumber', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        people: [
          {
            id: 592450,
            currentTeam: { id: 147, abbreviation: 'NYY' },
            primaryNumber: '99',
          },
        ],
      },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerInfo(592450);

    expect(result).toEqual({
      playerId: 592450,
      mlbTeamAbbreviation: 'NYY',
      jerseyNumber: 99,
    });
  });

  it('returns nulls when the person has no currentTeam or primaryNumber', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { people: [{ id: 592450 }] },
    });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerInfo(592450);

    expect(result).toEqual({
      playerId: 592450,
      mlbTeamAbbreviation: null,
      jerseyNumber: null,
    });
  });

  it('returns nulls when the people array is empty (unknown player)', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { people: [] } });

    const provider = new MlbStatsApiProvider();
    const result = await provider.getPlayerInfo(1);

    expect(result).toEqual({
      playerId: 1,
      mlbTeamAbbreviation: null,
      jerseyNumber: null,
    });
  });

  it('requests /v1/people/{id}', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { people: [] } });

    const provider = new MlbStatsApiProvider();
    await provider.getPlayerInfo(592450);

    const calls = mockedAxios.get.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toContain('/v1/people/592450');
  });
});

// ── isRetryableError ─────────────────────────────────────────────────────────

describe('isRetryableError', () => {
  beforeEach(() => {
    mockedAxios.isAxiosError = jest
      .fn()
      .mockImplementation(
        (err: unknown) =>
          typeof err === 'object' &&
          err !== null &&
          (err as { isAxiosError?: boolean }).isAxiosError === true,
      ) as never;
  });

  it('returns true for a network error (no response)', () => {
    expect(isRetryableError(makeAxiosError())).toBe(true);
  });

  it('returns false for a timeout error (ECONNABORTED)', () => {
    expect(isRetryableError(makeTimeoutError())).toBe(false);
  });

  it('returns true for status 429', () => {
    expect(isRetryableError(makeAxiosError(429))).toBe(true);
  });

  it.each([500, 502, 503, 504, 529])('returns true for status %d', (status) => {
    expect(isRetryableError(makeAxiosError(status))).toBe(true);
  });

  it('returns false for status 400', () => {
    expect(isRetryableError(makeAxiosError(400))).toBe(false);
  });

  it('returns false for non-axios errors', () => {
    expect(isRetryableError(new Error('generic'))).toBe(false);
    expect(isRetryableError('string error')).toBe(false);
  });
});

// ── MlbStatsApiProvider.getScoreboard retry + stale-cache (LS-9167) ─────────

describe('MlbStatsApiProvider.getScoreboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError = jest
      .fn()
      .mockImplementation(
        (err: unknown) =>
          typeof err === 'object' &&
          err !== null &&
          (err as { isAxiosError?: boolean }).isAxiosError === true,
      ) as never;
    jest.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return asTimeoutHandle(0);
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns scoreboard on successful first attempt', async () => {
    mockedAxios.get.mockResolvedValueOnce(SCHEDULE_RESPONSE);

    const provider = new MlbStatsApiProvider();
    const result = await provider.getScoreboard('2024-07-04');

    expect(result.games).toHaveLength(1);
    expect(mockedAxios.get.mock.calls).toHaveLength(1);
  });

  it('retries on a network error and succeeds on second attempt', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(makeAxiosError())
      .mockResolvedValueOnce(SCHEDULE_RESPONSE);

    const provider = new MlbStatsApiProvider();
    const result = await provider.getScoreboard('2024-07-05');

    expect(mockedAxios.get.mock.calls).toHaveLength(2);
    expect(result.games).toHaveLength(1);
  });

  it('retries on a 5xx error and succeeds on second attempt', async () => {
    mockedAxios.get
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockResolvedValueOnce(SCHEDULE_RESPONSE);

    const provider = new MlbStatsApiProvider();
    const result = await provider.getScoreboard('2024-07-06');

    expect(mockedAxios.get.mock.calls).toHaveLength(2);
    expect(result.games).toHaveLength(1);
  });

  it('does not retry on a non-retryable 400 error', async () => {
    mockedAxios.get.mockRejectedValueOnce(makeAxiosError(400));

    const provider = new MlbStatsApiProvider();
    await expect(provider.getScoreboard('2024-07-07')).rejects.toMatchObject({
      message: 'HTTP 400',
    });
    expect(mockedAxios.get.mock.calls).toHaveLength(1);
  });

  it('serves stale cache when retries are exhausted after a prior success', async () => {
    const provider = new MlbStatsApiProvider();

    // Populate the cache with a successful fetch.
    mockedAxios.get.mockResolvedValueOnce(SCHEDULE_RESPONSE);
    await provider.getScoreboard('2024-07-08');

    // Expire the cache entry manually so the next call misses on freshness
    // but the stale entry is still present for fallback.
    const cacheMap = (
      provider as unknown as {
        cache: Map<string, { data: unknown; timestamp: number; ttl: number }>;
      }
    ).cache;
    const entry = cacheMap.get(
      '/v1/schedule?' +
        JSON.stringify({
          sportId: 1,
          date: '2024-07-08',
          hydrate: 'linescore',
        }),
    );
    if (entry) entry.timestamp = Date.now() - entry.ttl - 1;

    // Upstream is down for every retry attempt.
    mockedAxios.get.mockRejectedValue(makeAxiosError(503));

    const result = await provider.getScoreboard('2024-07-08');

    expect(result.games).toHaveLength(1);
    // 1 initial populate + (1 + MAX_RETRIES) failed attempts
    expect(mockedAxios.get.mock.calls).toHaveLength(5);
  });

  it('throws when retries are exhausted and no stale cache is available', async () => {
    mockedAxios.get.mockRejectedValue(makeAxiosError(503));

    const provider = new MlbStatsApiProvider();
    await expect(provider.getScoreboard('2024-07-09')).rejects.toMatchObject({
      message: 'HTTP 503',
    });
    // 1 initial + MAX_RETRIES (3) retries = 4 total
    expect(mockedAxios.get.mock.calls).toHaveLength(4);
  });

  it('does not retry on timeout and throws immediately with no stale cache', async () => {
    mockedAxios.get.mockRejectedValue(makeTimeoutError());

    const provider = new MlbStatsApiProvider();
    await expect(provider.getScoreboard('2024-07-10')).rejects.toMatchObject({
      message: 'Network Error',
    });
    expect(mockedAxios.get.mock.calls).toHaveLength(1);
  });
});
