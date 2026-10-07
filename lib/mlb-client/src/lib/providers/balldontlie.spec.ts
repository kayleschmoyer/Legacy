/**
 * Unit tests for BallDontLieProvider retry logic (LS-4409).
 *
 * Covers: isRetryableError, retryDelay, and getScoreboard retry behaviour
 * (the root cause of "Failed to fetch scoreboard data" with 120 Rollbar hits).
 */
import axios, { AxiosError } from 'axios';
import {
  BallDontLieProvider,
  BallDontLieRetryBudgetError,
  isRetryableError,
  nextDate,
  retryDelay,
  retryFitsBudget,
  toEasternDate,
} from './balldontlie';

// Spy on axios.get only — do NOT jest.mock('axios') as that auto-mocks
// isAxiosError to return undefined, which breaks all retry-logic assertions.
const mockedAxiosGet = jest.spyOn(axios, 'get');

// The lint and build TS programs disagree on setTimeout's return type, so a
// direct assertion is stripped by eslint --fix under one yet required by the
// other. Route through `unknown` in a helper so the assertion survives --fix.
const asTimeoutHandle = (value: unknown): ReturnType<typeof setTimeout> =>
  value as ReturnType<typeof setTimeout>;

// Make setTimeout instant so retry tests don't slow the suite.
beforeAll(() => {
  jest.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
    fn();
    return asTimeoutHandle(0);
  });
});

afterAll(() => jest.restoreAllMocks());

// Reset axios.get mock between tests (clears calls AND implementation).
beforeEach(() => mockedAxiosGet.mockReset());

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeAxiosError(
  status?: number,
  retryAfter?: string,
  code?: string,
): AxiosError {
  const err = new AxiosError(
    status !== undefined ? `HTTP ${status}` : 'Network Error',
  );
  if (status !== undefined) {
    Object.assign(err, {
      response: {
        status,
        headers: retryAfter ? { 'retry-after': retryAfter } : {},
        data: {},
        statusText: '',
        config: err.config,
      },
    });
  }
  if (code !== undefined) {
    Object.assign(err, { code });
  }
  return err;
}

function makeTimeoutError(): AxiosError {
  return makeAxiosError(undefined, undefined, 'ECONNABORTED');
}

const BDL_RESPONSE = {
  data: {
    data: [
      {
        id: 1,
        home_team: {
          id: 10,
          abbreviation: 'NYY',
          display_name: 'New York Yankees',
        },
        away_team: {
          id: 11,
          abbreviation: 'BOS',
          display_name: 'Boston Red Sox',
        },
        home_team_data: {
          hits: 7,
          runs: 4,
          errors: 0,
          inning_scores: [1, 0, 3],
        },
        away_team_data: {
          hits: 5,
          runs: 2,
          errors: 1,
          inning_scores: [0, 2, 0],
        },
        date: '2024-07-04T19:05:00Z',
        status: 'STATUS_FINAL',
        period: 9,
        venue: 'Yankee Stadium',
      },
    ],
  },
};

// ─── isRetryableError ─────────────────────────────────────────────────────────

describe('isRetryableError', () => {
  it('returns true for a network error (no response)', () => {
    expect(isRetryableError(makeAxiosError())).toBe(true);
  });

  it('returns false for a timeout error (ECONNABORTED)', () => {
    // Retrying immediately after a 15 s timeout will also timeout; multiple
    // attempts back-to-back exceed Lambda's 30 s limit → 502 (LS-4856).
    expect(isRetryableError(makeTimeoutError())).toBe(false);
  });

  it('returns true for status 429', () => {
    expect(isRetryableError(makeAxiosError(429))).toBe(true);
  });

  it.each([500, 502, 503, 504])('returns true for status %d', (status) => {
    expect(isRetryableError(makeAxiosError(status))).toBe(true);
  });

  it('returns false for status 400', () => {
    expect(isRetryableError(makeAxiosError(400))).toBe(false);
  });

  it('returns false for status 401', () => {
    expect(isRetryableError(makeAxiosError(401))).toBe(false);
  });

  it('returns false for non-axios errors', () => {
    expect(isRetryableError(new Error('generic'))).toBe(false);
    expect(isRetryableError('string error')).toBe(false);
  });
});

// ─── retryDelay ───────────────────────────────────────────────────────────────

describe('retryDelay', () => {
  it('uses exponential backoff for network errors', () => {
    const err = makeAxiosError();
    expect(retryDelay(err, 0)).toBe(500);
    expect(retryDelay(err, 1)).toBe(1_000);
  });

  it('uses Retry-After header (seconds) for 429', () => {
    const err = makeAxiosError(429, '3');
    expect(retryDelay(err, 0)).toBe(3_000);
  });

  it('falls back to exponential backoff when Retry-After is absent on 429', () => {
    const err = makeAxiosError(429);
    expect(retryDelay(err, 0)).toBe(500);
    expect(retryDelay(err, 1)).toBe(1_000);
  });

  it('handles HTTP-date Retry-After on 429', () => {
    // Use a date 5 seconds in the future. toUTCString() has second-level
    // precision so allow a ±1.5s window around the nominal 5 000ms delta.
    const future = new Date(Date.now() + 5_000).toUTCString();
    const err = makeAxiosError(429, future);
    const delay = retryDelay(err, 0);
    expect(delay).toBeGreaterThan(3_000); // well above the 500ms backoff fallback
    expect(delay).toBeLessThanOrEqual(6_500);
  });

  it('uses exponential backoff for 5xx errors', () => {
    const err = makeAxiosError(503);
    expect(retryDelay(err, 0)).toBe(500);
    expect(retryDelay(err, 1)).toBe(1_000);
  });
});

// ─── BallDontLieProvider.getPlayerInfo ───────────────────────────────────────

describe('BallDontLieProvider.getPlayerInfo', () => {
  it('throws NotImplementedError (LS-8597 — not yet implemented for this provider)', () => {
    const provider = new BallDontLieProvider('test-api-key');
    expect(() => provider.getPlayerInfo(660271)).toThrow(
      'getPlayerInfo is not yet implemented',
    );
  });
});

// ─── BallDontLieProvider.getScoreboard ───────────────────────────────────────

describe('BallDontLieProvider.getScoreboard', () => {
  function makeProvider() {
    return new BallDontLieProvider('test-api-key');
  }

  it('returns scoreboard on successful first attempt', async () => {
    mockedAxiosGet.mockResolvedValueOnce(BDL_RESPONSE);
    const result = await makeProvider().getScoreboard('2024-07-04');

    expect(result.date).toBe('2024-07-04');
    expect(result.games).toHaveLength(1);
    expect(result.games[0].status).toBe('Final');
    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
  });

  it('retries on a network error and succeeds on second attempt', async () => {
    mockedAxiosGet
      .mockRejectedValueOnce(makeAxiosError())
      .mockResolvedValueOnce(BDL_RESPONSE);

    const result = await makeProvider().getScoreboard('2024-07-04');

    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
    expect(result.games).toHaveLength(1);
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    mockedAxiosGet
      .mockRejectedValueOnce(makeAxiosError(429))
      .mockResolvedValueOnce(BDL_RESPONSE);

    const result = await makeProvider().getScoreboard('2024-07-04');

    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
    expect(result.games).toHaveLength(1);
  });

  it('retries on 503 and succeeds on second attempt', async () => {
    mockedAxiosGet
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockResolvedValueOnce(BDL_RESPONSE);

    const result = await makeProvider().getScoreboard('2024-07-04');

    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
    expect(result.games).toHaveLength(1);
  });

  it('exhausts all retries (3 total attempts) and throws', async () => {
    const networkErr = makeAxiosError();
    mockedAxiosGet.mockRejectedValue(networkErr);

    await expect(makeProvider().getScoreboard('2024-07-07')).rejects.toThrow(
      'Network Error',
    );
    // 1 initial + 2 retries = 3 total
    expect(mockedAxiosGet).toHaveBeenCalledTimes(3);
  });

  it('does not retry on a non-retryable 400 error', async () => {
    mockedAxiosGet.mockRejectedValueOnce(makeAxiosError(400));

    await expect(makeProvider().getScoreboard('2024-07-08')).rejects.toThrow(
      'HTTP 400',
    );
    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
  });

  it('returns cached result without calling the API again', async () => {
    const provider = makeProvider();
    mockedAxiosGet.mockResolvedValue(BDL_RESPONSE);

    await provider.getScoreboard('2024-07-10');
    await provider.getScoreboard('2024-07-10');

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent requests for the same date into a single fetch', async () => {
    const provider = makeProvider();
    let resolveResponse: (value: typeof BDL_RESPONSE) => void = () => {
      throw new Error('resolveResponse called before axios.get');
    };
    mockedAxiosGet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveResponse = resolve;
      }),
    );

    const [first, second] = [
      provider.getScoreboard('2024-07-15'),
      provider.getScoreboard('2024-07-15'),
    ];
    resolveResponse(BDL_RESPONSE);
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
  });

  it('coalesces concurrent requests that fail with a shared rejection', async () => {
    const provider = makeProvider();
    mockedAxiosGet.mockRejectedValue(makeAxiosError(429));

    const [first, second] = [
      provider.getScoreboard('2024-07-16'),
      provider.getScoreboard('2024-07-16'),
    ];

    await expect(first).rejects.toThrow('HTTP 429');
    await expect(second).rejects.toThrow('HTTP 429');
    // 1 initial + MAX_RETRIES retries, shared across both callers
    expect(mockedAxiosGet).toHaveBeenCalledTimes(3);
  });

  it('returns stale cache when all retries fail with 429', async () => {
    const provider = makeProvider();

    // Populate cache with a successful fetch.
    mockedAxiosGet.mockResolvedValueOnce(BDL_RESPONSE);
    await provider.getScoreboard('2024-07-04');

    // Expire the cache entry manually.
    const cacheMap = (
      provider as unknown as {
        cache: Map<string, { data: unknown; expiry: number }>;
      }
    ).cache;
    const entry = cacheMap.get('scoreboard:2024-07-04');
    if (entry) entry.expiry = Date.now() - 1;

    // API rate-limits all subsequent attempts.
    mockedAxiosGet.mockRejectedValue(makeAxiosError(429));

    const result = await provider.getScoreboard('2024-07-04');

    expect(result.date).toBe('2024-07-04');
    expect(result.games).toHaveLength(1);
    // 1 initial populate + 3 rate-limited attempts (1 + MAX_RETRIES)
    expect(mockedAxiosGet).toHaveBeenCalledTimes(4);
  });

  it('throws 429 when rate-limited and no stale cache is available', async () => {
    const provider = makeProvider();
    mockedAxiosGet.mockRejectedValue(makeAxiosError(429));

    await expect(provider.getScoreboard('2024-07-12')).rejects.toThrow(
      'HTTP 429',
    );
    expect(mockedAxiosGet).toHaveBeenCalledTimes(3);
  });

  it('does not retry on timeout and serves stale cache when available', async () => {
    const provider = makeProvider();

    // Populate stale cache.
    mockedAxiosGet.mockResolvedValueOnce(BDL_RESPONSE);
    await provider.getScoreboard('2024-07-04');
    const cacheMap = (
      provider as unknown as {
        cache: Map<string, { data: unknown; expiry: number }>;
      }
    ).cache;
    const entry = cacheMap.get('scoreboard:2024-07-04');
    if (entry) entry.expiry = Date.now() - 1;

    // API times out (ECONNABORTED — not retried).
    mockedAxiosGet.mockRejectedValue(makeTimeoutError());

    const result = await provider.getScoreboard('2024-07-04');

    expect(result.date).toBe('2024-07-04');
    expect(result.games).toHaveLength(1);
    // 1 initial populate + 1 timeout attempt (no retries)
    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
  });

  describe('retry time budget (LS-10404)', () => {
    const waits = (): number[] =>
      jest
        .mocked(setTimeout)
        .mock.calls.map((call) => Number(call[1]))
        .filter((ms) => ms >= 500);

    beforeEach(() => jest.mocked(setTimeout).mockClear());

    it('fails fast with a typed error on a 429 with a 60s Retry-After and never waits', async () => {
      mockedAxiosGet.mockRejectedValue(makeAxiosError(429, '60'));

      const failure = makeProvider().getScoreboard('2024-07-20');
      await expect(failure).rejects.toBeInstanceOf(BallDontLieRetryBudgetError);
      await expect(failure).rejects.toMatchObject({ retryDelayMs: 60_000 });
      expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
      expect(waits()).toEqual([]);
    });

    it('serves stale cache instead of waiting out a 60s Retry-After', async () => {
      const provider = makeProvider();
      mockedAxiosGet.mockResolvedValueOnce(BDL_RESPONSE);
      await provider.getScoreboard('2024-07-04');
      const cacheMap = (
        provider as unknown as {
          cache: Map<string, { data: unknown; expiry: number }>;
        }
      ).cache;
      const entry = cacheMap.get('scoreboard:2024-07-04');
      if (entry) entry.expiry = Date.now() - 1;
      jest.mocked(setTimeout).mockClear();

      mockedAxiosGet.mockRejectedValue(makeAxiosError(429, '60'));
      const result = await provider.getScoreboard('2024-07-04');

      expect(result.games).toHaveLength(1);
      expect(waits()).toEqual([]);
    });

    it('still honours a short Retry-After that fits the budget', async () => {
      mockedAxiosGet
        .mockRejectedValueOnce(makeAxiosError(429, '2'))
        .mockResolvedValueOnce(BDL_RESPONSE);

      await makeProvider().getScoreboard('2024-07-22');

      expect(waits()).toEqual([2_000]);
      expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
    });

    it('skips a retry whose delay would overrun the budget after a slow attempt', async () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValueOnce(0).mockReturnValue(10_000);
      mockedAxiosGet.mockRejectedValue(makeAxiosError(503));

      await expect(makeProvider().getScoreboard('2024-07-23')).rejects.toThrow(
        BallDontLieRetryBudgetError,
      );
      now.mockRestore();
      expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryFitsBudget', () => {
    it('accepts a short delay early in the budget', () => {
      expect(retryFitsBudget(1_000, 200)).toBe(true);
    });

    it('rejects a delay above the hard ceiling', () => {
      expect(retryFitsBudget(60_000, 0)).toBe(false);
    });

    it('rejects when remaining budget cannot fit delay plus one more request', () => {
      expect(retryFitsBudget(1_000, 9_500)).toBe(false);
    });
  });

  it('throws on timeout when no stale cache is available', async () => {
    const provider = makeProvider();
    mockedAxiosGet.mockRejectedValue(makeTimeoutError());

    await expect(provider.getScoreboard('2024-07-14')).rejects.toThrow(
      'Network Error',
    );
    // No retries for timeout
    expect(mockedAxiosGet).toHaveBeenCalledTimes(1);
  });
});

// ─── ET date bucketing (LS-10645) ────────────────────────────────────────────

describe('scoreboard ET date bucketing (LS-10645)', () => {
  function bdlGame(id: number, date: string | null) {
    return { ...BDL_RESPONSE.data.data[0], id, date };
  }

  // Real BDL timestamps for the 2024 World Series: BDL files each night game
  // under the next UTC day.
  const WS_RESPONSE = {
    data: {
      data: [
        bdlGame(58590, '2024-10-30T00:08:00.000Z'), // G4, 8:08 PM ET 10/29
        bdlGame(58595, '2024-10-31T00:08:00.000Z'), // G5, 8:08 PM ET 10/30
        bdlGame(99001, '2024-10-30T17:05:00.000Z'), // 1:05 PM ET 10/30 day game
      ],
    },
  };

  it('toEasternDate converts a UTC start time to its US Eastern date', () => {
    expect(toEasternDate('2024-10-30T00:08:00.000Z')).toBe('2024-10-29');
    expect(toEasternDate('2024-10-30T17:05:00.000Z')).toBe('2024-10-30');
    expect(toEasternDate('2024-01-15T04:59:00Z')).toBe('2024-01-14');
    expect(toEasternDate('2024-01-15T05:00:00Z')).toBe('2024-01-15');
    expect(toEasternDate(null)).toBeNull();
    expect(toEasternDate('not-a-date')).toBeNull();
  });

  it('nextDate rolls over month and year boundaries', () => {
    expect(nextDate('2024-10-30')).toBe('2024-10-31');
    expect(nextDate('2024-10-31')).toBe('2024-11-01');
    expect(nextDate('2024-12-31')).toBe('2025-01-01');
  });

  it('requests the given date and the next UTC date', async () => {
    mockedAxiosGet.mockResolvedValueOnce(WS_RESPONSE);
    await new BallDontLieProvider('test-api-key').getScoreboard('2024-10-30');

    const params = mockedAxiosGet.mock.calls[0][1]?.params as URLSearchParams;
    expect(params.getAll('dates[]')).toEqual(['2024-10-30', '2024-10-31']);
  });

  it("shows WS Game 5 (not Game 4) on 2024-10-30, plus that day's day game", async () => {
    mockedAxiosGet.mockResolvedValueOnce(WS_RESPONSE);
    const result = await new BallDontLieProvider('test-api-key').getScoreboard(
      '2024-10-30',
    );

    expect(result.games.map((g) => g.gamePk)).toEqual([58595, 99001]);
  });

  it('shows WS Game 4 on 2024-10-29', async () => {
    mockedAxiosGet.mockResolvedValueOnce(WS_RESPONSE);
    const result = await new BallDontLieProvider('test-api-key').getScoreboard(
      '2024-10-29',
    );

    expect(result.games.map((g) => g.gamePk)).toEqual([58590]);
  });

  it('drops games with no start time, since they cannot be placed on a date', async () => {
    mockedAxiosGet.mockResolvedValueOnce({
      data: { data: [bdlGame(1, null)] },
    });
    const result = await new BallDontLieProvider('test-api-key').getScoreboard(
      '2024-10-30',
    );

    expect(result.games).toHaveLength(0);
  });
});
