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
 * Build a name-search OR condition that matches first name, last name, or the
 * full name expression used by the trigram index (idx_players_name_trgm).
 *
 * The index is on `lower(first_name || ' ' || last_name)`, so the full-name
 * branch uses the identical expression with a lowercased pattern to allow
 * Postgres to use the index.
 */
function buildPlayerNameSearch(searchTerm: string): SQL<unknown> | undefined {
  const searchPattern = `%${searchTerm}%`;
  const fullNamePattern = `%${searchTerm.toLowerCase()}%`;
  return or(
    ilike(PublicSchema.players.firstName, searchPattern),
    ilike(PublicSchema.players.lastName, searchPattern),
    ilike(
      sql`lower(${PublicSchema.players.firstName} || ' ' || ${PublicSchema.players.lastName})`,
      fullNamePattern,
    ),
  );
}

function battingTeamFilter(team: string): SQL<unknown> {
  return sql`${PublicSchema.careerBatting.playerId} IN (SELECT player_id FROM season_batting WHERE team = ${team})`;
}

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
  team?: string;
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
    // Calculated percentages (computed inline via SQL expressions)
    | 'battingAverage'
    | 'onBasePercentage'
    | 'sluggingPercentage'
    | 'ops'
    // Fantasy scoring (computed inline via SQL using DEFAULT_BATTING_SCORING weights)
    | 'totalScore'
    | 'avgPointsPerGame'
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
 * Map a `QueryOptions.orderBy` value to the Drizzle SQL ORDER BY clause used
 * against the `career_batting` view. Exported so the mapping can be unit
 * tested without a database connection.
 *
 * `totalScore` and `avgPointsPerGame` mirror `DEFAULT_BATTING_SCORING` from
 * lib/scoring/src/baseball/DefaultScoring.ts. The weights are inlined rather
 * than imported because `@legacy-sports/scoring` depends on
 * `@legacy-sports/db-client` — pulling the package back in would create a
 * dependency cycle.
 */
export function getCareerBattingOrderByClause(
  options: QueryOptions,
): SQL<unknown> {
  const dir = options.orderDirection === 'desc' ? 'DESC' : 'ASC';

  switch (options.orderBy) {
    case 'lastName':
      return sql`${PublicSchema.players.lastName} ${sql.raw(dir)} NULLS LAST, ${PublicSchema.players.firstName} ${sql.raw(dir)} NULLS LAST`;

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

    case 'stolenBases':
      return sql`${PublicSchema.careerBatting.sb} ${sql.raw(dir)} NULLS LAST`;
    case 'caughtStealing':
      return sql`${PublicSchema.careerBatting.cs} ${sql.raw(dir)} NULLS LAST`;

    case 'baseOnBalls':
      return sql`${PublicSchema.careerBatting.bb} ${sql.raw(dir)} NULLS LAST`;
    case 'strikeouts':
      return sql`${PublicSchema.careerBatting.so} ${sql.raw(dir)} NULLS LAST`;
    case 'hitByPitch':
      return sql`${PublicSchema.careerBatting.hbp} ${sql.raw(dir)} NULLS LAST`;
    case 'intentionalBaseOnBalls':
      return sql`${PublicSchema.careerBatting.ibb} ${sql.raw(dir)} NULLS LAST`;

    case 'totalBases':
      return sql`${PublicSchema.careerBatting.tb} ${sql.raw(dir)} NULLS LAST`;
    case 'groundedIntoDoublePlays':
      return sql`${PublicSchema.careerBatting.gidp} ${sql.raw(dir)} NULLS LAST`;
    case 'sacrificeHits':
      return sql`${PublicSchema.careerBatting.sh} ${sql.raw(dir)} NULLS LAST`;

    case 'offensiveWAR':
      return sql`${PublicSchema.careerBatting.offensiveWar} ${sql.raw(dir)} NULLS LAST`;

    case 'battingAverage':
      return sql`(${PublicSchema.careerBatting.h}::numeric / NULLIF(${PublicSchema.careerBatting.ab}, 0)) ${sql.raw(dir)} NULLS LAST`;
    case 'onBasePercentage':
      return sql`((${PublicSchema.careerBatting.h} + ${PublicSchema.careerBatting.bb} + ${PublicSchema.careerBatting.hbp})::numeric / NULLIF(${PublicSchema.careerBatting.ab} + ${PublicSchema.careerBatting.bb} + ${PublicSchema.careerBatting.hbp} + ${PublicSchema.careerBatting.sh}, 0)) ${sql.raw(dir)} NULLS LAST`;
    case 'sluggingPercentage':
      return sql`(${PublicSchema.careerBatting.tb}::numeric / NULLIF(${PublicSchema.careerBatting.ab}, 0)) ${sql.raw(dir)} NULLS LAST`;
    case 'ops':
      return sql`((${PublicSchema.careerBatting.h} + ${PublicSchema.careerBatting.bb} + ${PublicSchema.careerBatting.hbp})::numeric / NULLIF(${PublicSchema.careerBatting.ab} + ${PublicSchema.careerBatting.bb} + ${PublicSchema.careerBatting.hbp} + ${PublicSchema.careerBatting.sh}, 0) + ${PublicSchema.careerBatting.tb}::numeric / NULLIF(${PublicSchema.careerBatting.ab}, 0)) ${sql.raw(dir)} NULLS LAST`;

    case 'totalScore':
      return sql`(COALESCE(${PublicSchema.careerBatting.h}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.doubles}, 0) * 2 + COALESCE(${PublicSchema.careerBatting.triples}, 0) * 3 + COALESCE(${PublicSchema.careerBatting.hr}, 0) * 4 + COALESCE(${PublicSchema.careerBatting.r}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.rbi}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.sb}, 0) * 2 + COALESCE(${PublicSchema.careerBatting.cs}, 0) * -1 + COALESCE(${PublicSchema.careerBatting.hbp}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.so}, 0) * -0.5) ${sql.raw(dir)} NULLS LAST`;
    case 'avgPointsPerGame':
      return sql`((COALESCE(${PublicSchema.careerBatting.h}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.doubles}, 0) * 2 + COALESCE(${PublicSchema.careerBatting.triples}, 0) * 3 + COALESCE(${PublicSchema.careerBatting.hr}, 0) * 4 + COALESCE(${PublicSchema.careerBatting.r}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.rbi}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.sb}, 0) * 2 + COALESCE(${PublicSchema.careerBatting.cs}, 0) * -1 + COALESCE(${PublicSchema.careerBatting.hbp}, 0) * 1 + COALESCE(${PublicSchema.careerBatting.so}, 0) * -0.5)::numeric / NULLIF(${PublicSchema.careerBatting.g}, 0)) ${sql.raw(dir)} NULLS LAST`;

    default:
      return sql`${PublicSchema.careerBatting.hr} DESC NULLS LAST`;
  }
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
    if (filters.minBattingAvg !== undefined) {
      battingConditions.push(
        sql`${PublicSchema.careerBatting.ab} > 0 AND (${PublicSchema.careerBatting.h}::numeric / ${PublicSchema.careerBatting.ab}::numeric) >= ${filters.minBattingAvg}`,
      );
    }
    if (filters.team !== undefined) {
      battingConditions.push(battingTeamFilter(filters.team));
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
      const searchCondition = buildPlayerNameSearch(searchTerm);
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
    const searchCondition = buildPlayerNameSearch(searchTerm);
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
    return getCareerBattingOrderByClause(options);
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
    if (filters.minBattingAvg !== undefined) {
      battingConditions.push(
        sql`${PublicSchema.careerBatting.ab} > 0 AND (${PublicSchema.careerBatting.h}::numeric / ${PublicSchema.careerBatting.ab}::numeric) >= ${filters.minBattingAvg}`,
      );
    }
    if (filters.team !== undefined) {
      battingConditions.push(battingTeamFilter(filters.team));
    }

    // Add search condition if provided
    const allConditions = [...battingConditions];
    if (filters.searchTerm) {
      const searchCondition = buildPlayerNameSearch(filters.searchTerm);
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
    if (filters.minBattingAvg !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerBatting.ab} > 0 AND (${PublicSchema.careerBatting.h}::numeric / ${PublicSchema.careerBatting.ab}::numeric) >= ${filters.minBattingAvg}`,
      );
    }
    if (filters.team !== undefined) {
      conditions.push(battingTeamFilter(filters.team));
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
    if (filters.minBattingAvg !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerBatting.ab} > 0 AND (${PublicSchema.careerBatting.h}::numeric / ${PublicSchema.careerBatting.ab}::numeric) >= ${filters.minBattingAvg}`,
      );
    }
    if (filters.team !== undefined) {
      conditions.push(battingTeamFilter(filters.team));
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
    if (filters.minBattingAvg !== undefined) {
      conditions.push(
        sql`${PublicSchema.careerBatting.ab} > 0 AND (${PublicSchema.careerBatting.h}::numeric / ${PublicSchema.careerBatting.ab}::numeric) >= ${filters.minBattingAvg}`,
      );
    }
    if (filters.team !== undefined) {
      conditions.push(battingTeamFilter(filters.team));
    }
    if (filters.position) {
      conditions.push(
        ilike(PublicSchema.careerFieldingByPosition.pos, filters.position),
      );
    }
    if (filters.searchTerm) {
      const searchCondition = buildPlayerNameSearch(filters.searchTerm);
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
      const searchCondition = buildPlayerNameSearch(filters.searchTerm);
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
