import { and, count, eq, ilike, inArray, ne, or, sql, SQL } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { runWithPublicClient } from '../client/Helpers';
import { PublicDb, PublicSchema } from '../client/PublicDbClient';
import { Player } from '../../types/DatabaseTypes';
import { PlayerCareerScore } from '../../types/ScoringTypes';

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
  // Career achievement columns
  all_star_selections: number | null;
  gold_gloves: number | null;
  silver_sluggers: number | null;
  mvp_awards: number | null;
  cy_young_awards: number | null;
  world_series_rings: number | null;
  hall_of_fame: boolean | null;
  rookie_of_the_year: boolean | null;
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
  | 'pitchingAvgPointsPerGame';

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
    return runWithPublicClient(this.options, async (db): Promise<Player[]> => {
      let queryBuilder = db.select().from(PublicSchema.players);

      const careerSortOptions: CareerStatOrderBy[] = [
        'careerGames',
        'careerHits',
        'careerHomeRuns',
        'careerRBI',
        'careerRuns',
        'careerStolenBases',
      ];
      const scoringSortOptions: ScoringOrderBy[] = [
        'totalScore',
        'avgPointsPerGame',
        'battingScore',
        'pitchingScore',
        'fieldingScore',
        'hitterScore',
        'hitterAvgPointsPerGame',
        'pitchingAvgPointsPerGame',
      ];
      const isCareerSort = careerSortOptions.includes(
        queryOptions.orderBy as CareerStatOrderBy,
      );
      const isScoringSort = scoringSortOptions.includes(
        queryOptions.orderBy as ScoringOrderBy,
      );

      if (isCareerSort) {
        queryBuilder = queryBuilder.leftJoin(
          PublicSchema.careerBatting,
          eq(PublicSchema.players.id, PublicSchema.careerBatting.playerId),
        ) as unknown as typeof queryBuilder;
      }

      // For scoring-based sorts, redirect to the dedicated method
      if (isScoringSort) {
        return this.getPlayersWithScoringSort(
          queryOptions,
        ) as unknown as Player[];
      }

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildPlayerFilters(queryOptions.filters)
        : [];

      if (queryOptions.filters?.position) {
        const pos = queryOptions.filters.position;

        if (pos === 'HITTER') {
          // Hitters: players with no positions at all OR at least one non-pitcher position.
          // Excludes pure SP/RP-only players.
          conditions.push(
            sql`(
              NOT EXISTS (SELECT 1 FROM public.player_eligible_positions WHERE player_id = ${PublicSchema.players.id})
              OR EXISTS (
                SELECT 1 FROM public.player_eligible_positions
                WHERE player_id = ${PublicSchema.players.id} AND position NOT IN ('SP', 'RP')
              )
            )`,
          );
        } else if (pos === 'P') {
          // Pitchers (SP, RP, P)
          conditions.push(
            inArray(
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
            ),
          );
        } else if (pos === 'OF') {
          // Outfielders (LF, CF, RF, OF)
          conditions.push(
            inArray(
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
            ),
          );
        } else if (pos === 'DH') {
          // DH is a roster slot, not a fielding position in the DB.
          // Any non-pitcher (player with a batting position) is DH-eligible.
          conditions.push(
            inArray(
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
            ),
          );
        } else {
          // Specific position
          conditions.push(
            inArray(
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
            ),
          );
        }
      }

      // Build final query parts
      let orderColumn;
      if (queryOptions.orderBy) {
        if (queryOptions.orderBy === 'careerGames') {
          orderColumn = PublicSchema.careerBatting.g;
        } else if (queryOptions.orderBy === 'careerHits') {
          orderColumn = PublicSchema.careerBatting.h;
        } else if (queryOptions.orderBy === 'careerHomeRuns') {
          orderColumn = PublicSchema.careerBatting.hr;
        } else if (queryOptions.orderBy === 'careerRBI') {
          orderColumn = PublicSchema.careerBatting.rbi;
        } else if (queryOptions.orderBy === 'careerRuns') {
          orderColumn = PublicSchema.careerBatting.r;
        } else if (queryOptions.orderBy === 'careerStolenBases') {
          orderColumn = PublicSchema.careerBatting.sb;
        } else {
          // Only plain player-table columns reach here (scoring sorts
          // are redirected above via isScoringSort)
          const playerKey = queryOptions.orderBy as
            | 'id'
            | 'firstName'
            | 'lastName'
            | 'brefId';
          orderColumn = PublicSchema.players[playerKey];
        }
      }

      const orderDirection = queryOptions.orderDirection || 'asc';

      // Execute query with all conditions
      let finalQuery = queryBuilder;

      if (conditions.length > 0) {
        // TypeScript has issues with Drizzle's complex query builder types
        // This is a safe cast since we know the query is valid
        finalQuery = finalQuery.where(and(...conditions)) as typeof finalQuery;
      }

      if (orderColumn) {
        // Need to specify the table for sorting if joined
        // Use nullsLast to keep players with no stats at the bottom
        // Using sql templates because .nullsLast() is failing at runtime in lambda
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery.orderBy(
                sql`${orderColumn} DESC NULLS LAST`,
              ) as typeof finalQuery)
            : (finalQuery.orderBy(
                sql`${orderColumn} ASC NULLS LAST`,
              ) as typeof finalQuery);
      }

      if (queryOptions.limit) {
        finalQuery = finalQuery.limit(queryOptions.limit) as typeof finalQuery;
      }

      if (queryOptions.offset) {
        finalQuery = finalQuery.offset(
          queryOptions.offset,
        ) as typeof finalQuery;
      }

      const result = await finalQuery.execute();

      // If we joined, the result structure might be different (e.g. { players: ..., career_batting: ... })
      // Or Drizzle might return flattened result if not using select({ ... })
      // Drizzle usually returns objects based on the tables.
      // If returning joined result, we have to map back to Player[].
      // Since we started with db.select().from(players), if we don't specify fields, it returns players.*
      // But let's verify if Drizzle changes return type on join.
      // Usually yes.
      if (isCareerSort) {
        // If we joined, Drizzle returns { players: Player, career_batting: CareerBatting }
        return (result as unknown as Array<{ players: Player }>).map(
          (row) => row.players,
        );
      }
      return result as Player[];
    });
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
   * Search players by name (searches both first and last names)
   */
  async searchPlayers(searchTerm: string, limit = 10): Promise<Player[]> {
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.players)
        .where(
          or(
            ilike(PublicSchema.players.firstName, `%${searchTerm}%`),
            ilike(PublicSchema.players.lastName, `%${searchTerm}%`),
          ),
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
      const nameCondition = or(firstNameCondition, lastNameCondition);
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
   * Internal: query players with a lateral join to the compute_career_scores
   * SQL function, enabling ORDER BY on any scoring column.
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
        const orderByKey = queryOptions.orderBy || 'avgPointsPerGame';
        const sortDir =
          queryOptions.orderDirection === 'asc' ? sql`ASC` : sql`DESC`;
        // derived expression columns that are not direct CS columns
        const orderByClause =
          orderByKey === 'hitterScore'
            ? sql`COALESCE(cs.batting_score + cs.fielding_score, 0) ${sortDir}`
            : orderByKey === 'hitterAvgPointsPerGame'
              ? sql`COALESCE(CASE WHEN cs.career_games > 0 THEN (cs.batting_score + cs.fielding_score) / cs.career_games ELSE 0 END, 0) ${sortDir}`
              : orderByKey === 'pitchingAvgPointsPerGame'
                ? sql`COALESCE(CASE WHEN cs.career_games > 0 THEN cs.pitching_score / cs.career_games ELSE 0 END, 0) ${sortDir}`
                : sql`COALESCE(cs.${sql.raw(scoringColumnMap[orderByKey] || 'avg_ppg')}, 0) ${sortDir}`;

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

        const whereClause =
          rawConditions.length > 0
            ? sql`WHERE ${sql.join(rawConditions, sql` AND `)}`
            : sql``;

        // Use raw SQL to join players with the scoring function.
        const limitClause = queryOptions.limit
          ? sql`LIMIT ${sql.raw(String(queryOptions.limit))}`
          : sql``;
        const offsetClause = queryOptions.offset
          ? sql`OFFSET ${sql.raw(String(queryOptions.offset))}`
          : sql``;

        const scoringQuery = sql`
          SELECT
            p.id, p.first_name, p.last_name, p.bref_id, p.stats_last_fetched_at,
            p.all_star_selections, p.gold_gloves, p.silver_sluggers,
            p.mvp_awards, p.cy_young_awards, p.world_series_rings,
            p.hall_of_fame, p.rookie_of_the_year,
            COALESCE(cs.batting_score, 0) AS batting_score,
            COALESCE(cs.pitching_score, 0) AS pitching_score,
            COALESCE(cs.fielding_score, 0) AS fielding_score,
            COALESCE(cs.batting_score, 0) + COALESCE(cs.fielding_score, 0) AS hitter_score,
            COALESCE(cs.total_score, 0) AS total_score,
            COALESCE(cs.career_games, 0) AS career_games,
            COALESCE(cs.avg_ppg, 0) AS avg_ppg,
            CASE WHEN cs.career_games > 0 THEN (cs.batting_score + cs.fielding_score) / cs.career_games ELSE 0 END AS hitter_avg_ppg,
            CASE WHEN cs.career_games > 0 THEN cs.pitching_score / cs.career_games ELSE 0 END AS pitching_avg_ppg
          FROM public.players p
          LEFT JOIN public.compute_career_scores(${leagueIdParam}) cs
            ON p.id = cs.player_id
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
