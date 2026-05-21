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

// ─── Retry helpers ────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Returns true for errors that are worth retrying: rate limits (429), server
 * errors (5xx), and network-level failures (no HTTP response at all).
 * Exported for unit testing.
 */
export function isRetryableError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true; // network error: ECONNRESET, timeout, etc.
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

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('[balldontlie] MLB_DATA_API_KEY is required');
    }
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
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

    LOGGER.debug('[balldontlie] fetching scoreboard', { date });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get<BdlGamesResponse>(
          `${BDL_MLB_BASE}/games`,
          {
            headers: { Authorization: this.apiKey },
            // BDL uses dates[] array filter; URLSearchParams encodes brackets correctly
            params: new URLSearchParams({ 'dates[]': date, per_page: '100' }),
            timeout: 10_000,
          },
        );

        const games = (response.data.data ?? []).map(mapBdlGame);
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
        if (!isRetryableError(err) || attempt >= MAX_RETRIES) {
          throw err;
        }
        const delay = retryDelay(err, attempt);
        LOGGER.warn('[balldontlie] transient error, retrying', {
          attempt,
          delayMs: delay,
          date,
          error: axios.isAxiosError(err) ? err.message : String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    // Unreachable: loop always returns or throws inside the catch.
    /* istanbul ignore next */
    throw new Error('[balldontlie] unexpected retry loop exit');
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
  ): Promise<PlayerGameStats> {
    throw new NotImplementedError('getPlayerGameStats');
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
