/**
 * Unit tests for BallDontLieProvider retry logic (LS-4409).
 *
 * Covers: isRetryableError, retryDelay, and getScoreboard retry behaviour
 * (the root cause of "Failed to fetch scoreboard data" with 120 Rollbar hits).
 */
import axios, { AxiosError } from 'axios';
import {
  BallDontLieProvider,
  isRetryableError,
  retryDelay,
} from './balldontlie';

// Spy on axios.get only — do NOT jest.mock('axios') as that auto-mocks
// isAxiosError to return undefined, which breaks all retry-logic assertions.
const mockedAxiosGet = jest.spyOn(axios, 'get');

// Make setTimeout instant so retry tests don't slow the suite.
beforeAll(() => {
  jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
    (fn as () => void)();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  });
});

afterAll(() => jest.restoreAllMocks());

// Reset axios.get mock between tests (clears calls AND implementation).
beforeEach(() => mockedAxiosGet.mockReset());

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeAxiosError(status?: number, retryAfter?: string): AxiosError {
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
  return err;
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

    const result = await makeProvider().getScoreboard('2024-07-05');

    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
    expect(result.games).toHaveLength(1);
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    mockedAxiosGet
      .mockRejectedValueOnce(makeAxiosError(429))
      .mockResolvedValueOnce(BDL_RESPONSE);

    const result = await makeProvider().getScoreboard('2024-07-06');

    expect(mockedAxiosGet).toHaveBeenCalledTimes(2);
    expect(result.games).toHaveLength(1);
  });

  it('retries on 503 and succeeds on second attempt', async () => {
    mockedAxiosGet
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockResolvedValueOnce(BDL_RESPONSE);

    const result = await makeProvider().getScoreboard('2024-07-09');

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
});
