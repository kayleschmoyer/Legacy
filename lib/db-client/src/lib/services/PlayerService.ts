import { and, count, eq, ilike, inArray, ne, or, sql, SQL } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
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
  // Football identity columns (LS-246)
  sport: 'baseball' | 'football';
  pfr_id: string | null;
  is_dst: boolean;
  nfl_team: string | null;
  position: string | null;
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
   * Restrict the pool to players whose careers overlapped with the given
   * baseball era. 'all' (default) imposes no restriction.
   *
   * dead_ball   : seasons before 1920
   * golden_age  : 1920-1960
   * expansion   : 1961-1976
   * free_agency : 1977-1993
   * steroid_era : 1994-2005
   * modern      : 2006+
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
    return (await this.getPlayersWithScoringSort(
      queryOptions,
    )) as unknown as Player[];
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
   * Search players by name (searches first name, last name, and full name)
   */
  async searchPlayers(
    searchTerm: string,
    limit = 10,
    sport?: 'baseball' | 'football',
  ): Promise<Player[]> {
    return runWithPublicClient(this.options, async (db) => {
      const nameCondition = or(
        ilike(PublicSchema.players.firstName, `%${searchTerm}%`),
        ilike(PublicSchema.players.lastName, `%${searchTerm}%`),
        sql`(${PublicSchema.players.firstName} || ' ' || ${PublicSchema.players.lastName}) ILIKE ${'%' + searchTerm + '%'}`,
      );

      const whereCondition = sport
        ? and(nameCondition, eq(PublicSchema.players.sport, sport))
        : nameCondition;

      return db
        .select()
        .from(PublicSchema.players)
        .where(whereCondition)
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
            )`,
          );
        }

        const isPitcherPos = ['P', 'SP', 'RP'].includes(
          queryOptions.filters?.position ?? '',
        );

        if (
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
            p.sport, p.pfr_id, p.is_dst, p.nfl_team, p.position,
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
          isDst: row.is_dst ?? false,
          nflTeam: row.nfl_team ?? null,
          position: toPlayerPosition(row.position),
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

    // Map preset era names to year ranges
    const eraRanges: Record<string, [number, number]> = {
      dead_ball: [1871, 1919],
      golden_age: [1920, 1960],
      expansion: [1961, 1976],
      free_agency: [1977, 1993],
      steroid_era: [1994, 2005],
      modern: [2006, 9999],
    };

    let startYear: number;
    let endYear: number;

    if (eraFilter === 'custom') {
      if (!filters?.customEraStartYear || !filters?.customEraEndYear)
        return null;
      startYear = filters.customEraStartYear;
      endYear = filters.customEraEndYear;
    } else {
      const range = eraRanges[eraFilter];
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
