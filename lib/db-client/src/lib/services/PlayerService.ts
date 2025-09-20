import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
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
}

export interface PlayerQueryOptions {
  filters?: PlayerFilters;
  limit?: number;
  offset?: number;
  orderBy?: 'id' | 'firstName' | 'lastName' | 'brefId';
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
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db.select().from(PublicSchema.players);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildPlayerFilters(queryOptions.filters)
        : [];

      // Build final query parts
      const orderColumn = queryOptions.orderBy
        ? PublicSchema.players[queryOptions.orderBy]
        : undefined;
      const orderDirection = queryOptions.orderDirection || 'asc';

      // Execute query with all conditions
      let finalQuery = queryBuilder;

      if (conditions.length > 0) {
        // TypeScript has issues with Drizzle's complex query builder types
        // This is a safe cast since we know the query is valid
        finalQuery = finalQuery.where(and(...conditions)) as typeof finalQuery;
      }

      if (orderColumn) {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery.orderBy(desc(orderColumn)) as typeof finalQuery)
            : (finalQuery.orderBy(asc(orderColumn)) as typeof finalQuery);
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

    return conditions;
  }
}

/**
 * Factory function to create PlayerService instance
 */
export function createPlayerService(options: DbOptions): PlayerService {
  return new PlayerService(options);
}
