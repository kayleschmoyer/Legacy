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
  like,
  lt,
  or,
  SQL,
} from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
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
  /** OR search across email and username (case-insensitive) */
  searchTerm?: string;
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

      // Server-side OR search across email and username
      if (queryOptions.searchTerm) {
        conditions.push(
          or(
            ilike(PublicSchema.users.email, `%${queryOptions.searchTerm}%`),
            ilike(PublicSchema.users.username, `%${queryOptions.searchTerm}%`),
          ) as SQL,
        );
      }

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
   * Count users with optional filtering and/or search term
   */
  async countUsers(options?: {
    filters?: UserFilters;
    searchTerm?: string;
  }): Promise<number> {
    return runWithPublicClient(this.options, async (db) => {
      const queryBuilder = db
        .select({ count: count() })
        .from(PublicSchema.users);

      const conditions = options?.filters
        ? this.buildUserFilters(options.filters)
        : [];

      if (options?.searchTerm) {
        conditions.push(
          or(
            ilike(PublicSchema.users.email, `%${options.searchTerm}%`),
            ilike(PublicSchema.users.username, `%${options.searchTerm}%`),
          ) as SQL,
        );
      }

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
   * Update a user's username in the internal schema.
   * Returns the updated user record from the public view, or null if not found.
   */
  async updateUsername(userId: number, username: string): Promise<User | null> {
    await runWithInternalClient(this.options, async (db) => {
      await db
        .update(InternalSchema.usersInAppInternal)
        .set({ username })
        .where(eq(InternalSchema.usersInAppInternal.id, userId));
    });

    return this.getUserById(userId);
  }

  /**
   * Update a user's avatar URL in the internal schema.
   * Returns the updated user record from the public view, or null if not found.
   */
  async updateUserAvatar(
    userId: number,
    avatarUrl: string | null,
  ): Promise<User | null> {
    await runWithInternalClient(this.options, async (db) => {
      await db
        .update(InternalSchema.usersInAppInternal)
        .set({ avatarUrl })
        .where(eq(InternalSchema.usersInAppInternal.id, userId));
    });

    return this.getUserById(userId);
  }

  /**
   * Find users whose email matches a SQL LIKE pattern and that were created
   * before a cut-off date, and delete them. Used to sweep up orphaned test
   * fixtures (e.g. the `int-commissioner-*@test.legacysports.dev` users left
   * over from the short-lived per-run-email producer in LS-4917).
   *
   * The age guard is mandatory — callers cannot opt out — so concurrent test
   * runs that recently created the same kind of user cannot have their
   * fixtures yanked out from under them.
   *
   * Returns the set of matched users (always) and, when `dryRun` is false, the
   * per-user delete outcome. Errors surface from FK constraints that don't
   * CASCADE — those rows are skipped rather than aborting the whole sweep.
   */
  async deleteLeakedTestUsers(opts: {
    emailLikePattern: string;
    minAgeMs: number;
    dryRun: boolean;
    now?: Date;
  }): Promise<{
    matched: Array<{ id: number; email: string; createdAt: Date }>;
    deleted: number;
    errors: Array<{ id: number; email: string; message: string }>;
  }> {
    const now = opts.now ?? new Date();
    const cutoff = new Date(now.getTime() - opts.minAgeMs);

    return runWithInternalClient(this.options, async (db) => {
      const matched = await db
        .select({
          id: InternalSchema.usersInAppInternal.id,
          email: InternalSchema.usersInAppInternal.email,
          createdAt: InternalSchema.usersInAppInternal.createdAt,
        })
        .from(InternalSchema.usersInAppInternal)
        .where(
          and(
            like(
              InternalSchema.usersInAppInternal.email,
              opts.emailLikePattern,
            ),
            lt(InternalSchema.usersInAppInternal.createdAt, cutoff),
          ),
        );

      if (opts.dryRun || matched.length === 0) {
        return { matched, deleted: 0, errors: [] };
      }

      const errors: Array<{ id: number; email: string; message: string }> = [];
      let deleted = 0;
      for (const row of matched) {
        try {
          await db
            .delete(InternalSchema.usersInAppInternal)
            .where(eq(InternalSchema.usersInAppInternal.id, row.id));
          deleted++;
        } catch (err) {
          errors.push({
            id: row.id,
            email: row.email,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { matched, deleted, errors };
    });
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
