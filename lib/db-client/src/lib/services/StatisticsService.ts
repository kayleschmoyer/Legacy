import { and, asc, count, desc, eq, sql, SQL } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';
import {
  CareerBatting,
  CareerFielding,
  CareerPitching,
} from '../../types/DatabaseTypes';

export interface StatisticsFilters {
  playerId?: number;
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
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db.select().from(PublicSchema.careerBatting);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildBattingFilters(queryOptions.filters)
        : [];

      // Build final query parts
      const orderDirection = queryOptions.orderDirection || 'desc';

      // Execute query with all conditions
      let finalQuery = queryBuilder;

      if (conditions.length > 0) {
        finalQuery = finalQuery.where(and(...conditions)) as typeof finalQuery;
      }

      // Default ordering by home runs descending for interesting results
      if (queryOptions.orderBy === 'games') {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery.orderBy(
                desc(PublicSchema.careerBatting.g),
              ) as typeof finalQuery)
            : (finalQuery.orderBy(
                asc(PublicSchema.careerBatting.g),
              ) as typeof finalQuery);
      } else if (queryOptions.orderBy === 'homeRuns') {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery.orderBy(
                desc(PublicSchema.careerBatting.hr),
              ) as typeof finalQuery)
            : (finalQuery.orderBy(
                asc(PublicSchema.careerBatting.hr),
              ) as typeof finalQuery);
      } else {
        // Default to home runs descending
        finalQuery = finalQuery.orderBy(
          desc(PublicSchema.careerBatting.hr),
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
   * Get career pitching statistics with optional filtering and pagination
   */
  async getCareerPitchingStats(
    queryOptions: StatisticsQueryOptions = {},
  ): Promise<CareerPitching[]> {
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db.select().from(PublicSchema.careerPitching);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildPitchingFilters(queryOptions.filters)
        : [];

      const orderDirection = queryOptions.orderDirection || 'desc';

      // Execute query with all conditions
      let finalQuery = queryBuilder;

      if (conditions.length > 0) {
        finalQuery = finalQuery.where(and(...conditions)) as typeof finalQuery;
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
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db.select().from(PublicSchema.careerFielding);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildFieldingFilters(queryOptions.filters)
        : [];

      const orderDirection = queryOptions.orderDirection || 'desc';

      // Execute query with all conditions
      let finalQuery = queryBuilder;

      if (conditions.length > 0) {
        finalQuery = finalQuery.where(and(...conditions)) as typeof finalQuery;
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
      const results = await db
        .select()
        .from(PublicSchema.careerFielding)
        .where(eq(PublicSchema.careerFielding.playerId, playerId))
        .limit(1);

      return results[0] || null;
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
        queryBuilder = queryBuilder.where(
          and(...conditions),
        ) as typeof queryBuilder;
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
        queryBuilder = queryBuilder.where(
          and(...conditions),
        ) as typeof queryBuilder;
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
        queryBuilder = queryBuilder.where(
          and(...conditions),
        ) as typeof queryBuilder;
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
}

/**
 * Factory function to create a statistics service
 */
export function createStatisticsService(options: DbOptions): StatisticsService {
  return new StatisticsService(options);
}
