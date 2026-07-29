/**
 * Keeper designations domain — Helper utilities (LS-8673)
 *
 * Eligibility rules enforced server-side per LS-8385/LS-8671 keeper settings:
 *  - draft-lock check: designations are frozen once the league's draft goes live
 *  - rookie exemption: a player with zero recorded career MLB games (LS-8671
 *    `players.total_games`) is treated as a rookie. There is no dedicated
 *    "rookie season" field on the historical player dataset, so `totalGames
 *    === 0` is the closest available signal and is used as the rookieExempt
 *    definition — see the LS-8673 Implementation Notes on the Jira ticket.
 *  - keeperCount cap: how many *counted* (non-exempt-rookie, when
 *    rookieExempt is on) pending/locked designations a team may hold
 *  - maxConsecutiveKeeps: how many consecutive prior seasons (walking the
 *    `previousLeagueId` lineage chain) the same manager has kept the same
 *    player, matched by userId since team ids are not stable across
 *    renewLeague season transitions
 */
import type { PublicDb } from '@legacy-sports/db-client';
import { getLeagueLineage, PublicSchema } from '@legacy-sports/db-client';
import { and, eq, inArray } from 'drizzle-orm';

/** League draftStatus values that mean "the draft has gone live" — keeper
 *  designations lock once the league leaves 'not-started'/'queued'. */
export const DRAFT_LIVE_STATUSES = ['in-progress', 'paused', 'completed'] as [
  string,
  string,
  string,
];

export function isDraftLive(draftStatus: string | null | undefined): boolean {
  return !!draftStatus && DRAFT_LIVE_STATUSES.includes(draftStatus);
}

/** A player with zero recorded career MLB games is treated as a rookie for
 *  keeper eligibility purposes (see module docblock). */
export function isRookiePlayer(totalGames: number | null | undefined): boolean {
  return (totalGames ?? 0) === 0;
}

/**
 * Resolve the caller's teamId for a league from league_members. Returns null
 * when the user has no team in that league (never joined, or a spectator).
 */
export async function resolveTeamIdForUser(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<number | null> {
  const [membership] = await db
    .select({ teamId: PublicSchema.leagueMembers.teamId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);
  return membership?.teamId ?? null;
}

/**
 * Count this team's currently "counted" keeper designations for a season —
 * pending or locked designations, excluding rookie-exempt players when the
 * league's keeperSettings.rookieExempt is enabled (rookies do not consume a
 * keeperCount slot).
 */
export async function countCountedKeeperDesignations(
  db: PublicDb,
  params: {
    leagueId: number;
    teamId: number;
    season: number;
    rookieExempt: boolean;
  },
): Promise<number> {
  const rows = await db
    .select({
      totalGames: PublicSchema.players.totalGames,
    })
    .from(PublicSchema.keeperDesignations)
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.players.id, PublicSchema.keeperDesignations.playerId),
    )
    .where(
      and(
        eq(PublicSchema.keeperDesignations.leagueId, params.leagueId),
        eq(PublicSchema.keeperDesignations.teamId, params.teamId),
        eq(PublicSchema.keeperDesignations.season, params.season),
        inArray(PublicSchema.keeperDesignations.status, ['pending', 'locked']),
      ),
    );

  if (!params.rookieExempt) return rows.length;
  return rows.filter((r) => !isRookiePlayer(r.totalGames)).length;
}

/**
 * Walk the `previousLeagueId` lineage chain backward from `leagueId` and
 * count the number of immediately-preceding, unbroken seasons in which
 * `userId`'s team held an 'applied' keeper designation for `playerId`.
 *
 * Team ids reset every season (renewLeague creates fresh team rows), so the
 * same manager is matched across seasons via league_members.userId rather
 * than teamId. The walk stops as soon as either the chain ends, the manager
 * had no team that season, or the streak breaks — and stops early once
 * `stopAt` consecutive seasons have been confirmed (callers only need to
 * know whether the streak has reached maxConsecutiveKeeps).
 */
export async function getConsecutiveKeepStreak(
  db: PublicDb,
  params: {
    leagueId: number;
    userId: number;
    playerId: number;
    stopAt: number;
  },
): Promise<number> {
  if (params.stopAt <= 0) return 0;

  const lineage = await getLeagueLineage(db, params.leagueId);
  // getLeagueLineage returns seasons in reverse-chronological order
  // (current first); ancestors are everything after the current league.
  const ancestors = lineage.filter((l) => l.id !== params.leagueId);

  let streak = 0;
  for (const ancestor of ancestors) {
    if (streak >= params.stopAt) break;

    const teamId = await resolveTeamIdForUser(db, ancestor.id, params.userId);
    if (!teamId) break;

    const [designation] = await db
      .select({ id: PublicSchema.keeperDesignations.id })
      .from(PublicSchema.keeperDesignations)
      .where(
        and(
          eq(PublicSchema.keeperDesignations.leagueId, ancestor.id),
          eq(PublicSchema.keeperDesignations.teamId, teamId),
          eq(PublicSchema.keeperDesignations.playerId, params.playerId),
          eq(PublicSchema.keeperDesignations.status, 'applied'),
        ),
      )
      .limit(1);

    if (!designation) break;
    streak += 1;
  }

  return streak;
}

/**
 * Preview cost shown to managers before the draft applies real costs
 * (LS-8385 child 4 resolves the persisted costRound/costAmount). Round-
 * penalty preview uses the roster's carried-forward draftRound, falling
 * back to the league's last round (maxRosterSize) for undrafted pickups —
 * the LS-8673 ticket's resolved default for the parent's open question.
 * Auction-budget preview is intentionally null: the parent ticket's open
 * question on the deduction source (last bid vs. commissioner-set) is
 * unresolved, so no number is fabricated here.
 */
export function previewKeeperCost(params: {
  costModel: 'round-penalty' | 'auction-budget';
  draftRound: number | null | undefined;
  maxRosterSize: number;
}): { previewCostRound: number | null; previewCostAmount: number | null } {
  if (params.costModel === 'round-penalty') {
    return {
      previewCostRound: params.draftRound ?? params.maxRosterSize,
      previewCostAmount: null,
    };
  }
  return { previewCostRound: null, previewCostAmount: null };
}
