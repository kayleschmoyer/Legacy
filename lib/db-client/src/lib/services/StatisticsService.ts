import { and, asc, count, desc, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { DbOptions } from '@legacy-sports/utils';
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

// Type-safe column access helpers with proper Drizzle types
// These functions safely access Drizzle table columns by name for sorting

type TableColumns<T> = T extends { [K: string]: AnyPgColumn } ? T : never;

function getBattingColumn(columnName: string): AnyPgColumn | undefined {
  const columns = PublicSchema.seasonBatting as TableColumns<typeof PublicSchema.seasonBatting>;
  const column = columns[columnName as keyof typeof columns];
  return column;
}

function getPitchingColumn(columnName: string): AnyPgColumn | undefined {
  const columns = PublicSchema.seasonPitching as TableColumns<typeof PublicSchema.seasonPitching>;
  const column = columns[columnName as keyof typeof columns];
  return column;
}

function getFieldingColumn(columnName: string): AnyPgColumn | undefined {
  const columns = PublicSchema.seasonFielding as TableColumns<typeof PublicSchema.seasonFielding>;
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
   * Get career batting statistics with optional filtering and pagination
   */
  async getCareerBattingStats(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<CareerBatting[]> {
    return runWithPublicClient(this.options, async (db): Promise<CareerBatting[]> => {
      // Check if we need to join with players table for search term
      const needsPlayerJoin = queryOptions.filters?.searchTerm;
      
      // Build base query - using let without explicit any type so TypeScript can infer
      let queryBuilder;
      if (needsPlayerJoin) {
        // Join with players table for name search
        queryBuilder = db
          .select({
            playerId: PublicSchema.careerBatting.playerId,
            g: PublicSchema.careerBatting.g,
            pa: PublicSchema.careerBatting.pa,
            ab: PublicSchema.careerBatting.ab,
            r: PublicSchema.careerBatting.r,
            h: PublicSchema.careerBatting.h,
            doubles: PublicSchema.careerBatting.doubles,
            triples: PublicSchema.careerBatting.triples,
            hr: PublicSchema.careerBatting.hr,
            rbi: PublicSchema.careerBatting.rbi,
            sb: PublicSchema.careerBatting.sb,
            cs: PublicSchema.careerBatting.cs,
            bb: PublicSchema.careerBatting.bb,
            so: PublicSchema.careerBatting.so,
            tb: PublicSchema.careerBatting.tb,
            gidp: PublicSchema.careerBatting.gidp,
            hbp: PublicSchema.careerBatting.hbp,
            sh: PublicSchema.careerBatting.sh,
            ibb: PublicSchema.careerBatting.ibb,
          })
          .from(PublicSchema.careerBatting)
          .innerJoin(
            PublicSchema.players,
            eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id)
          );
      } else {
        queryBuilder = db.select().from(PublicSchema.careerBatting);
      }

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildBattingFilters(queryOptions.filters)
        : [];

      // Add search term condition if needed
      if (needsPlayerJoin && queryOptions.filters?.searchTerm) {
        const searchTerm = queryOptions.filters.searchTerm;
        // Use properly typed column references
        const firstNameCol = PublicSchema.players.firstName;
        const lastNameCol = PublicSchema.players.lastName;
        const firstNameMatch = ilike(firstNameCol, `%${searchTerm}%`);
        const lastNameMatch = ilike(lastNameCol, `%${searchTerm}%`);
        const searchCondition = or(firstNameMatch, lastNameMatch);
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      // Execute query with all conditions - using let without explicit any type
      let finalQuery = queryBuilder;

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
          // Drizzle's complex conditional types require type assertion here
          finalQuery = (finalQuery as any).where(whereClause);
        }
      }

      // Default ordering by home runs descending for interesting results
      if (queryOptions.orderBy === 'games') {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery as any).orderBy(desc(PublicSchema.careerBatting.g))
            : (finalQuery as any).orderBy(asc(PublicSchema.careerBatting.g));
      } else if (queryOptions.orderBy === 'homeRuns') {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery as any).orderBy(desc(PublicSchema.careerBatting.hr))
            : (finalQuery as any).orderBy(asc(PublicSchema.careerBatting.hr));
      } else {
        // Default to home runs descending
        finalQuery = (finalQuery as any).orderBy(
          desc(PublicSchema.careerBatting.hr),
        );
      }

      if (queryOptions.limit) {
        finalQuery = (finalQuery as any).limit(queryOptions.limit);
      }

      if (queryOptions.offset) {
        finalQuery = (finalQuery as any).offset(queryOptions.offset);
      }

      return await (finalQuery as any).execute();
    });
  }

  /**
   * Get the total count of career batting statistics with optional filtering
   * Uses the same filters as getCareerBattingStats but returns only the count
   */
  async getCareerBattingStatsCount(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<number> {
    return runWithPublicClient(this.options, async (db): Promise<number> => {
      // Check if we need to join with players table for search term
      const needsPlayerJoin = queryOptions.filters?.searchTerm;

      // Build WHERE clause - same logic as getCareerBattingStats
      const conditions = queryOptions.filters
        ? this.buildBattingFilters(queryOptions.filters)
        : [];

      if (needsPlayerJoin) {
        // Build query with join for name search
        let queryBuilder = db
          .select({
            count: count(),
          })
          .from(PublicSchema.careerBatting)
          .innerJoin(
            PublicSchema.players,
            eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id)
          );

        // Add search term condition
        if (queryOptions.filters?.searchTerm) {
          const searchTerm = queryOptions.filters.searchTerm;
          const firstNameCol = PublicSchema.players.firstName;
          const lastNameCol = PublicSchema.players.lastName;
          const firstNameMatch = ilike(firstNameCol, `%${searchTerm}%`);
          const lastNameMatch = ilike(lastNameCol, `%${searchTerm}%`);
          const searchCondition = or(firstNameMatch, lastNameMatch);
          if (searchCondition) {
            conditions.push(searchCondition);
          }
        }

        // Apply WHERE conditions if any
        if (conditions.length > 0) {
          const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
          if (validConditions.length > 0) {
            const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
            queryBuilder = (queryBuilder as any).where(whereClause);
          }
        }

        const result = await queryBuilder.execute();
        return result[0]?.count || 0;
      } else {
        // Build query without join for simple counts
        let queryBuilder = db
          .select({
            count: count(),
          })
          .from(PublicSchema.careerBatting);

        // Apply WHERE conditions if any
        if (conditions.length > 0) {
          const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
          if (validConditions.length > 0) {
            const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
            queryBuilder = (queryBuilder as any).where(whereClause);
          }
        }

        const result = await queryBuilder.execute();
        return result[0]?.count || 0;
      }
    });
  }

  /**
   * Get career pitching statistics with optional filtering and pagination
   */
  async getCareerPitchingStats(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<CareerPitching[]> {
    return runWithPublicClient(this.options, async (db): Promise<CareerPitching[]> => {
      const queryBuilder = db.select().from(PublicSchema.careerPitching);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildPitchingFilters(queryOptions.filters)
        : [];

      const orderDirection = queryOptions.orderDirection || 'desc';

      // Execute query with all conditions
      let finalQuery = queryBuilder;

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
          finalQuery = finalQuery.where(whereClause) as typeof finalQuery;
        }
      }

      // Default ordering by wins descending for interesting results
      if (queryOptions.orderBy === 'wins') {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery.orderBy(
                desc(PublicSchema.careerPitching.w),
              ) as typeof finalQuery)
            : (finalQuery.orderBy(
                asc(PublicSchema.careerPitching.w),
              ) as typeof finalQuery);
      } else if (queryOptions.orderBy === 'strikeouts') {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery.orderBy(
                desc(PublicSchema.careerPitching.so),
              ) as typeof finalQuery)
            : (finalQuery.orderBy(
                asc(PublicSchema.careerPitching.so),
              ) as typeof finalQuery);
      } else {
        // Default to wins descending
        finalQuery = finalQuery.orderBy(
          desc(PublicSchema.careerPitching.w),
        ) as typeof finalQuery;
      }

      if (queryOptions.limit) {
        finalQuery = finalQuery.limit(queryOptions.limit) as typeof finalQuery;
      }

      if (queryOptions.offset) {
        finalQuery = finalQuery.offset(
          queryOptions.offset,
        ) as typeof finalQuery;
      }

      return finalQuery.execute();
    });
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
    return runWithPublicClient(this.options, async (db): Promise<CareerFielding[]> => {
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
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
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
        finalQuery = finalQuery.limit(queryOptions.limit) as typeof finalQuery;
      }

      if (queryOptions.offset) {
        finalQuery = finalQuery.offset(
          queryOptions.offset,
        ) as typeof finalQuery;
      }

      return finalQuery.execute();
    });
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
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db.select().from(PublicSchema.seasonBatting);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildSeasonBattingFilters(queryOptions.filters)
        : [];

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
          queryBuilder.where(whereClause);
        }
      }

      if (queryOptions.orderBy) {
        const column = getBattingColumn(queryOptions.orderBy);
        if (column) {
          queryBuilder.orderBy(
            orderDirection === 'asc' ? asc(column) : desc(column),
          );
        }
      }

      if (queryOptions.limit) {
        queryBuilder.limit(queryOptions.limit);
      }

      if (queryOptions.offset) {
        queryBuilder.offset(queryOptions.offset);
      }

      return queryBuilder;
    });
  }

  /**
   * Get season pitching statistics with optional filtering and pagination
   */
  async getSeasonPitchingStats(
    queryOptions: SeasonStatisticsQueryOptions = {},
  ): Promise<SeasonPitching[]> {
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db.select().from(PublicSchema.seasonPitching);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildSeasonPitchingFilters(queryOptions.filters)
        : [];

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
          queryBuilder.where(whereClause);
        }
      }

      if (queryOptions.orderBy) {
        const column = getPitchingColumn(queryOptions.orderBy);
        if (column) {
          queryBuilder.orderBy(
            orderDirection === 'asc' ? asc(column) : desc(column),
          );
        }
      }

      if (queryOptions.limit) {
        queryBuilder.limit(queryOptions.limit);
      }

      if (queryOptions.offset) {
        queryBuilder.offset(queryOptions.offset);
      }

      return queryBuilder;
    });
  }

  /**
   * Get season fielding statistics with optional filtering and pagination
   */
  async getSeasonFieldingStats(
    queryOptions: SeasonStatisticsQueryOptions = {},
  ): Promise<SeasonFielding[]> {
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db.select().from(PublicSchema.seasonFielding);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildSeasonFieldingFilters(queryOptions.filters)
        : [];

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
          queryBuilder.where(whereClause);
        }
      }

      if (queryOptions.orderBy) {
        const column = getFieldingColumn(queryOptions.orderBy);
        if (column) {
          queryBuilder.orderBy(
            orderDirection === 'asc' ? asc(column) : desc(column),
          );
        }
      }

      if (queryOptions.limit) {
        queryBuilder.limit(queryOptions.limit);
      }

      if (queryOptions.offset) {
        queryBuilder.offset(queryOptions.offset);
      }

      return queryBuilder;
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
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
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
      let queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.careerPitching);

      const conditions = filters ? this.buildPitchingFilters(filters) : [];

      if (conditions.length > 0) {
        // Filter out any undefined conditions before passing to and()
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
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
        const validConditions = conditions.filter((condition): condition is SQL => condition !== undefined);
        if (validConditions.length > 0) {
          const whereClause = validConditions.length === 1 ? validConditions[0] : and(...validConditions);
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
