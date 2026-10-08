import {
  and,
  count,
  eq,
  ilike,
  inArray,
  isNotNull,
  ne,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
import {
  careerMinimumConditions,
  filterPlayerIdsByLeagueEligibility,
  getPresetEraRange,
} from '../DraftUtils';
import { runWithPublicClient } from '../client/Helpers';
import { PublicDb, PublicSchema } from '../client/PublicDbClient';
import { Player, PlayerPosition } from '../../types/DatabaseTypes';
import { PlayerCareerScore } from '../../types/ScoringTypes';

const VALID_PLAYER_POSITIONS: ReadonlyArray<PlayerPosition> = [
  'SP',
  'RP',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'RF',
  'LF',
  'CF',
  'DH',
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DL',
  'LB',
  'DB',
  'DST',
] as const;

function toPlayerPosition(value: string | null): PlayerPosition | null {
  if (value == null) return null;
  return (VALID_PLAYER_POSITIONS as ReadonlyArray<string>).includes(value)
    ? (value as PlayerPosition)
    : null;
}

/** Shape of rows returned by the compute_career_scores raw SQL query */
interface ScoringResultRow {
  id: number;
  first_name: string;
  last_name: string;
  bref_id: string;
  stats_last_fetched_at: string | null;
  batting_score: string | null;
  pitching_score: string | null;
  fielding_score: string | null;
  hitter_score: string | null;
  total_score: string | null;
  career_games: string | null;
  avg_ppg: string | null;
  hitter_avg_ppg: string | null;
  pitching_avg_ppg: string | null;
  total_games: number | null;
  // Career achievement columns
  all_star_selections: number | null;
  gold_gloves: number | null;
  silver_sluggers: number | null;
  mvp_awards: number | null;
  cy_young_awards: number | null;
  world_series_rings: number | null;
  hall_of_fame: boolean | null;
  rookie_of_the_year: boolean | null;
  mlb_player_id: number | null;
  bat_hand: string | null;
  throw_hand: string | null;
  // Football identity columns (LS-246, LS-250)
  sport: 'baseball' | 'football';
  pfr_id: string | null;
  pfa_id: string | null;
  is_dst: boolean;
  nfl_team: string | null;
  position: string | null;
  jersey_number: number | null;
  // Football news column (LS-5436)
  news: string | null;
  // Football premium advanced-search filter columns (LS-6489)
  projected_fantasy_points: number | null;
  adp_rank: number | null;
  // MLB team affiliation for baseball players (LS-8597)
  mlb_team: string | null;
}

export interface PlayerFilters {
  ids?: number[];
  firstName?: string;
  lastName?: string;
  fullName?: string;
  fullNameLike?: string;
  brefId?: string;
  excludeEmptyNames?: boolean;
  position?: string;
  /** Minimum total career MLB games (across all AL/NL seasons) */
  minCareerGames?: number;
  /** Minimum distinct MLB seasons in which the player appeared */
  minCareerSeasons?: number;
  /**
   * League pitcher career minimums (LS-10807). When either is > 0 the league
   * career rule ({@link careerMinimumConditions}) replaces the per-position
   * minCareerGames / minCareerSeasons filters in the league-scoped listing.
   */
  minCareerPitcherGames?: number;
  minCareerPitcherSeasons?: number;
  /**
   * Restrict the pool to players whose careers overlapped with the given
   * baseball era. 'all' (default) imposes no restriction.
   *
   * Preset eras resolve via `getPresetEraRange` (canonical table:
   * `ERA_YEAR_RANGES_BY_SPORT` in `@legacy-sports/utils`).
   * custom      : uses customEraStartYear / customEraEndYear
   * all         : no restriction
   */
  baseballEraFilter?: string;
  /** Start year for custom era (only used when baseballEraFilter = 'custom') */
  customEraStartYear?: number | null;
  /** End year for custom era (only used when baseballEraFilter = 'custom') */
  customEraEndYear?: number | null;
  /** When true, only include Hall of Fame inductees */
  baseballHofOnly?: boolean;
  /** Filter by sport ('baseball' | 'football'). Omit for no restriction. */
  sport?: 'baseball' | 'football';
  /**
   * When true, exclude players already rostered on any team in the query's
   * `leagueId` (LS-9118). Requires `leagueId` to be set — a no-op otherwise.
   * Applied server-side, before LIMIT/OFFSET, so paginated free-agent results
   * are not thinned out by post-fetch client-side filtering.
   */
  excludeRostered?: boolean;
  /**
   * When true, only include players rostered on a team in the query's
   * `leagueId` — the inverse of `excludeRostered` (LS-10821, season-award
   * recipients). Requires `leagueId` to be set — a no-op otherwise.
   */
  rosteredOnly?: boolean;
}

/** Sort options that require a join to career_batting */
export type CareerStatOrderBy =
  | 'careerGames'
  | 'careerHits'
  | 'careerHomeRuns'
  | 'careerRBI'
  | 'careerRuns'
  | 'careerStolenBases';

/** Sort options that require the compute_career_scores DB function */
export type ScoringOrderBy =
  | 'totalScore'
  | 'avgPointsPerGame'
  | 'battingScore'
  | 'pitchingScore'
  | 'fieldingScore'
  | 'hitterScore'
  | 'hitterAvgPointsPerGame'
  | 'pitchingAvgPointsPerGame'
  | 'careerOffensiveWAR';

export type PlayerOrderBy =
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'brefId'
  | CareerStatOrderBy
  | ScoringOrderBy;

export interface PlayerQueryOptions {
  filters?: PlayerFilters;
  limit?: number;
  offset?: number;
  orderBy?: PlayerOrderBy;
  orderDirection?: 'asc' | 'desc';
  /**
   * League ID for scoring-based sorts. When provided with a scoring orderBy,
   * the league's custom scoring multipliers are used. When omitted, system
   * defaults are used.
   */
  leagueId?: number | null;
}

/** Player with scoring data attached from the DB function */
export interface PlayerWithScoring extends Player {
  scoring: PlayerCareerScore;
}

/** Row shape of the player_notable_plays cache table (LS-9095). */
export type PlayerNotablePlayRow =
  typeof PublicSchema.playerNotablePlays.$inferSelect;

/** Insertable notable-play summary (LS-9095) — timestamps are DB-managed. */
export type PlayerNotablePlayUpsert = Omit<
  typeof PublicSchema.playerNotablePlays.$inferInsert,
  'createdAt' | 'updatedAt'
>;

/** Row shape of the player_highlight_videos cache table (LS-9113). */
export type PlayerHighlightVideoRow =
  typeof PublicSchema.playerHighlightVideos.$inferSelect;

/**
 * A player awaiting highlight-video resolution (LS-9113). Era fields are the
 * first/last seasons with a batting or pitching line — context for the
 * relevance judge when a video title only matches on last name.
 */
export interface HighlightVideoCandidate {
  playerId: number;
  firstName: string;
  lastName: string;
  mlbTeam: string | null;
  firstSeason: number | null;
  lastSeason: number | null;
}

/** Outcome of one player's resolution attempt (LS-9113). */
export interface HighlightVideoResolution {
  playerId: number;
  /** NULL marks attempted-but-unresolved — the splash uses the graphic tier. */
  youtubeVideoId: string | null;
  videoTitle: string | null;
  madeForKids: boolean | null;
  embeddable: boolean | null;
  matchMethod: 'full_name' | 'judge' | null;
  /** Clip length in seconds (LS-10973); null when unresolved. */
  durationSeconds: number | null;
}

/** Verification refresh for an already-resolved video row (LS-9113). */
export interface HighlightVideoVerification {
  playerId: number;
  videoTitle: string | null;
  madeForKids: boolean;
  embeddable: boolean;
  durationSeconds: number | null;
}

/**
 * Player service functions for database operations
 */
export class PlayerService {
  constructor(private options: DbOptions) {}

  /**
   * Get all players with optional filtering and pagination
   */
  async getPlayers(queryOptions: PlayerQueryOptions = {}): Promise<Player[]> {
    // Always go through the scoring path so scoring data (PTS, BAT, FLD, etc.)
    // is populated regardless of which column is being sorted.
    return await this.getPlayersWithScoringSort(queryOptions);
  }

  /**
   * Get a single player by ID
   */
  async getPlayerById(id: number): Promise<Player | null> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.players)
        .where(eq(PublicSchema.players.id, id))
        .limit(1);

      return results[0] || null;
    });
  }

  /**
   * Get a single player by Baseball Reference ID
   */
  async getPlayerByBrefId(brefId: string): Promise<Player | null> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.players)
        .where(eq(PublicSchema.players.brefId, brefId))
        .limit(1);

      return results[0] || null;
    });
  }

  /**
   * Get a single player by MLB Stats API player ID
   */
  async getPlayerByMlbId(mlbPlayerId: number): Promise<Player | null> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.players)
        .where(eq(PublicSchema.players.mlbPlayerId, mlbPlayerId))
        .limit(1);

      return results[0] || null;
    });
  }

  /**
   * Get cached notable plays for a set of MLB Stats API player ids (LS-9095).
   * Splash-path read — a single indexed lookup, no external calls.
   */
  async getNotablePlaysByMlbIds(
    mlbPlayerIds: number[],
  ): Promise<PlayerNotablePlayRow[]> {
    if (mlbPlayerIds.length === 0) return [];
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.playerNotablePlays)
        .where(
          inArray(PublicSchema.playerNotablePlays.mlbPlayerId, mlbPlayerIds),
        );
    });
  }

  /**
   * Narrow a set of MLB Stats API player ids to the ones mapped to a player
   * row (LS-9095). Keeps the notable-play cache bounded to our own players.
   */
  async filterKnownMlbPlayerIds(mlbPlayerIds: number[]): Promise<number[]> {
    if (mlbPlayerIds.length === 0) return [];
    return runWithPublicClient(this.options, async (db) => {
      const rows = await db
        .select({ mlbPlayerId: PublicSchema.players.mlbPlayerId })
        .from(PublicSchema.players)
        .where(inArray(PublicSchema.players.mlbPlayerId, mlbPlayerIds));
      return rows
        .map((r) => r.mlbPlayerId)
        .filter((id): id is number => id !== null);
    });
  }

  /**
   * Upsert notable-play cache rows (LS-9095). An existing row is only
   * replaced when the incoming play scores at least as high, or when the
   * stored play has gone stale (older than 60 days) — "best recent moment"
   * semantics for the pick-splash graphic.
   */
  async upsertNotablePlays(plays: PlayerNotablePlayUpsert[]): Promise<number> {
    if (plays.length === 0) return 0;
    return runWithPublicClient(this.options, async (db) => {
      const t = PublicSchema.playerNotablePlays;
      const updated = await db
        .insert(t)
        .values(plays)
        .onConflictDoUpdate({
          target: t.mlbPlayerId,
          set: {
            playerRole: sql`excluded.player_role`,
            gamePk: sql`excluded.game_pk`,
            gameDate: sql`excluded.game_date`,
            playId: sql`excluded.play_id`,
            eventType: sql`excluded.event_type`,
            description: sql`excluded.description`,
            exitVelocity: sql`excluded.exit_velocity`,
            launchAngle: sql`excluded.launch_angle`,
            hitDistance: sql`excluded.hit_distance`,
            pitchSpeed: sql`excluded.pitch_speed`,
            pitchType: sql`excluded.pitch_type`,
            notabilityScore: sql`excluded.notability_score`,
            updatedAt: sql`now()`,
          },
          setWhere: sql`excluded.notability_score >= ${t.notabilityScore} OR ${t.gameDate} < (now() - interval '60 days')::date`,
        })
        .returning({ mlbPlayerId: t.mlbPlayerId });
      return updated.length;
    });
  }

  /**
   * Get validated highlight-video cache rows for a set of players (LS-9113).
   * Splash-path read — only rows that are resolved, embeddable, and not
   * Made-for-Kids are served; everything else falls back to the graphic tier.
   */
  async getHighlightVideosByPlayerIds(
    playerIds: number[],
  ): Promise<PlayerHighlightVideoRow[]> {
    if (playerIds.length === 0) return [];
    return runWithPublicClient(this.options, async (db) => {
      const t = PublicSchema.playerHighlightVideos;
      return db
        .select()
        .from(t)
        .where(
          and(
            inArray(t.playerId, playerIds),
            isNotNull(t.youtubeVideoId),
            eq(t.embeddable, true),
            eq(t.madeForKids, false),
          ),
        );
    });
  }

  /**
   * Priority-ordered players awaiting highlight-video resolution (LS-9113):
   * draft-pool players of upcoming/active baseball leagues first (default
   * scoring-cache FPG descending — the players most likely to be drafted),
   * then previously drafted players by pick recency. Players with any cache
   * row (resolved or attempted) are excluded; the 30-day stale purge is what
   * re-opens unresolved players for a retry.
   */
  async getHighlightVideoResolutionCandidates(
    limit: number,
  ): Promise<HighlightVideoCandidate[]> {
    if (limit <= 0) return [];
    return runWithPublicClient(this.options, async (db) => {
      const ordered: number[] = [];
      const seen = new Set<number>();
      const add = (id: number) => {
        if (!seen.has(id) && ordered.length < limit) {
          seen.add(id);
          ordered.push(id);
        }
      };

      // Tier 1: pool of leagues with an upcoming or active draft. The pool
      // ranking is league-independent (default-profile FPG); per-league
      // eligibility settings then gate which ranked players belong to each
      // league's pool.
      const draftingLeagues = await db
        .select({
          playerPool: PublicSchema.leagues.playerPool,
          minCareerGames: PublicSchema.leagues.minCareerGames,
          minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
          minCareerPitcherGames: PublicSchema.leagues.minCareerPitcherGames,
          minCareerPitcherSeasons: PublicSchema.leagues.minCareerPitcherSeasons,
          baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
          baseballEraFilter: PublicSchema.leagues.baseballEraFilter,
          customEraStartYear: PublicSchema.leagues.customEraStartYear,
          customEraEndYear: PublicSchema.leagues.customEraEndYear,
        })
        .from(PublicSchema.leagues)
        .where(
          and(
            eq(PublicSchema.leagues.sport, 'baseball'),
            inArray(PublicSchema.leagues.draftStatus, [
              'not-started',
              'queued',
              'in-progress',
            ]),
          ),
        )
        .limit(20);

      if (draftingLeagues.length > 0) {
        const poolRows = await db.execute(
          sql`SELECT p.id
              FROM players p
              LEFT JOIN public.player_scoring_cache cs
                ON cs.player_id = p.id AND cs.league_id IS NULL
              WHERE p.sport = 'baseball'
                AND NOT EXISTS (
                  SELECT 1 FROM player_highlight_videos phv
                  WHERE phv.player_id = p.id
                )
              ORDER BY (
                COALESCE(cs.batting_ppg, 0) +
                COALESCE(cs.pitching_ppg, 0) +
                COALESCE(cs.fielding_ppg, 0)
              ) DESC
              LIMIT ${limit * 4}`,
        );
        const rankedIds = poolRows.rows.map((r) => r.id as number);
        for (const league of draftingLeagues) {
          if (ordered.length >= limit) break;
          const eligibility = await filterPlayerIdsByLeagueEligibility(
            db,
            rankedIds,
            {
              playerPool: league.playerPool,
              minCareerGames: league.minCareerGames ?? 0,
              minCareerSeasons: league.minCareerSeasons ?? 0,
              minCareerPitcherGames: league.minCareerPitcherGames ?? 0,
              minCareerPitcherSeasons: league.minCareerPitcherSeasons ?? 0,
              baseballHofOnly: league.baseballHofOnly ?? false,
              baseballEraFilter: league.baseballEraFilter ?? 'all',
              customEraStartYear: league.customEraStartYear ?? null,
              customEraEndYear: league.customEraEndYear ?? null,
              sport: 'baseball',
            },
          );
          for (const id of rankedIds) {
            if (eligibility.eligibleIds.has(id)) add(id);
          }
        }
      }

      // Tier 2: previously drafted players, most recent pick first.
      if (ordered.length < limit) {
        const drafted = await db.execute(
          sql`SELECT dp.player_id AS id
              FROM draft_picks dp
              JOIN players p ON p.id = dp.player_id AND p.sport = 'baseball'
              WHERE NOT EXISTS (
                SELECT 1 FROM player_highlight_videos phv
                WHERE phv.player_id = dp.player_id
              )
              GROUP BY dp.player_id
              ORDER BY MAX(dp.picked_at) DESC
              LIMIT ${limit}`,
        );
        for (const r of drafted.rows) add(r.id as number);
      }

      if (ordered.length === 0) return [];

      // Hydrate names, team, and era span (relevance-judge context).
      const players = await db
        .select({
          id: PublicSchema.players.id,
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
          mlbTeam: PublicSchema.players.mlbTeam,
        })
        .from(PublicSchema.players)
        .where(inArray(PublicSchema.players.id, ordered));
      const spans = new Map<number, { first: number; last: number }>();
      for (const table of [
        PublicSchema.seasonBatting,
        PublicSchema.seasonPitching,
      ] as const) {
        const rows = await db
          .select({
            playerId: table.playerId,
            first: sql<number>`min(${table.season})`,
            last: sql<number>`max(${table.season})`,
          })
          .from(table)
          .where(inArray(table.playerId, ordered))
          .groupBy(table.playerId);
        for (const row of rows) {
          const existing = spans.get(row.playerId);
          spans.set(row.playerId, {
            first: Math.min(existing?.first ?? row.first, row.first),
            last: Math.max(existing?.last ?? row.last, row.last),
          });
        }
      }
      const byId = new Map(players.map((p) => [p.id, p]));
      return ordered
        .map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          const span = spans.get(id);
          return {
            playerId: id,
            firstName: p.firstName,
            lastName: p.lastName,
            mlbTeam: p.mlbTeam,
            firstSeason: span?.first ?? null,
            lastSeason: span?.last ?? null,
          };
        })
        .filter((c): c is HighlightVideoCandidate => c !== null);
    });
  }

  /**
   * Record resolution outcomes (LS-9113) — validated videos and
   * attempted-but-unresolved markers alike. Resolved rows count as verified
   * now (the resolver just confirmed status via videos.list).
   */
  async upsertHighlightVideoResolutions(
    resolutions: HighlightVideoResolution[],
  ): Promise<number> {
    if (resolutions.length === 0) return 0;
    return runWithPublicClient(this.options, async (db) => {
      const t = PublicSchema.playerHighlightVideos;
      const updated = await db
        .insert(t)
        .values(
          resolutions.map((r) => ({
            playerId: r.playerId,
            youtubeVideoId: r.youtubeVideoId,
            videoTitle: r.videoTitle,
            madeForKids: r.madeForKids,
            embeddable: r.embeddable,
            matchMethod: r.matchMethod,
            durationSeconds: r.durationSeconds,
            resolvedAt: sql`now()`,
            lastVerifiedAt: r.youtubeVideoId != null ? sql`now()` : null,
          })),
        )
        .onConflictDoUpdate({
          target: t.playerId,
          set: {
            youtubeVideoId: sql`excluded.youtube_video_id`,
            videoTitle: sql`excluded.video_title`,
            madeForKids: sql`excluded.made_for_kids`,
            embeddable: sql`excluded.embeddable`,
            matchMethod: sql`excluded.match_method`,
            durationSeconds: sql`excluded.duration_seconds`,
            resolvedAt: sql`excluded.resolved_at`,
            lastVerifiedAt: sql`excluded.last_verified_at`,
            updatedAt: sql`now()`,
          },
        })
        .returning({ playerId: t.playerId });
      return updated.length;
    });
  }

  /** All resolved video rows, for the weekly re-verify pass (LS-9113). */
  async getHighlightVideosForVerification(): Promise<
    Array<{ playerId: number; youtubeVideoId: string }>
  > {
    return runWithPublicClient(this.options, async (db) => {
      const t = PublicSchema.playerHighlightVideos;
      const rows = await db
        .select({ playerId: t.playerId, youtubeVideoId: t.youtubeVideoId })
        .from(t)
        .where(isNotNull(t.youtubeVideoId));
      return rows.filter(
        (r): r is { playerId: number; youtubeVideoId: string } =>
          r.youtubeVideoId !== null,
      );
    });
  }

  /**
   * Refresh metadata for still-valid videos confirmed by the weekly
   * videos.list pass (LS-9113).
   */
  async applyHighlightVideoVerifications(
    verifications: HighlightVideoVerification[],
  ): Promise<number> {
    if (verifications.length === 0) return 0;
    return runWithPublicClient(this.options, async (db) => {
      const t = PublicSchema.playerHighlightVideos;
      let updated = 0;
      for (const v of verifications) {
        const rows = await db
          .update(t)
          .set({
            videoTitle: v.videoTitle,
            madeForKids: v.madeForKids,
            embeddable: v.embeddable,
            durationSeconds: v.durationSeconds,
            lastVerifiedAt: sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(t.playerId, v.playerId))
          .returning({ playerId: t.playerId });
        updated += rows.length;
      }
      return updated;
    });
  }

  /**
   * Purge cache rows for videos that are gone, private, no longer
   * embeddable, or flipped Made-for-Kids (LS-9113). The player becomes a
   * resolution candidate again on a later nightly run.
   */
  async purgeHighlightVideos(playerIds: number[]): Promise<number> {
    if (playerIds.length === 0) return 0;
    return runWithPublicClient(this.options, async (db) => {
      const t = PublicSchema.playerHighlightVideos;
      const rows = await db
        .delete(t)
        .where(inArray(t.playerId, playerIds))
        .returning({ playerId: t.playerId });
      return rows.length;
    });
  }

  /**
   * Purge rows not verified within the YouTube API cache window (LS-9113,
   * DP III.E.4.d/e — stored API data must be refreshed or deleted within 30
   * days). Also the retry mechanism for unresolved markers.
   */
  async purgeStaleHighlightVideos(maxAgeDays: number): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      const t = PublicSchema.playerHighlightVideos;
      const rows = await db
        .delete(t)
        .where(
          sql`COALESCE(${t.lastVerifiedAt}, ${t.resolvedAt}) < now() - make_interval(days => ${maxAgeDays})`,
        )
        .returning({ playerId: t.playerId });
      return rows.length;
    });
  }

  /**
   * Get players by multiple IDs
   */
  async getPlayersByIds(ids: number[]): Promise<Player[]> {
    if (ids.length === 0) return [];

    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.players)
        .where(inArray(PublicSchema.players.id, ids));
    });
  }

  /**
   * Count players with optional filtering
   */
  async countPlayers(filters?: PlayerFilters): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      let queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.players);

      const conditions = filters ? this.buildPlayerFilters(filters) : [];

      if (conditions.length > 0) {
        // TypeScript has issues with Drizzle's complex query builder types
        // This is a safe cast since we know the query is valid
        queryBuilder = queryBuilder.where(
          and(...conditions),
        ) as typeof queryBuilder;
      }

      const result = await queryBuilder.execute();
      return result[0]?.count || 0;
    });
  }

  /**
   * Count players browsable in the Players list, across both sports
   * (LS-10747). Mirrors the list's unfiltered totals so the landing-page
   * "Players across every era" stat matches what users can browse:
   * - MLB: one `career_batting` row per player (`careerBattingStats.totalCount`)
   * - NFL: `players WHERE sport = 'football'` (`footballPlayers.totalCount`,
   *   overview view)
   * A raw `count(*)` over `players` overstates this, because baseball rows
   * without a career batting line never appear in the list.
   */
  async countBrowsablePlayers(): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      const [[mlb], [nfl]] = await Promise.all([
        db.select({ count: count() }).from(PublicSchema.careerBatting),
        db
          .select({ count: count() })
          .from(PublicSchema.players)
          .where(eq(PublicSchema.players.sport, 'football')),
      ]);
      return Number(mlb?.count ?? 0) + Number(nfl?.count ?? 0);
    });
  }

  /**
   * Search players by name (searches first name, last name, and full name).
   *
   * Results are ranked by relevance so a small `limit` still surfaces the
   * player the user is typing (LS-10439): exact full-name match first, then
   * full-name / last-name / first-name prefix matches, then any substring
   * match. Rows missing a first or last name (single-name historical records)
   * sort after complete names so they can't crowd out real matches. Ties break
   * alphabetically by last name, first name, then id so the order is
   * deterministic.
   */
  async searchPlayers(
    searchTerm: string,
    limit = 10,
    sport?: 'baseball' | 'football',
  ): Promise<Player[]> {
    return runWithPublicClient(this.options, async (db) => {
      const { firstName, lastName } = PublicSchema.players;
      const fullName = sql`(${firstName} || ' ' || ${lastName})`;

      const nameCondition = or(
        ilike(firstName, `%${searchTerm}%`),
        ilike(lastName, `%${searchTerm}%`),
        sql`${fullName} ILIKE ${'%' + searchTerm + '%'}`,
        // Legal-name aliases, e.g. "Henry Aaron" (LS-10669)
        sql`${PublicSchema.players}.${sql.identifier('name_aliases')} ILIKE ${'%' + searchTerm + '%'}`,
      );

      const whereCondition = sport
        ? and(nameCondition, eq(PublicSchema.players.sport, sport))
        : nameCondition;

      const relevance = sql`CASE
        WHEN ${fullName} ILIKE ${searchTerm} THEN 0
        WHEN ${fullName} ILIKE ${searchTerm + '%'} THEN 1
        WHEN ${lastName} ILIKE ${searchTerm + '%'} THEN 2
        WHEN ${firstName} ILIKE ${searchTerm + '%'} THEN 3
        ELSE 4
      END`;

      const incompleteName = sql`CASE
        WHEN COALESCE(${firstName}, '') = '' OR COALESCE(${lastName}, '') = ''
        THEN 1 ELSE 0
      END`;

      return db
        .select()
        .from(PublicSchema.players)
        .where(whereCondition)
        .orderBy(
          incompleteName,
          relevance,
          sql`${lastName} ASC NULLS LAST`,
          sql`${firstName} ASC NULLS LAST`,
          PublicSchema.players.id,
        )
        .limit(limit);
    });
  }

  /**
   * Build WHERE conditions from player filters
   */
  private buildPlayerFilters(filters: PlayerFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.ids && filters.ids.length > 0) {
      conditions.push(inArray(PublicSchema.players.id, filters.ids));
    }

    if (filters.firstName) {
      conditions.push(eq(PublicSchema.players.firstName, filters.firstName));
    }

    if (filters.lastName) {
      conditions.push(eq(PublicSchema.players.lastName, filters.lastName));
    }

    if (filters.fullName) {
      // Use a raw SQL comparison for the concatenated full name
      conditions.push(
        sql`${PublicSchema.players.firstName} || ' ' || ${PublicSchema.players.lastName} = ${filters.fullName}`,
      );
    }

    if (filters.fullNameLike) {
      const firstNameCondition = ilike(
        PublicSchema.players.firstName,
        `%${filters.fullNameLike}%`,
      );
      const lastNameCondition = ilike(
        PublicSchema.players.lastName,
        `%${filters.fullNameLike}%`,
      );
      const fullNameCondition = sql`(${PublicSchema.players.firstName} || ' ' || ${PublicSchema.players.lastName}) ILIKE ${'%' + filters.fullNameLike + '%'}`;
      const nameCondition = or(
        firstNameCondition,
        lastNameCondition,
        fullNameCondition,
      );
      if (nameCondition) {
        conditions.push(nameCondition);
      }
    }

    if (filters.brefId) {
      conditions.push(eq(PublicSchema.players.brefId, filters.brefId));
    }

    if (filters.excludeEmptyNames) {
      conditions.push(ne(PublicSchema.players.lastName, ''));
    }

    const isPitcherFilter = ['P', 'SP', 'RP'].includes(filters.position ?? '');

    if (filters.minCareerGames !== undefined && filters.minCareerGames > 0) {
      if (isPitcherFilter) {
        conditions.push(
          sql`(
            NOT EXISTS (SELECT 1 FROM public.career_pitching WHERE player_id = ${PublicSchema.players.id})
            OR ${PublicSchema.players.id} IN (
              SELECT player_id FROM public.career_pitching WHERE g >= ${filters.minCareerGames}
            )
          )`,
        );
      } else {
        conditions.push(
          sql`(
            NOT EXISTS (SELECT 1 FROM public.career_batting WHERE player_id = ${PublicSchema.players.id})
            OR ${PublicSchema.players.id} IN (
              SELECT player_id FROM public.career_batting WHERE g >= ${filters.minCareerGames}
            )
          )`,
        );
      }
    }

    if (
      filters.minCareerSeasons !== undefined &&
      filters.minCareerSeasons > 0
    ) {
      if (isPitcherFilter) {
        conditions.push(
          sql`(
            NOT EXISTS (SELECT 1 FROM public.season_pitching WHERE player_id = ${PublicSchema.players.id} AND lg_id IN ('AL', 'NL'))
            OR ${PublicSchema.players.id} IN (
              SELECT player_id FROM public.season_pitching
              WHERE lg_id IN ('AL', 'NL')
              GROUP BY player_id
              HAVING COUNT(DISTINCT season) >= ${filters.minCareerSeasons}
            )
          )`,
        );
      } else {
        conditions.push(
          sql`(
            NOT EXISTS (SELECT 1 FROM public.season_batting WHERE player_id = ${PublicSchema.players.id} AND lg_id IN ('AL', 'NL'))
            OR ${PublicSchema.players.id} IN (
              SELECT player_id FROM public.season_batting
              WHERE lg_id IN ('AL', 'NL')
              GROUP BY player_id
              HAVING COUNT(DISTINCT season) >= ${filters.minCareerSeasons}
            )
          )`,
        );
      }
    }

    // Hall of Fame only filter
    if (filters.baseballHofOnly) {
      conditions.push(eq(PublicSchema.players.hallOfFame, true));
    }

    if (filters.sport) {
      conditions.push(eq(PublicSchema.players.sport, filters.sport));
    }

    return conditions;
  }

  /**
   * Get players sorted by DB-level scoring using compute_career_scores().
   * Returns PlayerWithScoring[] so callers can access the computed scores.
   */
  async getPlayersWithScoring(
    queryOptions: PlayerQueryOptions = {},
  ): Promise<PlayerWithScoring[]> {
    return this.getPlayersWithScoringSort(queryOptions);
  }

  /**
   * Internal: query players joined against the player_scoring_cache table,
   * enabling ORDER BY on any scoring column without invoking the expensive
   * compute_career_scores() function at query time (LS-696).
   *
   * Falls back to the default (league_id = NULL) cache rows for leagues that
   * have not had custom scoring configured.
   */
  private async getPlayersWithScoringSort(
    queryOptions: PlayerQueryOptions,
  ): Promise<PlayerWithScoring[]> {
    return runWithPublicClient(
      this.options,
      async (db): Promise<PlayerWithScoring[]> => {
        const leagueIdParam =
          queryOptions.leagueId !== undefined ? queryOptions.leagueId : null;

        // Map orderBy to the SQL column name in compute_career_scores
        const scoringColumnMap: Record<string, string> = {
          totalScore: 'total_score',
          avgPointsPerGame: 'avg_ppg',
          battingScore: 'batting_score',
          pitchingScore: 'pitching_score',
          fieldingScore: 'fielding_score',
        };
        // Career batting column names in the career_batting view (aliased as "cb")
        const careerBattingColumnMap: Record<string, string> = {
          careerGames: 'g',
          careerHits: 'h',
          careerHomeRuns: 'hr',
          careerRBI: 'rbi',
          careerRuns: 'r',
          careerStolenBases: 'sb',
          careerOffensiveWAR: 'offensive_war',
        };
        const orderByKey = queryOptions.orderBy || 'avgPointsPerGame';
        const sortDir =
          queryOptions.orderDirection === 'asc' ? sql`ASC` : sql`DESC`;
        const isCareerStatSort = orderByKey in careerBattingColumnMap;
        // Join career_batting whenever we need to sort by a career stat column
        const careerStatJoin = isCareerStatSort
          ? sql`LEFT JOIN public.career_batting cb ON p.id = cb.player_id`
          : sql``;
        // ORDER BY references SELECT aliases defined in the scoringQuery below,
        // which COALESCE league-specific and default cache rows.
        const orderByClause =
          orderByKey === 'hitterScore'
            ? sql`hitter_score ${sortDir}`
            : orderByKey === 'hitterAvgPointsPerGame'
              ? sql`hitter_avg_ppg ${sortDir}`
              : orderByKey === 'pitchingAvgPointsPerGame'
                ? sql`pitching_avg_ppg ${sortDir}`
                : isCareerStatSort
                  ? sql`cb.${sql.raw(careerBattingColumnMap[orderByKey])} ${sortDir} NULLS LAST`
                  : sql`${sql.raw(scoringColumnMap[orderByKey] || 'avg_ppg')} ${sortDir}`;

        // Build WHERE conditions using raw SQL (must reference alias "p",
        // not the Drizzle column refs which would emit "players"."col").
        const rawConditions: SQL[] = [];

        if (queryOptions.filters?.excludeEmptyNames) {
          rawConditions.push(sql`p.last_name <> ''`);
        }
        if (queryOptions.filters?.ids && queryOptions.filters.ids.length > 0) {
          const idList = queryOptions.filters.ids.join(',');
          rawConditions.push(sql`p.id IN (${sql.raw(idList)})`);
        }
        if (queryOptions.filters?.brefId) {
          rawConditions.push(sql`p.bref_id = ${queryOptions.filters.brefId}`);
        }

        // Position filtering — use raw SQL subquery referencing "p.id"
        if (queryOptions.filters?.position) {
          rawConditions.push(
            this.buildRawPositionFilter(queryOptions.filters.position),
          );
        }

        if (queryOptions.filters?.fullNameLike) {
          const term = queryOptions.filters.fullNameLike;
          rawConditions.push(
            sql`(
              p.first_name ILIKE ${'%' + term + '%'}
              OR p.last_name ILIKE ${'%' + term + '%'}
              OR (p.first_name || ' ' || p.last_name) ILIKE ${'%' + term + '%'}
              OR p.name_aliases ILIKE ${'%' + term + '%'}
            )`,
          );
        }

        const isPitcherPos = ['P', 'SP', 'RP'].includes(
          queryOptions.filters?.position ?? '',
        );

        // League pitcher minimums set (LS-10807): apply the league's
        // role-split career rule — the same predicates as the draft board
        // and FA pool — instead of the per-position filters below.
        const leagueCareer =
          (queryOptions.filters?.minCareerPitcherGames ?? 0) > 0 ||
          (queryOptions.filters?.minCareerPitcherSeasons ?? 0) > 0
            ? careerMinimumConditions({
                minCareerGames: queryOptions.filters?.minCareerGames ?? 0,
                minCareerSeasons: queryOptions.filters?.minCareerSeasons ?? 0,
                minCareerPitcherGames:
                  queryOptions.filters?.minCareerPitcherGames,
                minCareerPitcherSeasons:
                  queryOptions.filters?.minCareerPitcherSeasons,
              })
            : null;
        if (leagueCareer?.games) rawConditions.push(leagueCareer.games);
        if (leagueCareer?.seasons) rawConditions.push(leagueCareer.seasons);

        if (
          !leagueCareer &&
          queryOptions.filters?.minCareerGames !== undefined &&
          queryOptions.filters.minCareerGames > 0
        ) {
          if (isPitcherPos) {
            rawConditions.push(
              sql`(NOT EXISTS (SELECT 1 FROM public.career_pitching WHERE player_id = p.id) OR p.id IN (SELECT player_id FROM public.career_pitching WHERE g >= ${queryOptions.filters.minCareerGames}))`,
            );
          } else {
            rawConditions.push(
              sql`(NOT EXISTS (SELECT 1 FROM public.career_batting WHERE player_id = p.id) OR p.id IN (SELECT player_id FROM public.career_batting WHERE g >= ${queryOptions.filters.minCareerGames}))`,
            );
          }
        }

        if (
          !leagueCareer &&
          queryOptions.filters?.minCareerSeasons !== undefined &&
          queryOptions.filters.minCareerSeasons > 0
        ) {
          if (isPitcherPos) {
            rawConditions.push(
              sql`(NOT EXISTS (SELECT 1 FROM public.season_pitching WHERE player_id = p.id AND lg_id IN ('AL', 'NL')) OR p.id IN (SELECT player_id FROM public.season_pitching WHERE lg_id IN ('AL', 'NL') GROUP BY player_id HAVING COUNT(DISTINCT season) >= ${queryOptions.filters.minCareerSeasons}))`,
            );
          } else {
            rawConditions.push(
              sql`(NOT EXISTS (SELECT 1 FROM public.season_batting WHERE player_id = p.id AND lg_id IN ('AL', 'NL')) OR p.id IN (SELECT player_id FROM public.season_batting WHERE lg_id IN ('AL', 'NL') GROUP BY player_id HAVING COUNT(DISTINCT season) >= ${queryOptions.filters.minCareerSeasons}))`,
            );
          }
        }

        // Hall of Fame only
        if (queryOptions.filters?.baseballHofOnly) {
          rawConditions.push(sql`p.hall_of_fame = true`);
        }

        if (queryOptions.filters?.sport) {
          rawConditions.push(sql`p.sport = ${queryOptions.filters.sport}`);
        }

        // Era-based player pool filter
        const eraCondition = this.buildRawEraFilter(queryOptions.filters);
        if (eraCondition) {
          rawConditions.push(eraCondition);
        }

        // Rostered-player exclusion (LS-9118) — applied before LIMIT/OFFSET so
        // a page of results is never thinned out after the fact.
        if (queryOptions.filters?.excludeRostered && leagueIdParam != null) {
          rawConditions.push(
            sql`NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.player_id = p.id AND tm.league_id = ${leagueIdParam})`,
          );
        }
        if (queryOptions.filters?.rosteredOnly && leagueIdParam != null) {
          rawConditions.push(
            sql`EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.player_id = p.id AND tm.league_id = ${leagueIdParam})`,
          );
        }

        const whereClause =
          rawConditions.length > 0
            ? sql`WHERE ${sql.join(rawConditions, sql` AND `)}`
            : sql``;

        // Clamp LIMIT/OFFSET to safe integer ranges and bind as parameters so
        // the values can never carry SQL fragments even if a caller passes
        // unvalidated input.
        const limitClause =
          queryOptions.limit != null
            ? sql`LIMIT ${Math.min(Math.max(1, Math.trunc(queryOptions.limit)), 1000)}`
            : sql``;
        const offsetClause =
          queryOptions.offset != null
            ? sql`OFFSET ${Math.max(0, Math.trunc(queryOptions.offset))}`
            : sql``;

        // Join against player_scoring_cache (LS-696, LS-4688):
        //   cs_league — league-specific pre-computed scores (matched by league_id)
        //   cs_default — default (NULL league_id) pre-computed scores as fallback
        // COALESCE prefers league-specific; falls back to default when no custom
        // scoring profile exists for this league. When no leagueId is supplied
        // (the dominant browse case), the league-specific join is skipped to avoid
        // a wasted index lookup that always returns NULL.
        // hitter_avg_ppg / pitching_avg_ppg are stored columns on player_scoring_cache
        // so the SELECT is a column read instead of per-row arithmetic.
        const includeLeagueJoin =
          leagueIdParam !== null && leagueIdParam !== undefined;
        const leagueJoin = includeLeagueJoin
          ? sql`LEFT JOIN public.player_scoring_cache cs_league
              ON cs_league.player_id = p.id AND cs_league.league_id = ${leagueIdParam}`
          : sql``;
        const pickCol = (col: string): SQL =>
          includeLeagueJoin
            ? sql`COALESCE(cs_league.${sql.raw(col)}, cs_default.${sql.raw(col)}, 0)`
            : sql`COALESCE(cs_default.${sql.raw(col)}, 0)`;
        const battingScoreExpr = pickCol('batting_score');
        const pitchingScoreExpr = pickCol('pitching_score');
        const fieldingScoreExpr = pickCol('fielding_score');
        const totalScoreExpr = pickCol('total_score');
        const careerGamesExpr = pickCol('career_games');
        const avgPpgExpr = pickCol('avg_ppg');
        const hitterAvgPpgExpr = pickCol('hitter_avg_ppg');
        const pitchingAvgPpgExpr = pickCol('pitching_avg_ppg');

        const scoringQuery = sql`
          SELECT
            p.id, p.first_name, p.last_name, p.bref_id, p.stats_last_fetched_at,
            p.all_star_selections, p.gold_gloves, p.silver_sluggers,
            p.mvp_awards, p.cy_young_awards, p.world_series_rings,
            p.hall_of_fame, p.rookie_of_the_year, p.total_games, p.mlb_player_id,
            p.bat_hand, p.throw_hand,
            p.sport, p.pfr_id, p.pfa_id, p.is_dst, p.nfl_team, p.position, p.jersey_number,
            p.news,
            p.projected_fantasy_points, p.adp_rank, p.mlb_team,
            ${battingScoreExpr} AS batting_score,
            ${pitchingScoreExpr} AS pitching_score,
            ${fieldingScoreExpr} AS fielding_score,
            ${battingScoreExpr} + ${fieldingScoreExpr} AS hitter_score,
            ${totalScoreExpr} AS total_score,
            ${careerGamesExpr} AS career_games,
            ${avgPpgExpr} AS avg_ppg,
            ${hitterAvgPpgExpr} AS hitter_avg_ppg,
            ${pitchingAvgPpgExpr} AS pitching_avg_ppg
          FROM public.players p
          ${leagueJoin}
          LEFT JOIN public.player_scoring_cache cs_default
            ON cs_default.player_id = p.id AND cs_default.league_id IS NULL
          ${careerStatJoin}
          ${whereClause}
          ORDER BY ${orderByClause}
          ${limitClause}
          ${offsetClause}
        `;

        const result = await db.execute(scoringQuery);
        const rows = result.rows as unknown as ScoringResultRow[];

        return rows.map((row) => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          brefId: row.bref_id,
          statsLastFetchedAt: row.stats_last_fetched_at
            ? new Date(row.stats_last_fetched_at)
            : null,
          allStarSelections: row.all_star_selections ?? 0,
          goldGloves: row.gold_gloves ?? 0,
          silverSluggers: row.silver_sluggers ?? 0,
          mvpAwards: row.mvp_awards ?? 0,
          cyYoungAwards: row.cy_young_awards ?? 0,
          worldSeriesRings: row.world_series_rings ?? 0,
          hallOfFame: row.hall_of_fame ?? false,
          rookieOfTheYear: row.rookie_of_the_year ?? false,
          totalGames: row.total_games ?? 0,
          mlbPlayerId: row.mlb_player_id ?? null,
          batHand: row.bat_hand ?? null,
          throwHand: row.throw_hand ?? null,
          sport: row.sport ?? 'baseball',
          pfrId: row.pfr_id ?? null,
          pfaId: row.pfa_id ?? null,
          isDst: row.is_dst ?? false,
          nflTeam: row.nfl_team ?? null,
          position: toPlayerPosition(row.position),
          jerseyNumber: row.jersey_number ?? null,
          news: row.news ?? null,
          projectedFantasyPoints: row.projected_fantasy_points ?? null,
          adpRank: row.adp_rank ?? null,
          mlbTeam: row.mlb_team ?? null,
          scoring: {
            playerId: row.id,
            battingScore: Number(row.batting_score) || 0,
            pitchingScore: Number(row.pitching_score) || 0,
            fieldingScore: Number(row.fielding_score) || 0,
            hitterScore: Number(row.hitter_score) || 0,
            totalScore: Number(row.total_score) || 0,
            careerGames: Number(row.career_games) || 0,
            avgPpg: Number(row.avg_ppg) || 0,
            hitterAvgPpg: Number(row.hitter_avg_ppg) || 0,
            pitchingAvgPpg: Number(row.pitching_avg_ppg) || 0,
          },
        }));
      },
    );
  }

  /**
   * Build a raw SQL era filter condition.
   *
   * A player "belongs" to an era when they have played at least one qualifying
   * batting or pitching season (AL/NL) within the era's year range. This is an
   * inclusive overlap — a player whose career spans multiple eras will appear in
   * all applicable era pools.
   *
   * Returns null when no era restriction should be applied ('all' or no filter).
   */
  private buildRawEraFilter(filters?: PlayerFilters): SQL | null {
    const eraFilter = filters?.baseballEraFilter;
    if (!eraFilter || eraFilter === 'all') return null;

    let startYear: number;
    let endYear: number;

    if (eraFilter === 'custom') {
      if (!filters?.customEraStartYear || !filters?.customEraEndYear)
        return null;
      startYear = filters.customEraStartYear;
      endYear = filters.customEraEndYear;
    } else {
      const range = getPresetEraRange(eraFilter);
      if (!range) return null;
      [startYear, endYear] = range;
    }

    // Include a player if they have ANY AL/NL batting or pitching season within [startYear, endYear]
    return sql`p.id IN (
      SELECT DISTINCT player_id FROM public.season_batting
      WHERE lg_id IN ('AL', 'NL')
        AND season >= ${startYear}
        AND season <= ${endYear}
      UNION
      SELECT DISTINCT player_id FROM public.season_pitching
      WHERE lg_id IN ('AL', 'NL')
        AND season >= ${startYear}
        AND season <= ${endYear}
    )`;
  }

  /**
   * Build a position filter SQL condition using raw SQL with alias "p.id".
   * Used by getPlayersWithScoringSort where the table is aliased as "p".
   */
  private buildRawPositionFilter(pos: string): SQL {
    if (pos === 'HITTER') {
      // Hitters: no positions at all OR at least one non-pitcher position
      return sql`(
        NOT EXISTS (SELECT 1 FROM public.player_eligible_positions WHERE player_id = p.id)
        OR EXISTS (
          SELECT 1 FROM public.player_eligible_positions
          WHERE player_id = p.id AND position NOT IN ('SP', 'RP')
        )
      )`;
    }
    const posMap: Record<string, string[]> = {
      P: ['SP', 'RP'],
      OF: ['LF', 'CF', 'RF'],
      DH: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'],
    };
    const positions = posMap[pos] ?? [pos];
    const placeholders = positions.map((p) => sql`${p}`);

    return sql`p.id IN (
      SELECT player_id FROM public.player_eligible_positions
      WHERE position IN (${sql.join(placeholders, sql`, `)})
    )`;
  }

  /**
   * Build a position filter SQL condition.
   * Extracted to share between getPlayers and getPlayersWithScoringSort.
   */
  private buildPositionFilter(db: PublicDb, pos: string): SQL {
    if (pos === 'HITTER') {
      return sql`(
        NOT EXISTS (SELECT 1 FROM public.player_eligible_positions WHERE player_id = ${PublicSchema.players.id})
        OR EXISTS (
          SELECT 1 FROM public.player_eligible_positions
          WHERE player_id = ${PublicSchema.players.id} AND position NOT IN ('SP', 'RP')
        )
      )`;
    } else if (pos === 'P') {
      return inArray(
        PublicSchema.players.id,
        db
          .select({ id: PublicSchema.playerEligiblePositions.playerId })
          .from(PublicSchema.playerEligiblePositions)
          .where(
            inArray(PublicSchema.playerEligiblePositions.position, [
              'SP',
              'RP',
            ] as const),
          ),
      );
    } else if (pos === 'OF') {
      return inArray(
        PublicSchema.players.id,
        db
          .select({ id: PublicSchema.playerEligiblePositions.playerId })
          .from(PublicSchema.playerEligiblePositions)
          .where(
            inArray(PublicSchema.playerEligiblePositions.position, [
              'LF',
              'CF',
              'RF',
            ] as const),
          ),
      );
    } else if (pos === 'DH') {
      return inArray(
        PublicSchema.players.id,
        db
          .select({ id: PublicSchema.playerEligiblePositions.playerId })
          .from(PublicSchema.playerEligiblePositions)
          .where(
            inArray(PublicSchema.playerEligiblePositions.position, [
              'C',
              '1B',
              '2B',
              '3B',
              'SS',
              'LF',
              'CF',
              'RF',
            ] as const),
          ),
      );
    } else {
      return inArray(
        PublicSchema.players.id,
        db
          .select({ id: PublicSchema.playerEligiblePositions.playerId })
          .from(PublicSchema.playerEligiblePositions)
          .where(
            eq(
              PublicSchema.playerEligiblePositions.position,
              pos as (typeof PublicSchema.playerEligiblePositions.position.enumValues)[number],
            ),
          ),
      );
    }
  }
}

/**
 * Factory function to create PlayerService instance
 */
export function createPlayerService(options: DbOptions): PlayerService {
  return new PlayerService(options);
}
