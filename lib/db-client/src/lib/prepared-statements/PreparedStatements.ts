import { desc, eq, gte } from 'drizzle-orm';
import { PublicSchema } from '../client/PublicDbClient';
import type { PublicDb } from '../client/PublicDbClient';

/**
 * Type-safe query utilities for common operations
 * This approach provides better type safety than prepared statements
 * while maintaining good performance for frequently used queries
 */

/**
 * Utility class for common database queries with proper typing
 */
export class TypeSafeQueryUtils {
  /**
   * Get career batting stats by player ID with full type safety
   */
  static async getCareerBattingByPlayer(db: PublicDb, playerId: number) {
    return await db
      .select()
      .from(PublicSchema.careerBatting)
      .where(eq(PublicSchema.careerBatting.playerId, playerId))
      .execute();
  }

  /**
   * Get career pitching stats by player ID with full type safety
   */
  static async getCareerPitchingByPlayer(db: PublicDb, playerId: number) {
    return await db
      .select()
      .from(PublicSchema.careerPitching)
      .where(eq(PublicSchema.careerPitching.playerId, playerId))
      .execute();
  }

  /**
   * Get career fielding stats by player ID with full type safety
   */
  static async getCareerFieldingByPlayer(db: PublicDb, playerId: number) {
    return await db
      .select()
      .from(PublicSchema.careerFielding)
      .where(eq(PublicSchema.careerFielding.playerId, playerId))
      .execute();
  }

  /**
   * Get players with minimum home runs with proper typing and joining
   */
  static async getPlayersWithMinHomeRuns(db: PublicDb, minHomeRuns: number, limit?: number) {
    const baseQuery = db
      .select()
      .from(PublicSchema.careerBatting)
      .innerJoin(PublicSchema.players, eq(PublicSchema.careerBatting.playerId, PublicSchema.players.id))
      .where(gte(PublicSchema.careerBatting.hr, minHomeRuns))
      .orderBy(desc(PublicSchema.careerBatting.hr))
      .$dynamic();

    if (limit !== undefined) {
      return await baseQuery.limit(limit).execute();
    }
    
    return await baseQuery.execute();
  }

  /**
   * Get players with minimum wins with proper typing and joining
   */
  static async getPlayersWithMinWins(db: PublicDb, minWins: number, limit?: number) {
    const baseQuery = db
      .select()
      .from(PublicSchema.careerPitching)
      .innerJoin(PublicSchema.players, eq(PublicSchema.careerPitching.playerId, PublicSchema.players.id))
      .where(gte(PublicSchema.careerPitching.w, minWins))
      .orderBy(desc(PublicSchema.careerPitching.w))
      .$dynamic();

    if (limit !== undefined) {
      return await baseQuery.limit(limit).execute();
    }
    
    return await baseQuery.execute();
  }

  /**
   * Get eligible positions for a player with full type safety
   */
  static async getPlayerEligiblePositions(db: PublicDb, playerId: number) {
    return await db
      .select()
      .from(PublicSchema.playerEligiblePositions)
      .where(eq(PublicSchema.playerEligiblePositions.playerId, playerId))
      .execute();
  }

  /**
   * Get season batting stats for a player with full type safety
   */
  static async getSeasonBattingByPlayer(db: PublicDb, playerId: number, season?: number) {
    const baseQuery = db
      .select()
      .from(PublicSchema.seasonBatting)
      .where(eq(PublicSchema.seasonBatting.playerId, playerId))
      .$dynamic();

    if (season !== undefined) {
      return await baseQuery
        .where(eq(PublicSchema.seasonBatting.season, season))
        .execute();
    }

    return await baseQuery.execute();
  }

  /**
   * Get season pitching stats for a player with full type safety
   */
  static async getSeasonPitchingByPlayer(db: PublicDb, playerId: number, season?: number) {
    const baseQuery = db
      .select()
      .from(PublicSchema.seasonPitching)
      .where(eq(PublicSchema.seasonPitching.playerId, playerId))
      .$dynamic();

    if (season !== undefined) {
      return await baseQuery
        .where(eq(PublicSchema.seasonPitching.season, season))
        .execute();
    }

    return await baseQuery.execute();
  }
}
