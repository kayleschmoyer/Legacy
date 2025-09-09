import { and, asc, count, desc, eq, ilike, inArray, SQL } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';
import { Player } from '../../types/DatabaseTypes';

export interface PlayerFilters {
  ids?: number[];
  name?: string;
  nameLike?: string;
  brefId?: string;
}

export interface PlayerQueryOptions {
  filters?: PlayerFilters;
  limit?: number;
  offset?: number;
  orderBy?: 'id' | 'name' | 'brefId';
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
        finalQuery = finalQuery.where(and(...conditions)) as any;
      }

      if (orderColumn) {
        finalQuery =
          orderDirection === 'desc'
            ? (finalQuery.orderBy(desc(orderColumn)) as any)
            : (finalQuery.orderBy(asc(orderColumn)) as any);
      }

      if (queryOptions.limit) {
        finalQuery = finalQuery.limit(queryOptions.limit) as any;
      }

      if (queryOptions.offset) {
        finalQuery = finalQuery.offset(queryOptions.offset) as any;
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
      const queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.players);

      const conditions = filters ? this.buildPlayerFilters(filters) : [];

      let finalQuery = queryBuilder;
      if (conditions.length > 0) {
        finalQuery = finalQuery.where(and(...conditions)) as any;
      }

      const result = await finalQuery.execute();
      return result[0]?.count || 0;
    });
  }

  /**
   * Search players by name
   */
  async searchPlayers(searchTerm: string, limit = 10): Promise<Player[]> {
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.players)
        .where(ilike(PublicSchema.players.name, `%${searchTerm}%`))
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

    if (filters.name) {
      conditions.push(eq(PublicSchema.players.name, filters.name));
    }

    if (filters.nameLike) {
      conditions.push(
        ilike(PublicSchema.players.name, `%${filters.nameLike}%`)
      );
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
