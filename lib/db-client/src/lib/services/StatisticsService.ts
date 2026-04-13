import { and, asc, count, desc, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { DbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';
import {
  CareerBatting,
  CareerFielding,
  CareerPitching,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from '../../types/DatabaseTypes';
import {
  CareerBattingQueryBuilder,
  QueryOptions,
  StatisticsQueryFilters,
} from '../query-builders/TypeSafeQueryBuilder';

// Type-safe column access helpers with proper Drizzle types
// These functions safely access Drizzle table columns by name for sorting

type TableColumns<T> = T extends { [K: string]: AnyPgColumn } ? T : never;

function getBattingColumn(columnName: string): AnyPgColumn | undefined {
  const columns = PublicSchema.seasonBatting as TableColumns<
    typeof PublicSchema.seasonBatting
  >;
  const column = columns[columnName as keyof typeof columns];
  return column;
}

function getPitchingColumn(columnName: string): AnyPgColumn | undefined {
  const columns = PublicSchema.seasonPitching as TableColumns<
    typeof PublicSchema.seasonPitching
  >;
  const column = columns[columnName as keyof typeof columns];
  return column;
}

function getFieldingColumn(columnName: string): AnyPgColumn | undefined {
  const columns = PublicSchema.seasonFielding as TableColumns<
    typeof PublicSchema.seasonFielding
  >;
  const column = columns[columnName as keyof typeof columns];
  return column;
}

export interface StatisticsFilters {
  playerId?: number;
  minGames?: number;
  minHomeRuns?: number;
  minRBI?: number;
  minWins?: number;
  minStrikeouts?: number;
  minBattingAvg?: number;
  searchTerm?: string;
  position?: string;
}

export interface SeasonStatisticsFilters {
  playerId?: number;
  season?: number;
  team?: string;
  lgId?: string;
  minGames?: number;
  minHomeRuns?: number;
  minRBI?: number;
  minWins?: number;
  minStrikeouts?: number;
}

/**
 * A single "On This Day" entry representing a notable historical
 * batting or pitching performance on a specific calendar date.
 */
export interface OnThisDayEntry {
  entryType: 'batting' | 'pitching';
  playerId: number;
  firstName: string;
  lastName: string;
  brefId: string;
  season: number;
  gameIdentifier: string;
  // Batting fields
  hr: number | null;
  rbi: number | null;
  hits: number | null;
  doubles: number | null;
  triples: number | null;
  atBats: number | null;
  baseOnBalls: number | null;
  runs: number | null;
  // Pitching fields
  strikeouts: number | null;
  inningsPitched: number | null;
  earnedRuns: number | null;
  saves: number | null;
  wins: number | null;
  hitsAllowed: number | null;
  walksAllowed: number | null;
}

/**
 * A single "On This Day" event (signing, trade, or milestone) sourced from
 * the MLB Stats API transactions endpoint.
 */
export interface OnThisDayEventEntry {
  id: number;
  month: number;
  day: number;
  year: number;
  eventType: string;
  description: string;
  playerId: number | null;
  playerName: string | null;
  fromTeam: string | null;
  toTeam: string | null;
}

export interface StatisticsQueryOptions {
  filters?: StatisticsFilters;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface SeasonStatisticsQueryOptions {
  filters?: SeasonStatisticsFilters;
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Statistics service functions for database operations on career statistics
 */
export class StatisticsService {
  constructor(private options: DbOptions) {}

  /**
   * Convert legacy StatisticsQueryOptions to new TypeSafe interfaces
   */
  private convertToTypeSafeOptions(queryOptions: StatisticsQueryOptions = {}): {
    filters: StatisticsQueryFilters;
    options: QueryOptions;
  } {
    const filters: StatisticsQueryFilters = {
      playerId: queryOptions.filters?.playerId,
      minGames: queryOptions.filters?.minGames,
      minHomeRuns: queryOptions.filters?.minHomeRuns,
      minRBI: queryOptions.filters?.minRBI,
      minBattingAvg: queryOptions.filters?.minBattingAvg,
      minWins: queryOptions.filters?.minWins,
      minStrikeouts: queryOptions.filters?.minStrikeouts,
      searchTerm: queryOptions.filters?.searchTerm,
      position: queryOptions.filters?.position,
    };

    const options: QueryOptions = {
      orderBy: queryOptions.orderBy as QueryOptions['orderBy'],
      orderDirection: queryOptions.orderDirection || 'desc',
      limit: queryOptions.limit,
      offset: queryOptions.offset,
    };

    return { filters, options };
  }

  /**
   * Get career batting statistics with optional filtering and pagination
   * Updated to use TypeSafe query builders
   */
  async getCareerBattingStats(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<CareerBatting[]> {
    return runWithPublicClient(
      this.options,
      async (db): Promise<CareerBatting[]> => {
        // Convert legacy options to TypeSafe format
        const { filters, options } =
          this.convertToTypeSafeOptions(queryOptions);

        // Use the TypeSafe query builder - eliminates all 'any' type assertions
        const queryBuilder = new CareerBattingQueryBuilder(db);
        const results = await queryBuilder.executeQuery(filters, options);

        // Transform joined results to match expected CareerBatting format
        // Drizzle returns results from joins as { tableName: data } structure
        return results.map((result) => {
          // Check if this is a joined result (has career_batting property)
          if (
            result &&
            typeof result === 'object' &&
            'career_batting' in result
          ) {
            // Extract the career_batting data from the joined result
            return (result as { career_batting: CareerBatting }).career_batting;
          }
          // For non-joined queries, the result is already in the correct format
          return result as CareerBatting;
        });
      },
    );
  }

  /**
   * Get the total count of career batting statistics records matching the given filters.
   * Uses the same filters as getCareerBattingStats but returns only the count
   */
  async getCareerBattingStatsCount(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<number> {
    return runWithPublicClient(this.options, async (db): Promise<number> => {
      const queryBuilder = new CareerBattingQueryBuilder(db);

      // Use the same type-safe filters as getCareerBattingStats
      const typeSafeOptions = this.convertToTypeSafeOptions(queryOptions);

      // Dispatch to the correct count method based on which filters are active
      if (
        typeSafeOptions.filters?.searchTerm &&
        typeSafeOptions.filters?.position
      ) {
        const result = await queryBuilder.countWithBothJoins(typeSafeOptions);
        return result[0]?.count ?? 0;
      } else if (typeSafeOptions.filters?.searchTerm) {
        const result = await queryBuilder.countWithPlayerJoin(typeSafeOptions);
        return result[0]?.count ?? 0;
      } else if (typeSafeOptions.filters?.position) {
        const result =
          await queryBuilder.countWithPositionJoin(typeSafeOptions);
        return result[0]?.count ?? 0;
      } else {
        const result = await queryBuilder.countWithoutJoin(typeSafeOptions);
        return result[0]?.count ?? 0;
      }
    });
  }

  /**
   * Get career pitching statistics with optional filtering and pagination
   */
  async getCareerPitchingStats(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<CareerPitching[]> {
    return runWithPublicClient(
      this.options,
      async (db): Promise<CareerPitching[]> => {
        // When sorting by player name, use a join-based query
        if (queryOptions.orderBy === 'lastName') {
          const conditions = queryOptions.filters
            ? this.buildPitchingFilters(queryOptions.filters)
            : [];
          const orderDirection = queryOptions.orderDirection || 'desc';

          const validConditions = conditions.filter(
            (condition): condition is SQL => condition !== undefined,
          );
          const baseJoinQuery = db
            .select()
            .from(PublicSchema.careerPitching)
            .innerJoin(
              PublicSchema.players,
              eq(PublicSchema.careerPitching.playerId, PublicSchema.players.id),
            );

          const withConditions =
            validConditions.length > 0
              ? baseJoinQuery.where(
                  validConditions.length === 1
                    ? validConditions[0]
                    : and(...validConditions),
                )
              : baseJoinQuery;

          const withOrder =
            orderDirection === 'desc'
              ? withConditions.orderBy(
                  desc(PublicSchema.players.lastName),
                  desc(PublicSchema.players.firstName),
                )
              : withConditions.orderBy(
                  asc(PublicSchema.players.lastName),
                  asc(PublicSchema.players.firstName),
                );

          const withLimit = queryOptions.limit
            ? withOrder.limit(queryOptions.limit)
            : withOrder;
          const withOffset =
            queryOptions.offset && queryOptions.limit
              ? withLimit.offset(queryOptions.offset)
              : withLimit;

          const results = await withOffset.execute();
          return results.map((r) => r.career_pitching as CareerPitching);
        }

        const conditions = queryOptions.filters
          ? this.buildPitchingFilters(queryOptions.filters)
          : [];

        const orderDirection = queryOptions.orderDirection || 'desc';

        const getOrderByClause = () => {
          const dir = orderDirection === 'desc' ? 'DESC' : 'ASC';
          switch (queryOptions.orderBy) {
            case 'wins':
              return sql`${PublicSchema.careerPitching.w} ${sql.raw(dir)} NULLS LAST`;
            case 'losses':
              return sql`${PublicSchema.careerPitching.l} ${sql.raw(dir)} NULLS LAST`;
            case 'strikeouts':
              return sql`${PublicSchema.careerPitching.so} ${sql.raw(dir)} NULLS LAST`;
            case 'era':
              return sql`${PublicSchema.careerPitching.era} ${sql.raw(dir)} NULLS LAST`;
            case 'games':
              return sql`${PublicSchema.careerPitching.g} ${sql.raw(dir)} NULLS LAST`;
            case 'gamesStarted':
              return sql`${PublicSchema.careerPitching.gs} ${sql.raw(dir)} NULLS LAST`;
            case 'completeGames':
              return sql`${PublicSchema.careerPitching.cg} ${sql.raw(dir)} NULLS LAST`;
            case 'shutouts':
              return sql`${PublicSchema.careerPitching.sho} ${sql.raw(dir)} NULLS LAST`;
            case 'saves':
              return sql`${PublicSchema.careerPitching.sv} ${sql.raw(dir)} NULLS LAST`;
            case 'baseOnBalls':
              return sql`${PublicSchema.careerPitching.bb} ${sql.raw(dir)} NULLS LAST`;
            case 'hits':
              return sql`${PublicSchema.careerPitching.h} ${sql.raw(dir)} NULLS LAST`;
            case 'earnedRuns':
              return sql`${PublicSchema.careerPitching.er} ${sql.raw(dir)} NULLS LAST`;
            case 'homeRuns':
              return sql`${PublicSchema.careerPitching.hr} ${sql.raw(dir)} NULLS LAST`;
            default:
              return sql`${PublicSchema.careerPitching.w} DESC NULLS LAST`;
          }
        };

        const searchTerm = queryOptions.filters?.searchTerm;

        if (searchTerm) {
          // JOIN with players table to enable name search
          const searchPattern = `%${searchTerm}%`;
          const searchCondition = or(
            ilike(PublicSchema.players.firstName, searchPattern),
            ilike(PublicSchema.players.lastName, searchPattern),
          );
          const allConditions = searchCondition
            ? [...conditions, searchCondition]
            : conditions;

          const whereClause =
            allConditions.length === 1
              ? allConditions[0]
              : allConditions.length > 1
                ? and(...allConditions)
                : undefined;

          // Use plain .select() so Drizzle returns { career_pitching: {...}, players: {...} }
          const baseQuery = db
            .select()
            .from(PublicSchema.careerPitching)
            .innerJoin(
              PublicSchema.players,
              eq(PublicSchema.careerPitching.playerId, PublicSchema.players.id),
            );

          const withWhere = whereClause
            ? baseQuery.where(whereClause)
            : baseQuery;
          const orderClause = getOrderByClause();
          const withOrder = withWhere.orderBy(orderClause);
          const withLimit = queryOptions.limit
            ? withOrder.limit(queryOptions.limit)
            : withOrder;
          const withOffset = queryOptions.offset
            ? withLimit.offset(queryOptions.offset)
            : withLimit;

          const results = await withOffset.execute();
          // Drizzle returns joined rows as { career_pitching: ..., players: ... }
          return results.map((result) => {
            if (
              result &&
              typeof result === 'object' &&
              'career_pitching' in result
            ) {
              return (result as unknown as { career_pitching: CareerPitching })
                .career_pitching;
            }
            return result as unknown as CareerPitching;
          });
        }

        // No search — simple query without JOIN
        let finalQuery = db.select().from(PublicSchema.careerPitching);

        if (conditions.length > 0) {
          const validConditions = conditions.filter(
            (condition): condition is SQL => condition !== undefined,
          );
          if (validConditions.length > 0) {
            const whereClause =
              validConditions.length === 1
                ? validConditions[0]
                : and(...validConditions);
            finalQuery = finalQuery.where(whereClause) as typeof finalQuery;
          }
        }

        finalQuery = finalQuery.orderBy(
          getOrderByClause(),
        ) as typeof finalQuery;

        if (queryOptions.limit) {
          finalQuery = finalQuery.limit(
            queryOptions.limit,
          ) as typeof finalQuery;
        }
        if (queryOptions.offset) {
          finalQuery = finalQuery.offset(
            queryOptions.offset,
          ) as typeof finalQuery;
        }

        return finalQuery.execute();
      },
    );
  }

  /**
   * Get career batting statistics for a specific player
   */
  async getPlayerCareerBatting(
    playerId: number,
  ): Promise<CareerBatting | null> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.careerBatting)
        .where(eq(PublicSchema.careerBatting.playerId, playerId))
        .limit(1);

      return results[0] || null;
    });
  }

  /**
   * Get career pitching statistics for a specific player
   */
  async getPlayerCareerPitching(
    playerId: number,
  ): Promise<CareerPitching | null> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.careerPitching)
        .where(eq(PublicSchema.careerPitching.playerId, playerId))
        .limit(1);

      return results[0] || null;
    });
  }

  /**
   * Get career fielding statistics with optional filtering and pagination
   */
  async getCareerFieldingStats(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<CareerFielding[]> {
    return runWithPublicClient(
      this.options,
      async (db): Promise<CareerFielding[]> => {
        const queryBuilder = db.select().from(PublicSchema.careerFielding);

        // Build WHERE clause
        const conditions = queryOptions.filters
          ? this.buildFieldingFilters(queryOptions.filters)
          : [];

        const orderDirection = queryOptions.orderDirection || 'desc';

        // Execute query with all conditions
        let finalQuery = queryBuilder;

        if (conditions.length > 0) {
          // Filter out any undefined conditions before passing to and()
          const validConditions = conditions.filter(
            (condition): condition is SQL => condition !== undefined,
          );
          if (validConditions.length > 0) {
            const whereClause =
              validConditions.length === 1
                ? validConditions[0]
                : and(...validConditions);
            finalQuery = finalQuery.where(whereClause) as typeof finalQuery;
          }
        }

        // Default ordering by games descending
        if (queryOptions.orderBy === 'games') {
          finalQuery =
            orderDirection === 'desc'
              ? (finalQuery.orderBy(
                  desc(PublicSchema.careerFielding.g),
                ) as typeof finalQuery)
              : (finalQuery.orderBy(
                  asc(PublicSchema.careerFielding.g),
                ) as typeof finalQuery);
        } else {
          // Default to games descending
          finalQuery = finalQuery.orderBy(
            desc(PublicSchema.careerFielding.g),
          ) as typeof finalQuery;
        }

        if (queryOptions.limit) {
          finalQuery = finalQuery.limit(
            queryOptions.limit,
          ) as typeof finalQuery;
        }

        if (queryOptions.offset) {
          finalQuery = finalQuery.offset(
            queryOptions.offset,
          ) as typeof finalQuery;
        }

        return finalQuery.execute();
      },
    );
  }

  /**
   * Get career fielding statistics for a specific player
   */
  async getPlayerCareerFielding(
    playerId: number,
  ): Promise<CareerFielding | null> {
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.careerFielding)
        .where(eq(PublicSchema.careerFielding.playerId, playerId))
        .then((rows) => rows[0] || null);
    });
  }

  /**
   * Get season batting statistics with optional filtering and pagination
   */
  async getSeasonBattingStats(
    queryOptions: SeasonStatisticsQueryOptions = {},
  ): Promise<SeasonBatting[]> {
    LOGGER.debug(
      '[StatisticsService.getSeasonBattingStats] queryOptions:',
      queryOptions,
    );
    return runWithPublicClient(this.options, async (db) => {
      // Drizzle query methods return new objects (immutable) — must reassign.
      let q = db.select().from(PublicSchema.seasonBatting);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildSeasonBattingFilters(queryOptions.filters)
        : [];

      LOGGER.debug(
        '[StatisticsService.getSeasonBattingStats] conditions count:',
        conditions.length,
      );

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter(
          (condition): condition is SQL => condition !== undefined,
        );
        LOGGER.debug(
          '[StatisticsService.getSeasonBattingStats] validConditions count:',
          validConditions.length,
        );
        if (validConditions.length > 0) {
          const whereClause =
            validConditions.length === 1
              ? validConditions[0]
              : and(...validConditions);
          q = q.where(whereClause) as typeof q;
        }
      }

      if (queryOptions.orderBy) {
        const column = getBattingColumn(queryOptions.orderBy);
        if (column) {
          q = q.orderBy(
            orderDirection === 'asc' ? asc(column) : desc(column),
          ) as typeof q;
        }
      }

      if (queryOptions.limit) {
        q = q.limit(queryOptions.limit) as typeof q;
      }

      if (queryOptions.offset) {
        q = q.offset(queryOptions.offset) as typeof q;
      }

      // Log the SQL query being generated
      const querySQL = q.toSQL();
      LOGGER.debug('[StatisticsService.getSeasonBattingStats] SQL:', querySQL);

      const results = await q;
      LOGGER.debug(
        '[StatisticsService.getSeasonBattingStats] results count:',
        results.length,
      );
      if (results.length > 0) {
        LOGGER.debug(
          '[StatisticsService.getSeasonBattingStats] first result:',
          results[0],
        );
      }
      return results;
    });
  }

  /**
   * Get season pitching statistics with optional filtering and pagination
   */
  async getSeasonPitchingStats(
    queryOptions: SeasonStatisticsQueryOptions = {},
  ): Promise<SeasonPitching[]> {
    return runWithPublicClient(this.options, async (db) => {
      // Drizzle query methods return new objects (immutable) — must reassign.
      let q = db.select().from(PublicSchema.seasonPitching);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildSeasonPitchingFilters(queryOptions.filters)
        : [];

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter(
          (condition): condition is SQL => condition !== undefined,
        );
        if (validConditions.length > 0) {
          const whereClause =
            validConditions.length === 1
              ? validConditions[0]
              : and(...validConditions);
          q = q.where(whereClause) as typeof q;
        }
      }

      if (queryOptions.orderBy) {
        const column = getPitchingColumn(queryOptions.orderBy);
        if (column) {
          q = q.orderBy(
            orderDirection === 'asc' ? asc(column) : desc(column),
          ) as typeof q;
        }
      }

      if (queryOptions.limit) {
        q = q.limit(queryOptions.limit) as typeof q;
      }

      if (queryOptions.offset) {
        q = q.offset(queryOptions.offset) as typeof q;
      }

      return q;
    });
  }

  /**
   * Get season fielding statistics with optional filtering and pagination
   */
  async getSeasonFieldingStats(
    queryOptions: SeasonStatisticsQueryOptions = {},
  ): Promise<SeasonFielding[]> {
    return runWithPublicClient(this.options, async (db) => {
      // Drizzle query methods return new objects (immutable) — must reassign.
      let q = db.select().from(PublicSchema.seasonFielding);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildSeasonFieldingFilters(queryOptions.filters)
        : [];

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter(
          (condition): condition is SQL => condition !== undefined,
        );
        if (validConditions.length > 0) {
          const whereClause =
            validConditions.length === 1
              ? validConditions[0]
              : and(...validConditions);
          q = q.where(whereClause) as typeof q;
        }
      }

      if (queryOptions.orderBy) {
        const column = getFieldingColumn(queryOptions.orderBy);
        if (column) {
          q = q.orderBy(
            orderDirection === 'asc' ? asc(column) : desc(column),
          ) as typeof q;
        }
      }

      if (queryOptions.limit) {
        q = q.limit(queryOptions.limit) as typeof q;
      }

      if (queryOptions.offset) {
        q = q.offset(queryOptions.offset) as typeof q;
      }

      return q;
    });
  }

  /**
   * Get season batting statistics for a specific player
   */
  async getPlayerSeasonBatting(playerId: number): Promise<SeasonBatting[]> {
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.seasonBatting)
        .where(eq(PublicSchema.seasonBatting.playerId, playerId))
        .orderBy(desc(PublicSchema.seasonBatting.season));
    });
  }

  /**
   * Get season pitching statistics for a specific player
   */
  async getPlayerSeasonPitching(playerId: number): Promise<SeasonPitching[]> {
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.seasonPitching)
        .where(eq(PublicSchema.seasonPitching.playerId, playerId))
        .orderBy(desc(PublicSchema.seasonPitching.season));
    });
  }

  /**
   * Get season fielding statistics for a specific player
   */
  async getPlayerSeasonFielding(playerId: number): Promise<SeasonFielding[]> {
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.seasonFielding)
        .where(eq(PublicSchema.seasonFielding.playerId, playerId))
        .orderBy(desc(PublicSchema.seasonFielding.season));
    });
  }

  /**
   * Get "On This Day" notable game performances for a specific calendar date.
   *
   * Finds historically notable batting and pitching performances on the given
   * month/day across all seasons in the database.  Notable is defined as:
   *   - Batting:  ≥ 1 HR, ≥ 3 hits, or ≥ 4 RBI
   *   - Pitching: ≥ 10 K, ≥ 7 IP with 0 ER, or a save recorded
   *
   * @param month - Calendar month, 1-indexed (e.g. 3 for March)
   * @param day   - Calendar day, 1-indexed (e.g. 1 for the 1st)
   * @param limit - Maximum rows to return (defaults to 15)
   */
  async getOnThisDay(
    month: number,
    day: number,
    limit = 15,
  ): Promise<OnThisDayEntry[]> {
    return runWithPublicClient(this.options, async (db) => {
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');

      // --- Notable batting ---
      const battingRows = await db
        .select({
          playerId: PublicSchema.gameBatting.playerId,
          season: PublicSchema.gameBatting.season,
          gameIdentifier: PublicSchema.gameBatting.gameIdentifier,
          hr: PublicSchema.gameBatting.hr,
          rbi: PublicSchema.gameBatting.rbi,
          h: PublicSchema.gameBatting.h,
          doubles: PublicSchema.gameBatting.doubles,
          triples: PublicSchema.gameBatting.triples,
          ab: PublicSchema.gameBatting.ab,
          bb: PublicSchema.gameBatting.bb,
          r: PublicSchema.gameBatting.r,
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
          brefId: PublicSchema.players.brefId,
        })
        .from(PublicSchema.gameBatting)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.gameBatting.playerId, PublicSchema.players.id),
        )
        .where(
          and(
            sql`SUBSTRING(${PublicSchema.gameBatting.gameIdentifier}, 8, 2) = ${mStr}`,
            sql`SUBSTRING(${PublicSchema.gameBatting.gameIdentifier}, 10, 2) = ${dStr}`,
            or(
              sql`${PublicSchema.gameBatting.hr} > 0`,
              sql`${PublicSchema.gameBatting.h} >= 3`,
              sql`${PublicSchema.gameBatting.rbi} >= 4`,
            ),
          ),
        )
        .orderBy(
          desc(PublicSchema.gameBatting.season),
          desc(sql`COALESCE(${PublicSchema.gameBatting.hr}, 0)`),
          desc(sql`COALESCE(${PublicSchema.gameBatting.rbi}, 0)`),
        )
        .limit(limit)
        .execute();

      // --- Notable pitching ---
      const pitchingRows = await db
        .select({
          playerId: PublicSchema.gamePitching.playerId,
          season: PublicSchema.gamePitching.season,
          gameIdentifier: PublicSchema.gamePitching.gameIdentifier,
          so: PublicSchema.gamePitching.so,
          ip: PublicSchema.gamePitching.ip,
          er: PublicSchema.gamePitching.er,
          h: PublicSchema.gamePitching.h,
          bb: PublicSchema.gamePitching.bb,
          sv: PublicSchema.gamePitching.sv,
          w: PublicSchema.gamePitching.w,
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
          brefId: PublicSchema.players.brefId,
        })
        .from(PublicSchema.gamePitching)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.gamePitching.playerId, PublicSchema.players.id),
        )
        .where(
          and(
            sql`SUBSTRING(${PublicSchema.gamePitching.gameIdentifier}, 8, 2) = ${mStr}`,
            sql`SUBSTRING(${PublicSchema.gamePitching.gameIdentifier}, 10, 2) = ${dStr}`,
            or(
              sql`${PublicSchema.gamePitching.so} >= 10`,
              sql`(${PublicSchema.gamePitching.ip} >= 7 AND COALESCE(${PublicSchema.gamePitching.er}, 1) = 0)`,
              sql`${PublicSchema.gamePitching.sv} > 0`,
            ),
          ),
        )
        .orderBy(
          desc(PublicSchema.gamePitching.season),
          desc(sql`COALESCE(${PublicSchema.gamePitching.so}, 0)`),
        )
        .limit(Math.ceil(limit / 3))
        .execute();

      const batting: OnThisDayEntry[] = battingRows.map((row) => ({
        entryType: 'batting' as const,
        playerId: row.playerId,
        firstName: row.firstName,
        lastName: row.lastName,
        brefId: row.brefId,
        season: row.season,
        gameIdentifier: row.gameIdentifier,
        hr: row.hr ?? null,
        rbi: row.rbi ?? null,
        hits: row.h ?? null,
        doubles: row.doubles ?? null,
        triples: row.triples ?? null,
        atBats: row.ab ?? null,
        baseOnBalls: row.bb ?? null,
        runs: row.r ?? null,
        strikeouts: null,
        inningsPitched: null,
        earnedRuns: null,
        saves: null,
        wins: null,
        hitsAllowed: null,
        walksAllowed: null,
      }));

      const pitching: OnThisDayEntry[] = pitchingRows.map((row) => ({
        entryType: 'pitching' as const,
        playerId: row.playerId,
        firstName: row.firstName,
        lastName: row.lastName,
        brefId: row.brefId,
        season: row.season,
        gameIdentifier: row.gameIdentifier,
        strikeouts: row.so ?? null,
        inningsPitched: row.ip ?? null,
        earnedRuns: row.er ?? null,
        saves: row.sv ?? null,
        wins: row.w ?? null,
        hitsAllowed: row.h ?? null,
        walksAllowed: row.bb ?? null,
        hr: null,
        rbi: null,
        hits: null,
        doubles: null,
        triples: null,
        atBats: null,
        baseOnBalls: null,
        runs: null,
      }));

      return [...batting, ...pitching];
    });
  }

  /**
   * Get "On This Day" baseball events (signings, trades, milestones) for a
   * specific calendar date across all years stored in the database.
   *
   * @param month - Calendar month, 1-indexed (e.g. 3 for March)
   * @param day   - Calendar day, 1-indexed (e.g. 1 for the 1st)
   * @param limit - Maximum rows to return (defaults to 20)
   */
  async getOnThisDayEvents(
    month: number,
    day: number,
    limit = 20,
  ): Promise<OnThisDayEventEntry[]> {
    return runWithPublicClient(this.options, async (db) => {
      const rows = await db
        .select({
          id: PublicSchema.onThisDayEvents.id,
          month: PublicSchema.onThisDayEvents.month,
          day: PublicSchema.onThisDayEvents.day,
          year: PublicSchema.onThisDayEvents.year,
          eventType: PublicSchema.onThisDayEvents.eventType,
          description: PublicSchema.onThisDayEvents.description,
          playerId: PublicSchema.onThisDayEvents.playerId,
          playerName: PublicSchema.onThisDayEvents.playerName,
          fromTeam: PublicSchema.onThisDayEvents.fromTeam,
          toTeam: PublicSchema.onThisDayEvents.toTeam,
        })
        .from(PublicSchema.onThisDayEvents)
        .where(
          and(
            eq(PublicSchema.onThisDayEvents.month, month),
            eq(PublicSchema.onThisDayEvents.day, day),
          ),
        )
        .orderBy(desc(PublicSchema.onThisDayEvents.year))
        // Over-fetch to compensate for duplicates that will be removed during
        // in-memory dedupe, so we still return up to `limit` unique events.
        .limit(limit * 3)
        .execute();

      // Deduplicate rows that share the same (year, eventType, playerName, description).
      // Rows with NULL mlb_transaction_id bypass the DB unique constraint, so
      // duplicate entries can exist for the same real-world transaction.
      const seen = new Set<string>();
      const deduped: typeof rows = [];
      for (const row of rows) {
        const key = JSON.stringify([
          row.year,
          row.eventType,
          row.playerName ?? null,
          row.description,
        ]);
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(row);
        }
      }

      return deduped.slice(0, limit).map((row) => ({
        id: row.id,
        month: row.month,
        day: row.day,
        year: row.year,
        eventType: row.eventType,
        description: row.description,
        playerId: row.playerId ?? null,
        playerName: row.playerName ?? null,
        fromTeam: row.fromTeam ?? null,
        toTeam: row.toTeam ?? null,
      }));
    });
  }

  /**
   * Count career batting records with optional filtering
   */
  async countCareerBattingStats(filters?: StatisticsFilters): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      let queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.careerBatting);

      const conditions = filters ? this.buildBattingFilters(filters) : [];

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter(
          (condition): condition is SQL => condition !== undefined,
        );
        if (validConditions.length > 0) {
          const whereClause =
            validConditions.length === 1
              ? validConditions[0]
              : and(...validConditions);
          queryBuilder = queryBuilder.where(whereClause) as typeof queryBuilder;
        }
      }

      const result = await queryBuilder.execute();
      return result[0]?.count || 0;
    });
  }

  /**
   * Count career pitching records with optional filtering
   */
  async countCareerPitchingStats(filters?: StatisticsFilters): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      const conditions = filters ? this.buildPitchingFilters(filters) : [];

      if (filters?.searchTerm) {
        // JOIN with players table to enable name-based count
        const searchPattern = `%${filters.searchTerm}%`;
        const searchCondition = or(
          ilike(PublicSchema.players.firstName, searchPattern),
          ilike(PublicSchema.players.lastName, searchPattern),
        );
        const allConditions = searchCondition
          ? [...conditions, searchCondition]
          : conditions;

        const whereClause =
          allConditions.length === 1
            ? allConditions[0]
            : allConditions.length > 1
              ? and(...allConditions)
              : undefined;

        // Use plain .select() to avoid view/table shape mismatch
        const baseCountQuery = db
          .select({ count: count() })
          .from(PublicSchema.careerPitching)
          .innerJoin(
            PublicSchema.players,
            eq(PublicSchema.careerPitching.playerId, PublicSchema.players.id),
          );

        const finalCountQuery = whereClause
          ? baseCountQuery.where(whereClause)
          : baseCountQuery;

        const result = await finalCountQuery.execute();
        return result[0]?.count || 0;
      }

      let queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.careerPitching);

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter(
          (condition): condition is SQL => condition !== undefined,
        );
        if (validConditions.length > 0) {
          const whereClause =
            validConditions.length === 1
              ? validConditions[0]
              : and(...validConditions);
          queryBuilder = queryBuilder.where(whereClause) as typeof queryBuilder;
        }
      }

      const result = await queryBuilder.execute();
      return result[0]?.count || 0;
    });
  }

  /**
   * Count career fielding records with optional filtering
   */
  async countCareerFieldingStats(filters?: StatisticsFilters): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      let queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.careerFielding);

      const conditions = filters ? this.buildFieldingFilters(filters) : [];

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter(
          (condition): condition is SQL => condition !== undefined,
        );
        if (validConditions.length > 0) {
          const whereClause =
            validConditions.length === 1
              ? validConditions[0]
              : and(...validConditions);
          queryBuilder = queryBuilder.where(whereClause) as typeof queryBuilder;
        }
      }

      const result = await queryBuilder.execute();
      return result[0]?.count || 0;
    });
  }

  /**
   * Build WHERE conditions for career batting queries
   */
  private buildBattingFilters(filters: StatisticsFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.careerBatting.playerId, filters.playerId),
      );
    }

    if (filters.minGames !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerBatting.g} >= ${filters.minGames}`,
      );
    }

    if (filters.minHomeRuns !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerBatting.hr} >= ${filters.minHomeRuns}`,
      );
    }

    if (filters.minRBI !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerBatting.rbi} >= ${filters.minRBI}`,
      );
    }

    if (filters.minBattingAvg !== undefined) {
      // Filter by minimum batting average (hits/at-bats >= minBattingAvg)
      // Only include players with at least 1 at-bat to avoid division by zero
      conditions.push(
        sql`${PublicSchema.careerBatting.ab} > 0 AND (CAST(${PublicSchema.careerBatting.h} AS DECIMAL) / CAST(${PublicSchema.careerBatting.ab} AS DECIMAL)) >= ${filters.minBattingAvg}`,
      );
    }

    return conditions;
  }

  /**
   * Build WHERE conditions for career pitching queries
   */
  private buildPitchingFilters(filters: StatisticsFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.careerPitching.playerId, filters.playerId),
      );
    }

    if (filters.minGames !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerPitching.g} >= ${filters.minGames}`,
      );
    }

    if (filters.minWins !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerPitching.w} >= ${filters.minWins}`,
      );
    }

    if (filters.minStrikeouts !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerPitching.so} >= ${filters.minStrikeouts}`,
      );
    }

    if (filters.position && filters.position !== 'P') {
      conditions.push(
        sql`${PublicSchema.careerPitching.playerId} IN (SELECT player_id FROM public.player_eligible_positions WHERE position = ${filters.position})`,
      );
    }

    return conditions;
  }

  /**
   * Build WHERE conditions for career fielding queries
   */
  private buildFieldingFilters(filters: StatisticsFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.careerFielding.playerId, filters.playerId),
      );
    }

    if (filters.minGames !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerFielding.g} >= ${filters.minGames}`,
      );
    }

    return conditions;
  }

  /**
   * Build WHERE conditions for season batting queries
   */
  private buildSeasonBattingFilters(filters: SeasonStatisticsFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.seasonBatting.playerId, filters.playerId),
      );
    }

    if (filters.season !== undefined) {
      conditions.push(eq(PublicSchema.seasonBatting.season, filters.season));
    }

    if (filters.team !== undefined) {
      conditions.push(eq(PublicSchema.seasonBatting.team, filters.team));
    }

    if (filters.lgId !== undefined) {
      conditions.push(eq(PublicSchema.seasonBatting.lgId, filters.lgId));
    }

    if (filters.minGames !== undefined) {
      conditions.push(
        sql`${PublicSchema.seasonBatting.g} >= ${filters.minGames}`,
      );
    }

    if (filters.minHomeRuns !== undefined) {
      conditions.push(
        sql`${PublicSchema.seasonBatting.hr} >= ${filters.minHomeRuns}`,
      );
    }

    if (filters.minRBI !== undefined) {
      conditions.push(
        sql`${PublicSchema.seasonBatting.rbi} >= ${filters.minRBI}`,
      );
    }

    return conditions;
  }

  /**
   * Build WHERE conditions for season pitching queries
   */
  private buildSeasonPitchingFilters(filters: SeasonStatisticsFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.seasonPitching.playerId, filters.playerId),
      );
    }

    if (filters.season !== undefined) {
      conditions.push(eq(PublicSchema.seasonPitching.season, filters.season));
    }

    if (filters.team !== undefined) {
      conditions.push(eq(PublicSchema.seasonPitching.team, filters.team));
    }

    if (filters.lgId !== undefined) {
      conditions.push(eq(PublicSchema.seasonPitching.lgId, filters.lgId));
    }

    if (filters.minGames !== undefined) {
      conditions.push(
        sql`${PublicSchema.seasonPitching.g} >= ${filters.minGames}`,
      );
    }

    if (filters.minWins !== undefined) {
      conditions.push(
        sql`${PublicSchema.seasonPitching.w} >= ${filters.minWins}`,
      );
    }

    if (filters.minStrikeouts !== undefined) {
      conditions.push(
        sql`${PublicSchema.seasonPitching.so} >= ${filters.minStrikeouts}`,
      );
    }

    return conditions;
  }

  /**
   * Build WHERE conditions for season fielding queries
   */
  private buildSeasonFieldingFilters(filters: SeasonStatisticsFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.seasonFielding.playerId, filters.playerId),
      );
    }

    if (filters.season !== undefined) {
      conditions.push(eq(PublicSchema.seasonFielding.season, filters.season));
    }

    if (filters.team !== undefined) {
      conditions.push(eq(PublicSchema.seasonFielding.team, filters.team));
    }

    if (filters.lgId !== undefined) {
      conditions.push(eq(PublicSchema.seasonFielding.lgId, filters.lgId));
    }

    if (filters.minGames !== undefined) {
      conditions.push(
        sql`${PublicSchema.seasonFielding.g} >= ${filters.minGames}`,
      );
    }

    return conditions;
  }
}

/**
 * Factory function to create a statistics service
 */
export function createStatisticsService(options: DbOptions): StatisticsService {
  return new StatisticsService(options);
}
