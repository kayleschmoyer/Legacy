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
  total_score: string | null;
  career_games: string | null;
  avg_ppg: string | null;
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
  | 'fieldingScore';

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

        if (pos === 'P') {
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
        const sortColumn =
          scoringColumnMap[queryOptions.orderBy || 'avgPointsPerGame'] ||
          'avg_ppg';
        const sortDir =
          queryOptions.orderDirection === 'asc' ? sql`ASC` : sql`DESC`;

        // Build WHERE conditions
        const conditions = queryOptions.filters
          ? this.buildPlayerFilters(queryOptions.filters)
          : [];

        // Position filtering
        if (queryOptions.filters?.position) {
          conditions.push(
            this.buildPositionFilter(db, queryOptions.filters.position),
          );
        }

        const whereClause =
          conditions.length > 0 ? and(...conditions) : undefined;

        // Use raw SQL to join players with the scoring function.
        // This is necessary because Drizzle doesn't support set-returning
        // function calls as join targets.
        const limitClause = queryOptions.limit
          ? sql`LIMIT ${sql.raw(String(queryOptions.limit))}`
          : sql``;
        const offsetClause = queryOptions.offset
          ? sql`OFFSET ${sql.raw(String(queryOptions.offset))}`
          : sql``;

        // Build a Drizzle-compatible query that selects from players
        // and joins with the scoring function
        const scoringQuery = sql`
          SELECT
            p.id, p.first_name, p.last_name, p.bref_id, p.stats_last_fetched_at,
            cs.batting_score, cs.pitching_score, cs.fielding_score,
            cs.total_score, cs.career_games, cs.avg_ppg
          FROM public.players p
          LEFT JOIN public.compute_career_scores(${leagueIdParam}) cs
            ON p.id = cs.player_id
          ${whereClause ? sql`WHERE ${whereClause}` : sql``}
          ORDER BY cs.${sql.raw(sortColumn)} ${sortDir} NULLS LAST
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
          scoring: {
            playerId: row.id,
            battingScore: Number(row.batting_score) || 0,
            pitchingScore: Number(row.pitching_score) || 0,
            fieldingScore: Number(row.fielding_score) || 0,
            totalScore: Number(row.total_score) || 0,
            careerGames: Number(row.career_games) || 0,
            avgPpg: Number(row.avg_ppg) || 0,
          },
        }));
      },
    );
  }

  /**
   * Build a position filter SQL condition.
   * Extracted to share between getPlayers and getPlayersWithScoringSort.
   */
  private buildPositionFilter(db: PublicDb, pos: string): SQL {
    if (pos === 'P') {
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
