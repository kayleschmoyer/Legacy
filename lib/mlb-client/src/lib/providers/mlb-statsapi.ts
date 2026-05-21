/**
 * MLB Stats API provider — free, no auth required.
 *
 * IMPORTANT: statsapi.mlb.com is NOT licensed for commercial/production use.
 * This provider is dev/staging only. The factory enforces this at runtime.
 *
 * Rate limiting: max 1 request/second (be a good citizen).
 * Caching: 15s TTL for live/scoreboard data, 5min for other static data.
 */
import axios from 'axios';
import { LOGGER } from '@legacy-sports/logging';
import type {
  MlbApiGameFeedResponse,
  MlbApiLinescoreTeam,
  MlbApiPlayerStatsResponse,
  MlbApiScheduleGame,
  MlbApiScheduleResponse,
  MlbApiStandingsResponse,
  MlbApiStatLine,
  MlbApiTeamRef,
  MlbApiTeamsResponse,
} from './mlb-statsapi.api-types';
import type { MlbDataProvider } from '../provider';
import type {
  GameFeed,
  MlbGame,
  MlbGameStatus,
  MlbTeamScore,
  PlayerGameStats,
  PlayerSeasonStats,
  Schedule,
  ScheduleGame,
  ScheduleOptions,
  Scoreboard,
  Standings,
  Team,
} from '../types';

/**
 * Normalizes an MLB Stats API `detailedState` string to the internal
 * `MlbGameStatus` union type used across all providers.
 *
 * Exported so it can be unit-tested directly without reaching into class
 * internals.
 */
export function mapMlbStatus(detailedState: string | undefined): MlbGameStatus {
  const s = detailedState ?? '';
  if (s === 'In Progress' || s === 'Manager Challenge') return 'Live';
  if (s === 'Final' || s === 'Game Over' || s === 'Completed Early')
    return 'Final';
  if (s === 'Postponed' || s === 'Cancelled') return 'Postponed';
  if (s === 'Suspended') return 'Suspended';
  return 'Preview';
}

const BASE_URL = 'https://statsapi.mlb.com/api';
const LIVE_TTL_MS = 15_000; // 15 seconds for live games
const STATIC_TTL_MS = 5 * 60 * 1000; // 5 minutes for static/completed data
const MIN_REQUEST_INTERVAL_MS = 1_000; // 1 req/sec rate limit
const MAX_RETRIES = 3;
const MAX_CACHE_SIZE = 500; // evict oldest entries when exceeded

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

export class MlbStatsApiProvider implements MlbDataProvider {
  private readonly cache = new Map<string, CacheEntry>();
  /** Serializes all HTTP requests to enforce 1 req/sec rate limit safely. */
  private requestQueue: Promise<unknown> = Promise.resolve();

  // ── Cache helpers ─────────────────────────────────────────────────────────

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached(key: string, data: unknown, ttl: number): void {
    // Evict the oldest entry if the cache is at capacity
    if (!this.cache.has(key) && this.cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  // ── Rate-limited HTTP ────────────────────────────────────────────────────

  private async get<T>(
    path: string,
    params?: Record<string, string | number>,
    ttl = LIVE_TTL_MS,
  ): Promise<T> {
    const cacheKey = `${path}?${JSON.stringify(params ?? {})}`;
    const cached = this.getCached<T>(cacheKey);
    if (cached !== null) {
      LOGGER.debug('[mlb-statsapi] cache hit', { path });
      return cached;
    }

    // Serialize all requests through a shared queue to enforce 1 req/sec safely
    // under concurrent callers. Each enqueued task waits for the previous to
    // finish (including its delay) before executing.
    const result = this.requestQueue.then(async () => {
      // Re-check cache in case a concurrent request already populated it
      const cachedNow = this.getCached<T>(cacheKey);
      if (cachedNow !== null) {
        LOGGER.debug('[mlb-statsapi] cache hit (queue)', { path });
        return cachedNow;
      }

      let attempt = 0;
      while (attempt <= MAX_RETRIES) {
        try {
          // Enforce minimum interval between requests
          const elapsed = Date.now() - this._lastRequestAt;
          if (elapsed < MIN_REQUEST_INTERVAL_MS) {
            const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
            LOGGER.debug('[mlb-statsapi] rate limiting', {
              waitMs: wait,
              path,
            });
            await new Promise((resolve) => setTimeout(resolve, wait));
          }

          this._lastRequestAt = Date.now();
          const response = await axios.get<T>(`${BASE_URL}${path}`, {
            params,
            timeout: 10_000,
          });
          this.setCached(cacheKey, response.data, ttl);
          return response.data;
        } catch (err) {
          const status = axios.isAxiosError(err) ? err.response?.status : null;
          if ((status === 429 || status === 529) && attempt < MAX_RETRIES) {
            const retryAfter = axios.isAxiosError(err)
              ? Number(err.response?.headers['retry-after'] ?? 0)
              : 0;
            const delay =
              retryAfter > 0
                ? retryAfter * 1000
                : Math.pow(2, attempt + 1) * 5_000; // 10s, 20s, 40s
            LOGGER.warn('[mlb-statsapi] rate limited, retrying', {
              attempt,
              delayMs: delay,
              path,
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
            attempt++;
          } else {
            throw err;
          }
        }
      }
      throw new Error(`[mlb-statsapi] max retries exceeded for ${path}`);
    });

    // Chain the queue so next caller waits for this request to complete.
    // Swallow errors in the chain tail so a failed request doesn't block
    // subsequent ones.
    this.requestQueue = result.catch(() => undefined);
    return result;
  }

  /** Tracks the timestamp of the most recent HTTP dispatch (within the queue). */
  private _lastRequestAt = 0;

  // ── Scoreboard ────────────────────────────────────────────────────────────

  async getScoreboard(date: string): Promise<Scoreboard> {
    const data = await this.get<MlbApiScheduleResponse>('/v1/schedule', {
      sportId: 1,
      date,
      hydrate: 'linescore',
    });

    const dateEntry =
      data.dates?.find((d) => d.date === date) ?? data.dates?.[0];
    const games: MlbGame[] = (dateEntry?.games ?? []).map((g) =>
      this.mapGame(g),
    );

    return {
      date,
      lastUpdated: new Date().toISOString(),
      games,
    };
  }

  async getGameFeed(gamePk: number): Promise<GameFeed> {
    const data = await this.get<MlbApiGameFeedResponse>(
      `/v1.1/game/${gamePk}/feed/live`,
    );
    const ls = data.liveData?.linescore;
    const gameData = data.gameData;

    return {
      gamePk,
      status: mapMlbStatus(gameData?.status?.detailedState),
      inning: ls?.currentInning ?? null,
      inningHalf: ls?.inningHalf ?? null,
      outs: ls?.outs ?? null,
      balls: ls?.balls ?? null,
      strikes: ls?.strikes ?? null,
      homeTeam: this.mapTeamScore(gameData?.teams?.home, ls?.teams?.home),
      awayTeam: this.mapTeamScore(gameData?.teams?.away, ls?.teams?.away),
      venue: gameData?.venue?.name ?? null,
    };
  }

  // ── Player Stats ──────────────────────────────────────────────────────────

  async getPlayerStats(
    mlbPlayerId: number,
    season: number,
    group: 'hitting' | 'pitching' | 'fielding',
  ): Promise<PlayerSeasonStats> {
    const data = await this.get<MlbApiPlayerStatsResponse>(
      `/v1/people/${mlbPlayerId}/stats`,
      { stats: 'season', season, group, sportId: 1 },
      STATIC_TTL_MS,
    );
    const stats = data.stats?.[0]?.splits?.[0]?.stat ?? {};
    return {
      playerId: mlbPlayerId,
      season,
      group,
      ...this.mapStats(stats, group),
    };
  }

  async getPlayerGameStats(
    mlbPlayerId: number,
    gamePk: number,
    season?: number,
  ): Promise<PlayerGameStats> {
    const data = await this.get<MlbApiPlayerStatsResponse>(
      `/v1/people/${mlbPlayerId}/stats`,
      {
        stats: 'gameLog',
        sportId: 1,
        ...(season !== undefined ? { season } : {}),
      },
    );
    const split = (data.stats?.[0]?.splits ?? []).find(
      (s) => s.game?.gamePk === gamePk,
    );
    const stats = split?.stat ?? {};
    const groupName = data.stats?.[0]?.group?.displayName;
    const group: 'hitting' | 'pitching' | 'fielding' =
      groupName === 'pitching'
        ? 'pitching'
        : groupName === 'fielding'
          ? 'fielding'
          : 'hitting';
    return {
      playerId: mlbPlayerId,
      gamePk,
      group,
      ...this.mapStats(stats, group),
    };
  }

  // ── Reference ─────────────────────────────────────────────────────────────

  async getSchedule(
    date: string,
    options?: ScheduleOptions,
  ): Promise<Schedule> {
    const data = await this.get<MlbApiScheduleResponse>(
      '/v1/schedule',
      { sportId: options?.sportId ?? 1, date, teamId: options?.teamId ?? '' },
      STATIC_TTL_MS,
    );
    const dateEntry =
      data.dates?.find((d) => d.date === date) ?? data.dates?.[0];
    const games: ScheduleGame[] = (dateEntry?.games ?? []).map((g) => ({
      gamePk: g.gamePk ?? 0,
      gameDate: g.gameDate ?? '',
      status: mapMlbStatus(g.status?.detailedState),
      homeTeamId: g.teams?.home?.team?.id ?? 0,
      awayTeamId: g.teams?.away?.team?.id ?? 0,
      venue: g.venue?.name ?? null,
    }));
    return { date, games };
  }

  async getStandings(season: number): Promise<Standings> {
    const data = await this.get<MlbApiStandingsResponse>(
      '/v1/standings',
      { leagueId: '103,104', season, standingsTypes: 'regularSeason' },
      STATIC_TTL_MS,
    );
    return {
      season,
      divisions: (data.records ?? []).map((record) => ({
        divisionId: record.division?.id ?? 0,
        divisionName: record.division?.name ?? '',
        teams: (record.teamRecords ?? []).map((t) => ({
          teamId: t.team?.id ?? 0,
          teamName: t.team?.name ?? '',
          wins: t.wins ?? 0,
          losses: t.losses ?? 0,
          pct: parseFloat(t.winningPercentage ?? '0') || 0,
          gamesBack: t.gamesBack ?? '',
          divisionRank: parseInt(t.divisionRank ?? '0', 10) || 0,
          leagueRank: parseInt(t.leagueRank ?? '0', 10) || 0,
        })),
      })),
    };
  }

  async getTeams(): Promise<Team[]> {
    const data = await this.get<MlbApiTeamsResponse>(
      '/v1/teams',
      { sportId: 1 },
      STATIC_TTL_MS,
    );
    return (data.teams ?? []).map((t) => ({
      teamId: t.id ?? 0,
      teamName: t.name ?? '',
      abbreviation: t.abbreviation ?? '',
      locationName: t.locationName ?? '',
      divisionId: t.division?.id ?? null,
      leagueId: t.league?.id ?? null,
    }));
  }

  // ── Private mapping helpers ───────────────────────────────────────────────

  private mapGame(g: MlbApiScheduleGame): MlbGame {
    const ls = g.linescore;
    return {
      gamePk: g.gamePk ?? 0,
      status: mapMlbStatus(g.status?.detailedState),
      startTime: g.gameDate ?? null,
      inning: ls?.currentInning ?? null,
      inningHalf: ls?.inningHalf ?? null,
      outs: ls?.outs ?? null,
      homeTeam: this.mapTeamScore(g.teams?.home?.team, ls?.teams?.home),
      awayTeam: this.mapTeamScore(g.teams?.away?.team, ls?.teams?.away),
      venue: g.venue?.name ?? null,
    };
  }

  private mapTeamScore(
    team: MlbApiTeamRef | undefined,
    lsTeam: MlbApiLinescoreTeam | undefined,
  ): MlbTeamScore {
    const innings: number[] = (lsTeam?.innings ?? []).map(
      (inn) => inn.runs ?? 0,
    );
    return {
      teamId: team?.id ?? 0,
      teamName: team?.name ?? '',
      abbreviation: team?.abbreviation ?? '',
      runs: lsTeam?.runs ?? 0,
      hits: lsTeam?.hits ?? 0,
      errors: lsTeam?.errors ?? 0,
      linescoreInnings: innings.length > 0 ? innings : null,
    };
  }

  /**
   * Maps raw API stat fields for the specified group only. Keeps hitting,
   * pitching, and fielding fields strictly separated so consumers cannot
   * accidentally read cross-group fields (e.g. strikeOutsPitching on a
   * hitting response).
   */
  private mapStats(
    stats: MlbApiStatLine,
    group: 'hitting' | 'pitching' | 'fielding',
  ): Partial<PlayerSeasonStats> {
    const common: Partial<PlayerSeasonStats> = {
      gamesPlayed: stats.gamesPlayed,
    };

    if (group === 'hitting') {
      return {
        ...common,
        atBats: stats.atBats,
        hits: stats.hits,
        doubles: stats.doubles,
        triples: stats.triples,
        homeRuns: stats.homeRuns,
        rbi: stats.rbi,
        runs: stats.runs,
        stolenBases: stats.stolenBases,
        strikeOuts: stats.strikeOuts,
        baseOnBalls: stats.baseOnBalls,
        avg: stats.avg ? parseFloat(stats.avg) : undefined,
        obp: stats.obp ? parseFloat(stats.obp) : undefined,
        slg: stats.slg ? parseFloat(stats.slg) : undefined,
        ops: stats.ops ? parseFloat(stats.ops) : undefined,
      };
    }

    if (group === 'pitching') {
      return {
        ...common,
        wins: stats.wins,
        losses: stats.losses,
        saves: stats.saves,
        era: stats.era ? parseFloat(stats.era) : undefined,
        inningsPitched: stats.inningsPitched
          ? parseFloat(stats.inningsPitched)
          : undefined,
        earnedRuns: stats.earnedRuns,
        whip: stats.whip ? parseFloat(stats.whip) : undefined,
        strikeOutsPitching: stats.strikeOuts,
        walksPitching: stats.baseOnBalls,
      };
    }

    // fielding
    return {
      ...common,
      putOuts: stats.putOuts,
      assists: stats.assists,
      errors: stats.errors,
      fieldingPercentage: stats.fielding
        ? parseFloat(stats.fielding)
        : undefined,
    };
  }
}
