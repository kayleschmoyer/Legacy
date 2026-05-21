import type {
  GameFeed,
  PlayerGameStats,
  PlayerSeasonStats,
  Schedule,
  ScheduleOptions,
  Scoreboard,
  Standings,
  Team,
} from './types';

/**
 * Provider-agnostic interface for fetching MLB data.
 *
 * Dev environments use the free MLB Stats API (mlb-statsapi).
 * Production uses a licensed provider (balldontlie or rolling-insights).
 * Consumers always program to this interface — never to a specific provider.
 */
export interface MlbDataProvider {
  // ── Scoreboard ────────────────────────────────────────────────────────────
  /** Returns all games and scores for the given date (YYYY-MM-DD). */
  getScoreboard(date: string): Promise<Scoreboard>;

  /** Returns the detailed live feed for a single game by MLB primary key. */
  getGameFeed(gamePk: number): Promise<GameFeed>;

  // ── Player Stats ──────────────────────────────────────────────────────────
  /** Returns season aggregates for a player. */
  getPlayerStats(
    mlbPlayerId: number,
    season: number,
    group: 'hitting' | 'pitching' | 'fielding',
  ): Promise<PlayerSeasonStats>;

  /**
   * Returns a player's stats for a single game.
   *
   * When `season` is omitted, providers backed by the MLB Stats API only
   * search the current season's game log — pass an explicit `season` when
   * looking up games from a prior year (backfill, re-score, season rollover).
   */
  getPlayerGameStats(
    mlbPlayerId: number,
    gamePk: number,
    season?: number,
  ): Promise<PlayerGameStats>;

  // ── Reference ─────────────────────────────────────────────────────────────
  /** Returns the schedule for a given date with optional filters. */
  getSchedule(date: string, options?: ScheduleOptions): Promise<Schedule>;

  /** Returns standings for the given season. */
  getStandings(season: number): Promise<Standings>;

  /** Returns all MLB teams. Results are cached aggressively (static data). */
  getTeams(): Promise<Team[]>;
}
