/**
 * BALLDONTLIE MLB provider.
 *
 * Implements scoreboard data via the BallDontLie MLB API:
 *   https://mlb.balldontlie.io
 *   Base URL: https://api.balldontlie.io/mlb/v1
 *
 * Other methods remain NotImplementedError until the respective
 * endpoints are needed and fully validated.
 */
import axios from 'axios';
import { LOGGER } from '@legacy-sports/logging';
import type { MlbDataProvider } from '../provider';
import type {
  GameFeed,
  MlbGame,
  MlbGameStatus,
  MlbTeamScore,
  PlayerGameStats,
  PlayerInfo,
  PlayerSeasonStats,
  Schedule,
  ScheduleOptions,
  Scoreboard,
  Standings,
  Team,
} from '../types';

// ─── BallDontLie API response shapes ─────────────────────────────────────────

interface BdlTeamRef {
  id: number;
  abbreviation: string;
  display_name: string;
}

interface BdlTeamData {
  hits: number;
  runs: number;
  errors: number;
  inning_scores: number[] | null;
}

interface BdlGame {
  id: number;
  home_team: BdlTeamRef;
  away_team: BdlTeamRef;
  home_team_data: BdlTeamData | null;
  away_team_data: BdlTeamData | null;
  /** ISO 8601 scheduled start time */
  date: string | null;
  status: string;
  /** Current inning (period in BDL parlance) */
  period: number;
  venue: string | null;
}

interface BdlGamesResponse {
  data: BdlGame[];
}

// ─── BDL status → internal status mapping ────────────────────────────────────

function mapBdlStatus(bdlStatus: string): MlbGameStatus {
  if (bdlStatus === 'STATUS_FINAL') return 'Final';
  if (bdlStatus === 'STATUS_IN_PROGRESS') return 'Live';
  if (bdlStatus === 'STATUS_POSTPONED') return 'Postponed';
  if (bdlStatus === 'STATUS_SUSPENDED') return 'Suspended';
  return 'Preview';
}

function mapBdlTeam(team: BdlTeamRef, data: BdlTeamData | null): MlbTeamScore {
  return {
    teamId: team.id,
    teamName: team.display_name,
    abbreviation: team.abbreviation,
    runs: data?.runs ?? 0,
    hits: data?.hits ?? 0,
    errors: data?.errors ?? 0,
    linescoreInnings: data?.inning_scores ?? null,
  };
}

function mapBdlGame(game: BdlGame): MlbGame {
  const status = mapBdlStatus(game.status);
  const isLive = status === 'Live';
  return {
    gamePk: game.id,
    status,
    startTime: game.date ?? null,
    // BallDontLie does not expose inning half or outs at the game-list level
    inning: isLive ? game.period : null,
    inningHalf: null,
    outs: null,
    homeTeam: mapBdlTeam(game.home_team, game.home_team_data),
    awayTeam: mapBdlTeam(game.away_team, game.away_team_data),
    venue: game.venue ?? null,
  };
}

// ─── Scoreboard date bucketing ───────────────────────────────────────────────

// Scoreboard dates are MLB calendar (US Eastern) dates. BDL's dates[] filter
// matches on the UTC start date, so a 7:05 PM ET game on D is returned under
// D+1 (LS-10645). We request D and D+1 and keep games whose start time falls
// on D in this time zone.
const SCOREBOARD_TIME_ZONE = 'America/New_York';

const etDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCOREBOARD_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * YYYY-MM-DD of an ISO timestamp in US Eastern time, or null when the
 * timestamp is missing or unparseable. Exported for unit testing.
 */
export function toEasternDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return etDateFormatter.format(ms);
}

/** The calendar day after a YYYY-MM-DD date. Exported for unit testing. */
export function nextDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Retry helpers ────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

// BDL's /games endpoint can be slow on a cold Lambda's first request of the
// day; 15s leaves comfortable headroom under the GraphQL Lambda's 30s
// function timeout for a single attempt (LS-9171) while still being well
// short of a full retry cycle if it does time out.
const REQUEST_TIMEOUT_MS = 15_000;

// Total wall-clock budget for one fetchScoreboard() call, kept under the
// GraphQL Lambda's 30s timeout. A retry is only scheduled when its delay plus
// one more full request timeout still fits, so a 429 `Retry-After: 60` can
// never park the invocation past the Lambda deadline (LS-10404).
const RETRY_BUDGET_MS = 25_000;

// Hard ceiling on any single retry wait, regardless of remaining budget.
const MAX_RETRY_DELAY_MS = 5_000;

/**
 * Thrown (when no stale cache entry can be served) instead of waiting out a
 * retry delay that would not fit the invocation's time budget. `cause` is the
 * upstream error that triggered the retry.
 */
export class BallDontLieRetryBudgetError extends Error {
  constructor(
    readonly retryDelayMs: number,
    readonly cause: unknown,
  ) {
    super(
      `[balldontlie] retry delay of ${retryDelayMs}ms exceeds the request time budget; failing fast`,
    );
    this.name = 'BallDontLieRetryBudgetError';
  }
}

/**
 * Whether waiting `delayMs` and then making one more request still fits the
 * budget, given `elapsedMs` already spent. Exported for unit testing.
 */
export function retryFitsBudget(delayMs: number, elapsedMs: number): boolean {
  return (
    delayMs <= MAX_RETRY_DELAY_MS &&
    elapsedMs + delayMs + REQUEST_TIMEOUT_MS <= RETRY_BUDGET_MS
  );
}

/**
 * Returns true for errors that are worth retrying: rate limits (429), server
 * errors (5xx), and transient network-level failures (ECONNRESET, etc.).
 *
 * Timeout errors (ECONNABORTED) are excluded: an immediate retry after a
 * 15 s timeout will almost certainly also timeout, and multiple such
 * attempts chained back-to-back exceed the Lambda's 30 s limit, causing API
 * Gateway to return 502 to the client (LS-4856).
 * Exported for unit testing.
 */
export function isRetryableError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) {
    // Timeout (ECONNABORTED) — do not retry; fail fast so Lambda exits well
    // within its 30 s limit and stale cache can be served.
    if (err.code === 'ECONNABORTED') return false;
    return true; // other network errors: ECONNRESET, ECONNREFUSED, etc.
  }
  const { status } = err.response;
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Delay in ms before the next attempt. Respects the Retry-After header for
 * 429 responses; otherwise uses exponential backoff from RETRY_BASE_DELAY_MS.
 * Exported for unit testing.
 */
export function retryDelay(err: unknown, attempt: number): number {
  if (axios.isAxiosError(err) && err.response?.status === 429) {
    const raw = err.response.headers['retry-after'] as string | undefined;
    if (raw) {
      // RFC 7231: Retry-After is either delta-seconds or an HTTP-date.
      const deltaSeconds = Number(raw);
      if (!Number.isNaN(deltaSeconds) && deltaSeconds > 0) {
        return deltaSeconds * 1_000;
      }
      const httpDate = Date.parse(raw);
      if (!Number.isNaN(httpDate)) {
        const deltaMs = httpDate - Date.now();
        if (deltaMs > 0) return deltaMs;
      }
    }
  }
  return Math.pow(2, attempt) * RETRY_BASE_DELAY_MS; // 500ms, 1_000ms
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const LIVE_TTL_MS = 15_000;
const STATIC_TTL_MS = 5 * 60 * 1_000;

interface CacheEntry {
  data: unknown;
  expiry: number;
}

const BDL_MLB_BASE = 'https://api.balldontlie.io/mlb/v1';

export class BallDontLieProvider implements MlbDataProvider {
  private readonly cache = new Map<string, CacheEntry>();

  // Coalesces concurrent getScoreboard() calls for the same date into a
  // single upstream fetch. Without this, a burst of simultaneous GraphQL
  // requests (e.g. several browser tabs polling at once) each miss the
  // cache and fire their own axios.get, multiplying the load that trips
  // BallDontLie's rate limit (LS-9147).
  private readonly inflight = new Map<string, Promise<Scoreboard>>();

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('[balldontlie] MLB_DATA_API_KEY is required');
    }
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiry) return null;
    return entry.data as T;
  }

  /** Returns the cached value regardless of expiry — used as stale fallback. */
  private getStaleCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    return entry ? (entry.data as T) : null;
  }

  private setCached(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlMs });
  }

  async getScoreboard(date: string): Promise<Scoreboard> {
    const cacheKey = `scoreboard:${date}`;
    const cached = this.getCached<Scoreboard>(cacheKey);
    if (cached) {
      LOGGER.debug('[balldontlie] cache hit', { cacheKey });
      return cached;
    }

    const existing = this.inflight.get(cacheKey);
    if (existing) {
      LOGGER.debug('[balldontlie] joining in-flight request', { cacheKey });
      return existing;
    }

    const fetchPromise = this.fetchScoreboard(date, cacheKey).finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private async fetchScoreboard(
    date: string,
    cacheKey: string,
  ): Promise<Scoreboard> {
    LOGGER.debug('[balldontlie] fetching scoreboard', { date });

    let lastErr: unknown;
    const startedAt = Date.now();
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get<BdlGamesResponse>(
          `${BDL_MLB_BASE}/games`,
          {
            headers: { Authorization: this.apiKey },
            // BDL uses dates[] array filter; URLSearchParams encodes brackets correctly
            params: new URLSearchParams([
              ['dates[]', date],
              ['dates[]', nextDate(date)],
              ['per_page', '100'],
            ]),
            timeout: REQUEST_TIMEOUT_MS,
          },
        );

        const games = (response.data.data ?? [])
          .filter((g) => toEasternDate(g.date) === date)
          .map(mapBdlGame);
        const hasLiveGames = games.some((g) => g.status === 'Live');
        const ttl = hasLiveGames ? LIVE_TTL_MS : STATIC_TTL_MS;
        const scoreboard: Scoreboard = {
          date,
          lastUpdated: new Date().toISOString(),
          games,
        };
        this.setCached(cacheKey, scoreboard, ttl);
        return scoreboard;
      } catch (err) {
        lastErr = err;
        if (!isRetryableError(err) || attempt >= MAX_RETRIES) break;
        const delay = retryDelay(err, attempt);
        if (!retryFitsBudget(delay, Date.now() - startedAt)) {
          LOGGER.warn(
            '[balldontlie] retry delay exceeds budget; failing fast',
            {
              attempt,
              delayMs: delay,
              date,
            },
          );
          lastErr = new BallDontLieRetryBudgetError(delay, err);
          break;
        }
        LOGGER.warn('[balldontlie] transient error, retrying', {
          attempt,
          delayMs: delay,
          date,
          error: axios.isAxiosError(err) ? err.message : String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Serve stale cache for any error (timeout, network failure, rate limit).
    // A slightly stale scoreboard is far better than crashing the Lambda and
    // returning a 502 to the client (LS-4856).
    const stale = this.getStaleCached<Scoreboard>(cacheKey);
    if (stale) {
      LOGGER.warn('[balldontlie] request failed; serving stale cache', {
        date,
        cacheKey,
        error: axios.isAxiosError(lastErr) ? lastErr.message : String(lastErr),
      });
      return stale;
    }
    throw lastErr;
  }

  getGameFeed(_gamePk: number): Promise<GameFeed> {
    throw new NotImplementedError('getGameFeed');
  }

  getPlayerStats(
    _mlbPlayerId: number,
    _season: number,
    _group: 'hitting' | 'pitching' | 'fielding',
  ): Promise<PlayerSeasonStats> {
    throw new NotImplementedError('getPlayerStats');
  }

  getPlayerGameStats(
    _mlbPlayerId: number,
    _gamePk: number,
    _season?: number,
  ): Promise<PlayerGameStats | null> {
    throw new NotImplementedError('getPlayerGameStats');
  }

  getPlayerInfo(_mlbPlayerId: number): Promise<PlayerInfo> {
    throw new NotImplementedError('getPlayerInfo');
  }

  getSchedule(_date: string, _options?: ScheduleOptions): Promise<Schedule> {
    throw new NotImplementedError('getSchedule');
  }

  getStandings(_season: number): Promise<Standings> {
    throw new NotImplementedError('getStandings');
  }

  getTeams(): Promise<Team[]> {
    throw new NotImplementedError('getTeams');
  }
}

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(
      `[balldontlie] ${method} is not yet implemented. ` +
        'Acquire and configure the paid MLB data license to enable this provider.',
    );
    this.name = 'NotImplementedError';
  }
}
