import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  or,
  sql,
  SQL,
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
  position?: string;
}

/**
 * Options for ordering query results with comprehensive field support
 */
export interface QueryOptions {
  orderBy?: // Player information
    | 'lastName'
    // Batting statistics
    | 'games'
    | 'plateAppearances'
    | 'atBats'
    | 'runs'
    | 'hits'
    | 'doubles'
    | 'triples'
    | 'homeRuns'
    | 'rbi'
    | 'stolenBases'
    | 'caughtStealing'
    | 'baseOnBalls'
    | 'strikeouts'
    | 'hitByPitch'
    | 'intentionalBaseOnBalls'
    | 'totalBases'
    | 'groundedIntoDoublePlays'
    | 'sacrificeHits'
    // Advanced metrics
    | 'offensiveWAR'
    // Pitching statistics
    | 'wins'
    | 'losses'
    | 'gamesStarted'
    | 'completeGames'
    | 'shutouts'
    | 'saves'
    | 'earnedRuns';
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
  async executeQuery(
    filters: StatisticsQueryFilters = {},
    options: QueryOptions = {},
  ) {
    // Build base conditions for batting stats
    const battingConditions: SQL<unknown>[] = [];

    if (filters.playerId !== undefined) {
      battingConditions.push(
        eq(PublicSchema.careerBatting.playerId, filters.playerId),
      );
    }
    if (filters.minGames !== undefined) {
      battingConditions.push(
        gte(PublicSchema.careerBatting.g, filters.minGames),
      );
    }
    if (filters.minHomeRuns !== undefined) {
      battingConditions.push(
        gte(PublicSchema.careerBatting.hr, filters.minHomeRuns),
      );
    }
    if (filters.minRBI !== undefined) {
      battingConditions.push(
        gte(PublicSchema.careerBatting.rbi, filters.minRBI),
      );
    }

    // Determine ordering clause
    const orderByClause = this.getOrderByClause(options);

    // Check if we need to join with players table (for search, position, or name sorting)
    if (filters.searchTerm && filters.position) {
      return this.executeWithBothJoins(
        battingConditions,
        filters.searchTerm,
        filters.position,
        orderByClause,
        options,
      );
    } else if (filters.searchTerm || options.orderBy === 'lastName') {
      return this.executeWithPlayerJoin(
        battingConditions,
        filters.searchTerm,
        orderByClause,
        options,
      );
    } else if (filters.position) {
      return this.executeWithPositionJoin(
        battingConditions,
        filters.position,
        orderByClause,
        options,
      );
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
    searchTerm: string | undefined,
    orderByClause: SQL<unknown>,
    options: QueryOptions,
  ) {
    // Add search conditions to existing batting conditions when a search term is provided
    const allConditions = [...battingConditions];
    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      const searchCondition = or(
        ilike(PublicSchema.players.firstName, searchPattern),
        ilike(PublicSchema.players.lastName, searchPattern),
      );
      if (searchCondition) {
        allConditions.push(searchCondition);
      }
    }

    // Build complete query using function-based approach - Drizzle recommended pattern
    const baseQuery = () =>
      this.db
        .select()
        .from(PublicSchema.careerBatting)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id),
        );

    // Apply conditions conditionally
    const withConditions = () => {
      const query = baseQuery();
      return allConditions.length > 0
        ? query.where(
            allConditions.length === 1
              ? allConditions[0]
              : and(...allConditions),
          )
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
   * Execute query with position join for filtering by primary position
   * Joins career_batting with career_fielding_by_position
   */
  private async executeWithPositionJoin(
    battingConditions: SQL<unknown>[],
    position: string,
    orderByClause: SQL<unknown>,
    options: QueryOptions,
  ) {
    const positionCondition = ilike(
      PublicSchema.careerFieldingByPosition.pos,
      position,
    );
    const allConditions = [...battingConditions, positionCondition];

    const baseQuery = () =>
      this.db
        .select()
        .from(PublicSchema.careerBatting)
        .innerJoin(
          PublicSchema.careerFieldingByPosition,
          eq(
            PublicSchema.careerBatting.playerId,
            PublicSchema.careerFieldingByPosition.playerId,
          ),
        );

    const withConditions = () => {
      const query = baseQuery();
      return allConditions.length > 0
        ? query.where(
            allConditions.length === 1
              ? allConditions[0]
              : and(...allConditions),
          )
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

  /**
   * Execute query with both player join (search) and position join
   */
  private async executeWithBothJoins(
    battingConditions: SQL<unknown>[],
    searchTerm: string,
    position: string,
    orderByClause: SQL<unknown>,
    options: QueryOptions,
  ) {
    const searchPattern = `%${searchTerm}%`;
    const searchCondition = or(
      ilike(PublicSchema.players.firstName, searchPattern),
      ilike(PublicSchema.players.lastName, searchPattern),
    );
    const positionCondition = ilike(
      PublicSchema.careerFieldingByPosition.pos,
      position,
    );

    const allConditions = [...battingConditions, positionCondition];
    if (searchCondition) {
      allConditions.push(searchCondition);
    }

    const baseQuery = () =>
      this.db
        .select()
        .from(PublicSchema.careerBatting)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id),
        )
        .innerJoin(
          PublicSchema.careerFieldingByPosition,
          eq(
            PublicSchema.careerBatting.playerId,
            PublicSchema.careerFieldingByPosition.playerId,
          ),
        );

    const withConditions = () => {
      const query = baseQuery();
      return allConditions.length > 0
        ? query.where(
            allConditions.length === 1
              ? allConditions[0]
              : and(...allConditions),
          )
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

  /**
   * Execute query without player join for simple filtering
   * Uses Drizzle's recommended function-based conditional query building
   */
  private async executeWithoutJoin(
    conditions: SQL<unknown>[],
    orderByClause: SQL<unknown>,
    options: QueryOptions,
  ) {
    // Build complete query using function-based approach - Drizzle recommended pattern
    const baseQuery = () => this.db.select().from(PublicSchema.careerBatting);

    // Apply conditions conditionally
    const withConditions = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(
            conditions.length === 1 ? conditions[0] : and(...conditions),
          )
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
   * Supports all baseball statistics columns for comprehensive sorting
   * Always puts NULL values last regardless of sort direction
   */
  private getOrderByClause(options: QueryOptions): SQL<unknown> {
    const dir = options.orderDirection === 'desc' ? 'DESC' : 'ASC';

    // Map orderBy field names to database columns with NULLS LAST
    switch (options.orderBy) {
      // Player information (requires join with players table)
      case 'lastName':
        return sql`${PublicSchema.players.lastName} ${sql.raw(dir)} NULLS LAST, ${PublicSchema.players.firstName} ${sql.raw(dir)} NULLS LAST`;

      // Basic batting statistics
      case 'games':
        return sql`${PublicSchema.careerBatting.g} ${sql.raw(dir)} NULLS LAST`;
      case 'plateAppearances':
        return sql`${PublicSchema.careerBatting.pa} ${sql.raw(dir)} NULLS LAST`;
      case 'atBats':
        return sql`${PublicSchema.careerBatting.ab} ${sql.raw(dir)} NULLS LAST`;
      case 'runs':
        return sql`${PublicSchema.careerBatting.r} ${sql.raw(dir)} NULLS LAST`;
      case 'hits':
        return sql`${PublicSchema.careerBatting.h} ${sql.raw(dir)} NULLS LAST`;
      case 'doubles':
        return sql`${PublicSchema.careerBatting.doubles} ${sql.raw(dir)} NULLS LAST`;
      case 'triples':
        return sql`${PublicSchema.careerBatting.triples} ${sql.raw(dir)} NULLS LAST`;
      case 'homeRuns':
        return sql`${PublicSchema.careerBatting.hr} ${sql.raw(dir)} NULLS LAST`;
      case 'rbi':
        return sql`${PublicSchema.careerBatting.rbi} ${sql.raw(dir)} NULLS LAST`;

      // Base running
      case 'stolenBases':
        return sql`${PublicSchema.careerBatting.sb} ${sql.raw(dir)} NULLS LAST`;
      case 'caughtStealing':
        return sql`${PublicSchema.careerBatting.cs} ${sql.raw(dir)} NULLS LAST`;

      // Plate discipline
      case 'baseOnBalls':
        return sql`${PublicSchema.careerBatting.bb} ${sql.raw(dir)} NULLS LAST`;
      case 'strikeouts':
        return sql`${PublicSchema.careerBatting.so} ${sql.raw(dir)} NULLS LAST`;
      case 'hitByPitch':
        return sql`${PublicSchema.careerBatting.hbp} ${sql.raw(dir)} NULLS LAST`;
      case 'intentionalBaseOnBalls':
        return sql`${PublicSchema.careerBatting.ibb} ${sql.raw(dir)} NULLS LAST`;

      // Additional statistics
      case 'totalBases':
        return sql`${PublicSchema.careerBatting.tb} ${sql.raw(dir)} NULLS LAST`;
      case 'groundedIntoDoublePlays':
        return sql`${PublicSchema.careerBatting.gidp} ${sql.raw(dir)} NULLS LAST`;
      case 'sacrificeHits':
        return sql`${PublicSchema.careerBatting.sh} ${sql.raw(dir)} NULLS LAST`;

      // Advanced metrics
      case 'offensiveWAR':
        return sql`${PublicSchema.careerBatting.offensiveWar} ${sql.raw(dir)} NULLS LAST`;

      // Note: Calculated percentages (battingAverage, onBasePercentage, etc.)
      // are computed in the GraphQL layer, not in the database view,
      // so they cannot be used for ORDER BY in SQL queries

      default:
        // Default to home runs descending for most interesting results
        return sql`${PublicSchema.careerBatting.hr} DESC NULLS LAST`;
    }
  }

  /**
   * Get count with player join using function-based approach
   */
  async countWithPlayerJoin(options: {
    filters?: StatisticsQueryFilters;
  }): Promise<{ count: number }[]> {
    const filters = options.filters || {};

    // Build batting conditions
    const battingConditions: SQL<unknown>[] = [];
    if (filters.playerId !== undefined) {
      battingConditions.push(
        eq(PublicSchema.careerBatting.playerId, filters.playerId),
      );
    }
    if (filters.minGames !== undefined) {
      battingConditions.push(
        gte(PublicSchema.careerBatting.g, filters.minGames),
      );
    }
    if (filters.minHomeRuns !== undefined) {
      battingConditions.push(
        gte(PublicSchema.careerBatting.hr, filters.minHomeRuns),
      );
    }
    if (filters.minRBI !== undefined) {
      battingConditions.push(
        gte(PublicSchema.careerBatting.rbi, filters.minRBI),
      );
    }

    // Add search condition if provided
    const allConditions = [...battingConditions];
    if (filters.searchTerm) {
      const searchPattern = `%${filters.searchTerm}%`;
      const searchCondition = or(
        ilike(PublicSchema.players.firstName, searchPattern),
        ilike(PublicSchema.players.lastName, searchPattern),
      );
      if (searchCondition) {
        allConditions.push(searchCondition);
      }
    }

    // Build query using function-based approach
    const baseQuery = () =>
      this.db
        .select({ count: count() })
        .from(PublicSchema.careerBatting)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id),
        );

    const finalQuery = () => {
      const query = baseQuery();
      return allConditions.length > 0
        ? query.where(
            allConditions.length === 1
              ? allConditions[0]
              : and(...allConditions),
          )
        : query;
    };

    return await finalQuery().execute();
  }

  /**
   * Get count without player join using function-based approach
   */
  async countWithoutJoin(options: {
    filters?: StatisticsQueryFilters;
  }): Promise<{ count: number }[]> {
    const filters = options.filters || {};

    // Build conditions
    const conditions: SQL<unknown>[] = [];
    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.careerBatting.playerId, filters.playerId),
      );
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
    const baseQuery = () =>
      this.db.select({ count: count() }).from(PublicSchema.careerBatting);

    const finalQuery = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(
            conditions.length === 1 ? conditions[0] : and(...conditions),
          )
        : query;
    };

    return await finalQuery().execute();
  }

  /**
   * Get count with position join (career_fielding_by_position) using function-based approach
   */
  async countWithPositionJoin(options: {
    filters?: StatisticsQueryFilters;
  }): Promise<{ count: number }[]> {
    const filters = options.filters || {};

    const conditions: SQL<unknown>[] = [];
    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.careerBatting.playerId, filters.playerId),
      );
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
    if (filters.position) {
      conditions.push(
        ilike(PublicSchema.careerFieldingByPosition.pos, filters.position),
      );
    }

    const baseQuery = () =>
      this.db
        .select({ count: count() })
        .from(PublicSchema.careerBatting)
        .innerJoin(
          PublicSchema.careerFieldingByPosition,
          eq(
            PublicSchema.careerBatting.playerId,
            PublicSchema.careerFieldingByPosition.playerId,
          ),
        );

    const finalQuery = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(
            conditions.length === 1 ? conditions[0] : and(...conditions),
          )
        : query;
    };

    return await finalQuery().execute();
  }

  /**
   * Get count with both player join (search) and position join
   */
  async countWithBothJoins(options: {
    filters?: StatisticsQueryFilters;
  }): Promise<{ count: number }[]> {
    const filters = options.filters || {};

    const conditions: SQL<unknown>[] = [];
    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.careerBatting.playerId, filters.playerId),
      );
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
    if (filters.position) {
      conditions.push(
        ilike(PublicSchema.careerFieldingByPosition.pos, filters.position),
      );
    }
    if (filters.searchTerm) {
      const searchPattern = `%${filters.searchTerm}%`;
      const searchCondition = or(
        ilike(PublicSchema.players.firstName, searchPattern),
        ilike(PublicSchema.players.lastName, searchPattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const baseQuery = () =>
      this.db
        .select({ count: count() })
        .from(PublicSchema.careerBatting)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id),
        )
        .innerJoin(
          PublicSchema.careerFieldingByPosition,
          eq(
            PublicSchema.careerBatting.playerId,
            PublicSchema.careerFieldingByPosition.playerId,
          ),
        );

    const finalQuery = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(
            conditions.length === 1 ? conditions[0] : and(...conditions),
          )
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

  async executeQuery(
    filters: StatisticsQueryFilters = {},
    options: QueryOptions = {},
  ) {
    const conditions: SQL<unknown>[] = [];

    if (filters.playerId !== undefined) {
      conditions.push(
        eq(PublicSchema.careerPitching.playerId, filters.playerId),
      );
    }
    if (filters.minWins !== undefined) {
      conditions.push(gte(PublicSchema.careerPitching.w, filters.minWins));
    }
    if (filters.minStrikeouts !== undefined) {
      conditions.push(
        gte(PublicSchema.careerPitching.so, filters.minStrikeouts),
      );
    }

    // Determine ordering
    const orderByClause =
      options.orderBy === 'wins'
        ? options.orderDirection === 'desc'
          ? desc(PublicSchema.careerPitching.w)
          : asc(PublicSchema.careerPitching.w)
        : options.orderBy === 'strikeouts'
          ? options.orderDirection === 'desc'
            ? desc(PublicSchema.careerPitching.so)
            : asc(PublicSchema.careerPitching.so)
          : desc(PublicSchema.careerPitching.w);

    // Check if we need player join for search
    if (filters.searchTerm) {
      return this.executeWithPlayerJoin(
        filters,
        conditions,
        orderByClause,
        options,
      );
    } else {
      return this.executeWithoutJoin(conditions, orderByClause, options);
    }
  }

  private async executeWithPlayerJoin(
    filters: StatisticsQueryFilters,
    conditions: SQL<unknown>[],
    orderByClause: SQL<unknown>,
    options: QueryOptions,
  ) {
    // Add search condition
    if (filters.searchTerm) {
      const searchPattern = `%${filters.searchTerm}%`;
      const searchCondition = or(
        ilike(PublicSchema.players.firstName, searchPattern),
        ilike(PublicSchema.players.lastName, searchPattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const baseQuery = () =>
      this.db
        .select()
        .from(PublicSchema.careerPitching)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.careerPitching.playerId, PublicSchema.players.id),
        );

    const withConditions = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(
            conditions.length === 1 ? conditions[0] : and(...conditions),
          )
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
    options: QueryOptions,
  ) {
    const baseQuery = () => this.db.select().from(PublicSchema.careerPitching);

    const withConditions = () => {
      const query = baseQuery();
      return conditions.length > 0
        ? query.where(
            conditions.length === 1 ? conditions[0] : and(...conditions),
          )
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
