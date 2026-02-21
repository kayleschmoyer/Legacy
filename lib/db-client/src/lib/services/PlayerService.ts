import { and, count, eq, ilike, inArray, ne, or, sql, SQL } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';
import { Player } from '../../types/DatabaseTypes';

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

export interface PlayerQueryOptions {
  filters?: PlayerFilters;
  limit?: number;
  offset?: number;
  orderBy?:
    | 'id'
    | 'firstName'
    | 'lastName'
    | 'brefId'
    | 'careerGames'
    | 'careerHits'
    | 'careerHomeRuns'
    | 'careerRBI'
    | 'careerRuns'
    | 'careerStolenBases';
  orderDirection?: 'asc' | 'desc';
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

      const isCareerSort = [
        'careerGames',
        'careerHits',
        'careerHomeRuns',
        'careerRBI',
        'careerRuns',
        'careerStolenBases',
      ].includes(queryOptions.orderBy || '');

      if (isCareerSort) {
        queryBuilder = queryBuilder.leftJoin(
          PublicSchema.careerBatting,
          eq(PublicSchema.players.id, PublicSchema.careerBatting.playerId),
        ) as unknown as typeof queryBuilder;
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
          orderColumn = PublicSchema.players[queryOptions.orderBy];
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
}

/**
 * Factory function to create PlayerService instance
 */
export function createPlayerService(options: DbOptions): PlayerService {
  return new PlayerService(options);
}
