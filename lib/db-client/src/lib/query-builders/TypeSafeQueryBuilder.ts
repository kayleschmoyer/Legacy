import { 
  and, 
  asc, 
  count,
  desc, 
  eq, 
  gte, 
  ilike, 
  or,
  SQL
} from 'drizzle-orm';
import { PublicSchema } from '../client/PublicDbClient';
import type { PublicDb } from '../client/PublicDbClient';

/**
 * Type-safe query builder using Drizzle's recommended conditional patterns
 * This approach avoids .$dynamic() by building complete queries conditionally
 * following Drizzle best practices for complex queries
 */

/**
 * Statistics query conditions builder with proper typing
 */
export interface StatisticsQueryFilters {
  playerId?: number;
  minGames?: number;
  minHomeRuns?: number;
  minRBI?: number;
  minWins?: number;
  minStrikeouts?: number;
  minBattingAvg?: number;
  searchTerm?: string;
}

export interface QueryOptions {
  orderBy?: 'games' | 'homeRuns' | 'wins' | 'strikeouts';
  orderDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Type-safe career batting query builder using Drizzle's recommended conditional patterns
 * Following Drizzle best practices: builds complete queries conditionally instead of using .$dynamic()
 */
export class CareerBattingQueryBuilder {
  private db: PublicDb;

  constructor(db: PublicDb) {
    this.db = db;
  }

  /**
   * Execute a type-safe career batting query using Drizzle's recommended conditional approach
   */
  async executeQuery(filters: StatisticsQueryFilters = {}, options: QueryOptions = {}) {
    // Build base conditions for batting stats
    const battingConditions: SQL<unknown>[] = [];
    
    if (filters.playerId !== undefined) {
      battingConditions.push(eq(PublicSchema.careerBatting.playerId, filters.playerId));
    }
    if (filters.minGames !== undefined) {
      battingConditions.push(gte(PublicSchema.careerBatting.g, filters.minGames));
    }
    if (filters.minHomeRuns !== undefined) {
      battingConditions.push(gte(PublicSchema.careerBatting.hr, filters.minHomeRuns));
    }
    if (filters.minRBI !== undefined) {
      battingConditions.push(gte(PublicSchema.careerBatting.rbi, filters.minRBI));
    }

    // Determine ordering clause
    const orderByClause = this.getOrderByClause(options);

    // Check if we need to join with players table (for search functionality)
    if (filters.searchTerm) {
      return this.executeWithPlayerJoin(battingConditions, filters.searchTerm, orderByClause, options);
    } else {
      return this.executeWithoutJoin(battingConditions, orderByClause, options);
    }
  }

  /**
   * Execute query with player join for search functionality
   * Uses Drizzle's recommended function-based conditional query building
   */
  private async executeWithPlayerJoin(
    battingConditions: SQL<unknown>[],
    searchTerm: string,
    orderByClause: SQL<unknown>,
    options: QueryOptions
  ) {
    // Add search conditions to existing batting conditions
    const searchPattern = `%${searchTerm}%`;
    const searchCondition = or(
      ilike(PublicSchema.players.firstName, searchPattern),
      ilike(PublicSchema.players.lastName, searchPattern)
    );
    
    const allConditions = searchCondition 
      ? [...battingConditions, searchCondition]
      : battingConditions;

    // Build complete query using function-based approach - Drizzle recommended pattern
    const baseQuery = () => this.db
      .select()
      .from(PublicSchema.careerBatting)
      .innerJoin(PublicSchema.players, eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id));

    // Apply conditions conditionally
    const withConditions = () => {
      const query = baseQuery();
      return allConditions.length > 0
        ? query.where(allConditions.length === 1 ? allConditions[0] : and(...allConditions))
        : query;
    };

    // Apply ordering
    const withOrdering = () => withConditions().orderBy(orderByClause);

    // Apply pagination conditionally  
    const finalQuery = () => {
      const query = withOrdering();
      if (options.limit !== undefined) {
        const limitedQuery = query.limit(options.limit);
        return options.offset !== undefined 
          ? limitedQuery.offset(options.offset)
          : limitedQuery;
      }
      return query;
    };

    return await finalQuery().execute();
  }

  /**
   * Execute query without player join for simple filtering
   * Uses Drizzle's recommended function-based conditional query building
   */
  private async executeWithoutJoin(
    conditions: SQL<unknown>[],
    orderByClause: SQL<unknown>,
    options: QueryOptions
  ) {
    // Build complete query using function-based approach - Drizzle recommended pattern
    const baseQuery = () => this.db
      .select()
      .from(PublicSchema.careerBatting);

    // Apply conditions conditionally
    const withConditions = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
        : query;
    };

    // Apply ordering
    const withOrdering = () => withConditions().orderBy(orderByClause);

    // Apply pagination conditionally  
    const finalQuery = () => {
      const query = withOrdering();
      if (options.limit !== undefined) {
        const limitedQuery = query.limit(options.limit);
        return options.offset !== undefined 
          ? limitedQuery.offset(options.offset)
          : limitedQuery;
      }
      return query;
    };

    return await finalQuery().execute();
  }

  /**
   * Get properly typed ORDER BY clause based on options
   */
  private getOrderByClause(options: QueryOptions): SQL<unknown> {
    if (options.orderBy === 'games') {
      return options.orderDirection === 'desc' 
        ? desc(PublicSchema.careerBatting.g)
        : asc(PublicSchema.careerBatting.g);
    } else if (options.orderBy === 'homeRuns') {
      return options.orderDirection === 'desc'
        ? desc(PublicSchema.careerBatting.hr) 
        : asc(PublicSchema.careerBatting.hr);
    } else {
      // Default to home runs descending
      return desc(PublicSchema.careerBatting.hr);
    }
  }

  /**
   * Get count with player join using function-based approach
   */
  async countWithPlayerJoin(options: { filters?: StatisticsQueryFilters }): Promise<{ count: number }[]> {
    const filters = options.filters || {};
    
    // Build batting conditions
    const battingConditions: SQL<unknown>[] = [];
    if (filters.playerId !== undefined) {
      battingConditions.push(eq(PublicSchema.careerBatting.playerId, filters.playerId));
    }
    if (filters.minGames !== undefined) {
      battingConditions.push(gte(PublicSchema.careerBatting.g, filters.minGames));
    }
    if (filters.minHomeRuns !== undefined) {
      battingConditions.push(gte(PublicSchema.careerBatting.hr, filters.minHomeRuns));
    }
    if (filters.minRBI !== undefined) {
      battingConditions.push(gte(PublicSchema.careerBatting.rbi, filters.minRBI));
    }

    // Add search condition if provided
    const allConditions = [...battingConditions];
    if (filters.searchTerm) {
      const searchPattern = `%${filters.searchTerm}%`;
      const searchCondition = or(
        ilike(PublicSchema.players.firstName, searchPattern),
        ilike(PublicSchema.players.lastName, searchPattern)
      );
      if (searchCondition) {
        allConditions.push(searchCondition);
      }
    }

    // Build query using function-based approach
    const baseQuery = () => this.db
      .select({ count: count() })
      .from(PublicSchema.careerBatting)
      .innerJoin(PublicSchema.players, eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id));

    const finalQuery = () => {
      const query = baseQuery();
      return allConditions.length > 0
        ? query.where(allConditions.length === 1 ? allConditions[0] : and(...allConditions))
        : query;
    };

    return await finalQuery().execute();
  }

  /**
   * Get count without player join using function-based approach
   */
  async countWithoutJoin(options: { filters?: StatisticsQueryFilters }): Promise<{ count: number }[]> {
    const filters = options.filters || {};
    
    // Build conditions
    const conditions: SQL<unknown>[] = [];
    if (filters.playerId !== undefined) {
      conditions.push(eq(PublicSchema.careerBatting.playerId, filters.playerId));
    }
    if (filters.minGames !== undefined) {
      conditions.push(gte(PublicSchema.careerBatting.g, filters.minGames));
    }
    if (filters.minHomeRuns !== undefined) {
      conditions.push(gte(PublicSchema.careerBatting.hr, filters.minHomeRuns));
    }
    if (filters.minRBI !== undefined) {
      conditions.push(gte(PublicSchema.careerBatting.rbi, filters.minRBI));
    }

    // Build query using function-based approach
    const baseQuery = () => this.db
      .select({ count: count() })
      .from(PublicSchema.careerBatting);

    const finalQuery = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
        : query;
    };

    return await finalQuery().execute();
  }
}

/**
 * Type-safe career pitching query builder using Drizzle's recommended patterns
 */
export class CareerPitchingQueryBuilder {
  private db: PublicDb;

  constructor(db: PublicDb) {
    this.db = db;
  }

  async executeQuery(filters: StatisticsQueryFilters = {}, options: QueryOptions = {}) {
    const conditions: SQL<unknown>[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(eq(PublicSchema.careerPitching.playerId, filters.playerId));
    }
    if (filters.minWins !== undefined) {
      conditions.push(gte(PublicSchema.careerPitching.w, filters.minWins));
    }
    if (filters.minStrikeouts !== undefined) {
      conditions.push(gte(PublicSchema.careerPitching.so, filters.minStrikeouts));
    }

    // Determine ordering
    const orderByClause = options.orderBy === 'wins' 
      ? (options.orderDirection === 'desc' ? desc(PublicSchema.careerPitching.w) : asc(PublicSchema.careerPitching.w))
      : (options.orderBy === 'strikeouts'
        ? (options.orderDirection === 'desc' ? desc(PublicSchema.careerPitching.so) : asc(PublicSchema.careerPitching.so))
        : desc(PublicSchema.careerPitching.w));

    // Check if we need player join for search
    if (filters.searchTerm) {
      return this.executeWithPlayerJoin(filters, conditions, orderByClause, options);
    } else {
      return this.executeWithoutJoin(conditions, orderByClause, options);
    }
  }

  private async executeWithPlayerJoin(
    filters: StatisticsQueryFilters,
    conditions: SQL<unknown>[],
    orderByClause: SQL<unknown>,
    options: QueryOptions
  ) {
    // Add search condition
    if (filters.searchTerm) {
      const searchPattern = `%${filters.searchTerm}%`;
      const searchCondition = or(
        ilike(PublicSchema.players.firstName, searchPattern),
        ilike(PublicSchema.players.lastName, searchPattern)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const baseQuery = () => this.db
      .select()
      .from(PublicSchema.careerPitching)
      .innerJoin(PublicSchema.players, eq(PublicSchema.careerPitching.playerId, PublicSchema.players.id));

    const withConditions = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
        : query;
    };

    const withOrdering = () => withConditions().orderBy(orderByClause);

    const finalQuery = () => {
      const query = withOrdering();
      if (options.limit !== undefined) {
        const limitedQuery = query.limit(options.limit);
        return options.offset !== undefined 
          ? limitedQuery.offset(options.offset)
          : limitedQuery;
      }
      return query;
    };

    return await finalQuery().execute();
  }

  private async executeWithoutJoin(
    conditions: SQL<unknown>[],
    orderByClause: SQL<unknown>,
    options: QueryOptions
  ) {
    const baseQuery = () => this.db
      .select()
      .from(PublicSchema.careerPitching);

    const withConditions = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
        : query;
    };

    const withOrdering = () => withConditions().orderBy(orderByClause);

    const finalQuery = () => {
      const query = withOrdering();
      if (options.limit !== undefined) {
        const limitedQuery = query.limit(options.limit);
        return options.offset !== undefined 
          ? limitedQuery.offset(options.offset)
          : limitedQuery;
      }
      return query;
    };

    return await finalQuery().execute();
  }
}
