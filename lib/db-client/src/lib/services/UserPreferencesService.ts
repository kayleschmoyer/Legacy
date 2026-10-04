import { eq, sql } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';

export type StatsFormat = 'standard' | 'expanded';

export interface UserPreferences {
  id: number;
  userId: number;
  statsFormat: StatsFormat;
  audioEnabled: boolean;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferencesUpdate {
  statsFormat?: StatsFormat;
  audioEnabled?: boolean;
  /** When true, stamps onboarding as completed — a no-op if already set (LS-10378). */
  markOnboardingComplete?: boolean;
}

const VALID_STATS_FORMATS: readonly StatsFormat[] = ['standard', 'expanded'];

/**
 * Normalize a raw stats_format value from the database (a free-form varchar)
 * to a known StatsFormat, defaulting to 'standard' for anything unexpected.
 */
function normalizeStatsFormat(value: string | null | undefined): StatsFormat {
  return value === 'expanded' ? 'expanded' : 'standard';
}

/**
 * Server-side user display preferences (LS-7138 / PST-090).
 *
 * Persists the stats-format preference per user so it survives clearing site
 * data and stays consistent across devices, instead of living only in the
 * browser's localStorage. LS-10111 added `audioEnabled` on the same basis.
 */
export class UserPreferencesService {
  constructor(private options: DbOptions) {}

  /**
   * Get a user's display preferences, or null if none have been saved yet.
   */
  async getUserPreferences(userId: number): Promise<UserPreferences | null> {
    return runWithPublicClient(this.options, async (db) => {
      const result = await db
        .select()
        .from(PublicSchema.userPreferences)
        .where(eq(PublicSchema.userPreferences.userId, userId))
        .limit(1);

      if (result.length === 0) return null;

      const pref = result[0];
      return {
        id: Number(pref.id),
        userId: Number(pref.userId),
        statsFormat: normalizeStatsFormat(pref.statsFormat),
        audioEnabled: pref.audioEnabled ?? false,
        onboardingCompletedAt: pref.onboardingCompletedAt ?? null,
        createdAt: pref.createdAt,
        updatedAt: pref.updatedAt,
      };
    });
  }

  /**
   * Upsert a user's display preferences. Only fields present in `updates` are
   * changed; the row is created on first write.
   */
  async updateUserPreferences(
    userId: number,
    updates: UserPreferencesUpdate,
  ): Promise<UserPreferences> {
    // Reject unknown stats-format values rather than persisting garbage.
    const cleaned: UserPreferencesUpdate = {};
    if (
      updates.statsFormat !== undefined &&
      VALID_STATS_FORMATS.includes(updates.statsFormat)
    ) {
      cleaned.statsFormat = updates.statsFormat;
    }
    // Audio is a plain boolean — accept it only when genuinely boolean, so a
    // stray non-boolean can't flip the opt-in gate on (LS-10111).
    if (typeof updates.audioEnabled === 'boolean') {
      cleaned.audioEnabled = updates.audioEnabled;
    }

    const markOnboardingComplete = updates.markOnboardingComplete === true;

    return runWithPublicClient(this.options, async (db) => {
      const existing = await db
        .select()
        .from(PublicSchema.userPreferences)
        .where(eq(PublicSchema.userPreferences.userId, userId))
        .limit(1);

      let result;
      if (existing.length > 0) {
        if (Object.keys(cleaned).length === 0 && !markOnboardingComplete) {
          // Nothing valid to change — return the existing row unchanged. This
          // also avoids an empty `.set()` clause, which Drizzle rejects.
          result = existing[0];
        } else {
          // `updated_at` is maintained by the update_user_preferences_updated_at
          // BEFORE UPDATE trigger, so it is intentionally not set here.
          [result] = await db
            .update(PublicSchema.userPreferences)
            .set({
              ...cleaned,
              // Set-once, atomically in SQL: COALESCE keeps any existing
              // timestamp, so a concurrent or repeated call never overwrites it
              // and nothing ever clears it (LS-10378).
              ...(markOnboardingComplete && {
                onboardingCompletedAt: sql`COALESCE(${PublicSchema.userPreferences.onboardingCompletedAt}, now())`,
              }),
            })
            .where(eq(PublicSchema.userPreferences.userId, userId))
            .returning();
        }
      } else {
        [result] = await db
          .insert(PublicSchema.userPreferences)
          .values({
            userId,
            ...cleaned,
            ...(markOnboardingComplete && {
              onboardingCompletedAt: new Date(),
            }),
          })
          .returning();
      }

      return {
        id: Number(result.id),
        userId: Number(result.userId),
        statsFormat: normalizeStatsFormat(result.statsFormat),
        audioEnabled: result.audioEnabled ?? false,
        onboardingCompletedAt: result.onboardingCompletedAt ?? null,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    });
  }
}

/**
 * Factory function to create a user preferences service
 */
export function createUserPreferencesService(
  options: DbOptions,
): UserPreferencesService {
  return new UserPreferencesService(options);
}
