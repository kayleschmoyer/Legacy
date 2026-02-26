import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  SQL,
} from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils';
import { runWithInternalClient, runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';
import * as InternalSchema from '../../drizzle/internal/schema';
import { User } from '../../types/DatabaseTypes';

export interface UserFilters {
  ids?: number[];
  email?: string;
  emailLike?: string;
  username?: string;
  usernameLike?: string;
  accessLevel?: 'none' | 'admin';
  hasEmail?: boolean;
}

export interface UserQueryOptions {
  filters?: UserFilters;
  limit?: number;
  offset?: number;
  orderBy?: 'id' | 'email' | 'username';
  orderDirection?: 'asc' | 'desc';
}

/**
 * User service functions for database operations
 */
export class UserService {
  constructor(private options: DbOptions) {}

  /**
   * Get all users with optional filtering and pagination
   */
  async getUsers(queryOptions: UserQueryOptions = {}): Promise<User[]> {
    return runWithPublicClient(this.options, async (db) => {
      let query = db.select().from(PublicSchema.users);

      // Build WHERE clause
      const conditions = queryOptions.filters
        ? this.buildUserFilters(queryOptions.filters)
        : [];

      if (conditions.length > 0) {
        // TypeScript has issues with Drizzle's complex query builder types
        // This is a safe cast since we know the query is valid
        query = query.where(and(...conditions)) as typeof query;
      }

      // Build final query parts
      const orderColumn = queryOptions.orderBy
        ? PublicSchema.users[queryOptions.orderBy]
        : undefined;
      const orderDirection = queryOptions.orderDirection || 'asc';

      if (orderColumn) {
        query = (
          orderDirection === 'desc'
            ? query.orderBy(desc(orderColumn))
            : query.orderBy(asc(orderColumn))
        ) as typeof query;
      }

      if (queryOptions.limit) {
        query = query.limit(queryOptions.limit) as typeof query;
      }

      if (queryOptions.offset) {
        query = query.offset(queryOptions.offset) as typeof query;
      }

      return query.execute();
    });
  }

  /**
   * Get a single user by ID
   */
  async getUserById(id: number): Promise<User | null> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.users)
        .where(eq(PublicSchema.users.id, id))
        .limit(1);

      return results[0] || null;
    });
  }

  /**
   * Get a single user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return runWithPublicClient(this.options, async (db) => {
      const results = await db
        .select()
        .from(PublicSchema.users)
        .where(eq(PublicSchema.users.email, email))
        .limit(1);

      return results[0] || null;
    });
  }

  /**
   * Get users by multiple IDs
   */
  async getUsersByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];

    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.users)
        .where(inArray(PublicSchema.users.id, ids));
    });
  }

  /**
   * Count users with optional filtering
   */
  async countUsers(filters?: UserFilters): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.users);

      const conditions = filters ? this.buildUserFilters(filters) : [];

      let finalQuery = queryBuilder;
      if (conditions.length > 0) {
        // TypeScript has issues with Drizzle's complex query builder types
        // This is a safe cast since we know the query is valid
        finalQuery = finalQuery.where(and(...conditions)) as typeof finalQuery;
      }

      const result = await finalQuery.execute();
      return result[0]?.count || 0;
    });
  }

  /**
   * Search users by email or username
   */
  async searchUsers(searchTerm: string, limit = 10): Promise<User[]> {
    return runWithPublicClient(this.options, async (db) => {
      return db
        .select()
        .from(PublicSchema.users)
        .where(
          or(
            ilike(PublicSchema.users.email, `%${searchTerm}%`),
            ilike(PublicSchema.users.username, `%${searchTerm}%`),
          ),
        )
        .limit(limit);
    });
  }

  /**
   * Update a user's access level in the internal schema.
   * Returns the updated user record from the public view, or null if not found.
   */
  async updateUserAccessLevel(
    userId: number,
    accessLevel: 'none' | 'admin',
  ): Promise<User | null> {
    await runWithInternalClient(this.options, async (db) => {
      await db
        .update(InternalSchema.usersInAppInternal)
        .set({ accessLevel })
        .where(eq(InternalSchema.usersInAppInternal.id, userId));
    });

    return this.getUserById(userId);
  }

  /**
   * Build WHERE conditions from user filters
   */
  private buildUserFilters(filters: UserFilters): SQL[] {
    const conditions: SQL[] = [];

    if (filters.ids && filters.ids.length > 0) {
      conditions.push(inArray(PublicSchema.users.id, filters.ids));
    }

    if (filters.email) {
      conditions.push(eq(PublicSchema.users.email, filters.email));
    }

    if (filters.emailLike) {
      conditions.push(
        ilike(PublicSchema.users.email, `%${filters.emailLike}%`),
      );
    }

    if (filters.username) {
      conditions.push(eq(PublicSchema.users.username, filters.username));
    }

    if (filters.usernameLike) {
      conditions.push(
        ilike(PublicSchema.users.username, `%${filters.usernameLike}%`),
      );
    }

    if (filters.accessLevel) {
      conditions.push(eq(PublicSchema.users.accessLevel, filters.accessLevel));
    }

    if (filters.hasEmail === true) {
      conditions.push(isNotNull(PublicSchema.users.email));
    } else if (filters.hasEmail === false) {
      conditions.push(isNull(PublicSchema.users.email));
    }

    return conditions;
  }
}

/**
 * Factory function to create UserService instance
 */
export function createUserService(options: DbOptions): UserService {
  return new UserService(options);
}
