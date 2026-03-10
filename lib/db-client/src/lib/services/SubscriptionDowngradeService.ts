/**
 * SubscriptionDowngradeService
 *
 * Applies data-restriction rules when a user's subscription tier drops from
 * 'premium' to 'free'.  The general contract is: **never delete user data —
 * only restrict access**.  In-progress seasons are grandfathered; only
 * structural/setting changes are made to accommodate the free tier.
 *
 * Rules applied on downgrade:
 *   1. Leagues beyond the free-tier limit (3): marked tier-frozen (read-only).
 *      The lowest-numbered (oldest) leagues are kept active first.
 *   2. Active salary-cap leagues: salary cap features disabled.
 *   3. Active FAAB-waiver leagues: waiver type converted to standard.
 *   4. Mock-draft limit (2/week) is re-enforced by the existing check in
 *      initialize-mock-draft — no separate action needed here.
 *   5. Premium-gated features (player comparison, projections, narratives,
 *      draft recommendations) are gated at the GraphQL resolver level via
 *      getSubscriptionTier — no action needed here.
 */

import { and, asc, eq, isNull, not } from 'drizzle-orm';
import { DbOptions } from '@legacy-sports/utils/node';
import { LOGGER } from '@legacy-sports/logging';
import { runWithPublicClient } from '../client/Helpers';
import { PublicSchema } from '../client/PublicDbClient';

/** Maximum number of active (non-mock-draft) leagues for free-tier users. */
export const FREE_TIER_LEAGUE_LIMIT = 3;

/**
 * Apply subscription downgrade rules for a user transitioning from premium to
 * free.  This function is idempotent: calling it multiple times for the same
 * user will not cause double-freezing or incorrect data.
 *
 * @param userId  The internal user ID whose tier just dropped to free.
 * @param dbOptions  DB connection options (passed to runWithPublicClient).
 */
export async function handleSubscriptionDowngrade(
  userId: number,
  dbOptions: DbOptions,
): Promise<void> {
  await runWithPublicClient(dbOptions, async (db) => {
    // Load all real (non-mock) leagues owned by this user, oldest-first.
    // Oldest leagues are treated as the ones to keep active; excess (newer)
    // leagues are tier-frozen.
    const ownedLeagues = await db
      .select({
        id: PublicSchema.leagues.id,
        salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled,
        waiverType: PublicSchema.leagues.waiverType,
        tierFrozenAt: PublicSchema.leagues.tierFrozenAt,
        frozenAt: PublicSchema.leagues.frozenAt,
      })
      .from(PublicSchema.leagues)
      .where(
        and(
          eq(PublicSchema.leagues.owner, userId),
          eq(PublicSchema.leagues.isMockDraft, false),
        ),
      )
      .orderBy(asc(PublicSchema.leagues.id));

    if (ownedLeagues.length === 0) return;

    const activeLeagues = ownedLeagues.slice(0, FREE_TIER_LEAGUE_LIMIT);
    const excessLeagues = ownedLeagues.slice(FREE_TIER_LEAGUE_LIMIT);

    const now = new Date();

    // ── 1. Tier-freeze leagues beyond the free-tier limit ──────────────────
    for (const league of excessLeagues) {
      if (league.tierFrozenAt) continue; // already frozen — skip
      await db
        .update(PublicSchema.leagues)
        .set({ tierFrozenAt: now })
        .where(eq(PublicSchema.leagues.id, league.id));
      LOGGER.info('Tier-frozen league on downgrade', {
        userId,
        leagueId: league.id,
      });
    }

    // ── 2 & 3. Convert premium-only features in active leagues ─────────────
    for (const league of activeLeagues) {
      const updates: Partial<{
        salaryCapEnabled: boolean;
        salaryCap: null;
        salaryFloor: null;
        luxuryTaxThreshold: null;
        waiverType: 'standard';
      }> = {};

      if (league.salaryCapEnabled) {
        // Disable salary cap; preserve the values so they can be restored on
        // re-upgrade (data is never deleted per the general rule).
        updates.salaryCapEnabled = false;
        LOGGER.info('Disabled salary cap for league on tier downgrade', {
          userId,
          leagueId: league.id,
        });
      }

      if (league.waiverType === 'faab') {
        updates.waiverType = 'standard';
        LOGGER.info('Converted FAAB waivers to standard on tier downgrade', {
          userId,
          leagueId: league.id,
        });
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(PublicSchema.leagues)
          .set(updates)
          .where(eq(PublicSchema.leagues.id, league.id));
      }
    }

    LOGGER.info('Subscription downgrade data handling complete', {
      userId,
      totalLeagues: ownedLeagues.length,
      activeLeagues: activeLeagues.length,
      frozenLeagues: excessLeagues.length,
    });
  });
}

/**
 * Re-apply tier restrictions for a user whose free-tier active leagues have
 * been re-selected via the `setActiveLeagues` mutation.
 *
 * - Leagues in `activeLeagueIds` (up to FREE_TIER_LEAGUE_LIMIT): clear
 *   tierFrozenAt.
 * - All other real leagues owned by the user: set tierFrozenAt if not already
 *   set.
 *
 * Only operates when the user is still on the free tier (the caller must
 * verify tier before calling this function).
 *
 * @param userId         Internal user ID.
 * @param activeLeagueIds  IDs of leagues the user wants to keep active (≤ 3).
 * @param dbOptions      DB connection options.
 */
export async function reapplyLeagueRestrictions(
  userId: number,
  activeLeagueIds: number[],
  dbOptions: DbOptions,
): Promise<void> {
  await runWithPublicClient(dbOptions, async (db) => {
    const ownedLeagues = await db
      .select({
        id: PublicSchema.leagues.id,
        tierFrozenAt: PublicSchema.leagues.tierFrozenAt,
        frozenAt: PublicSchema.leagues.frozenAt,
      })
      .from(PublicSchema.leagues)
      .where(
        and(
          eq(PublicSchema.leagues.owner, userId),
          eq(PublicSchema.leagues.isMockDraft, false),
        ),
      );

    const ownedIds = new Set(ownedLeagues.map((l) => l.id));
    const requestedActive = new Set(
      activeLeagueIds.filter((id) => ownedIds.has(id)),
    );
    const now = new Date();

    for (const league of ownedLeagues) {
      if (requestedActive.has(league.id)) {
        // Activate: clear tierFrozenAt
        if (league.tierFrozenAt) {
          await db
            .update(PublicSchema.leagues)
            .set({ tierFrozenAt: null })
            .where(eq(PublicSchema.leagues.id, league.id));
        }
      } else {
        // Deactivate: set tierFrozenAt if not already frozen
        if (!league.tierFrozenAt) {
          await db
            .update(PublicSchema.leagues)
            .set({ tierFrozenAt: now })
            .where(eq(PublicSchema.leagues.id, league.id));
        }
      }
    }

    LOGGER.info('Reapplied tier league restrictions', {
      userId,
      activeLeagueIds,
    });
  });
}

/**
 * Clear all tier-based league freezes for a user who has upgraded to premium.
 * Called from the stripe webhook when tier goes free → premium.
 *
 * @param userId     Internal user ID.
 * @param dbOptions  DB connection options.
 */
export async function clearLeagueTierFreezes(
  userId: number,
  dbOptions: DbOptions,
): Promise<void> {
  await runWithPublicClient(dbOptions, async (db) => {
    const result = await db
      .update(PublicSchema.leagues)
      .set({ tierFrozenAt: null })
      .where(
        and(
          eq(PublicSchema.leagues.owner, userId),
          not(isNull(PublicSchema.leagues.tierFrozenAt)),
        ),
      );

    LOGGER.info('Cleared tier freezes on subscription upgrade', {
      userId,
    });

    return result;
  });
}
