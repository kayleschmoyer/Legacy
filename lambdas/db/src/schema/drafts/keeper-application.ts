/**
 * Draft domain — keeper designation application at draft initialization
 * (LS-8674, child 4 of 4 for the keeper draft epic LS-8385).
 *
 * A keeper league's designations are made against the SAME league whose
 * draft is initializing (renewLeague(keepRosters=true) carries the prior
 * season's teamMembers rows — including draftRound/salary — into the new
 * league so designateKeeper's "player is on your roster" check and the
 * cost-preview logic in keepers/helpers.ts have real data to work with).
 * At draft init the carried-over roster is wiped and rebuilt with only the
 * locked keepers (everyone else returns to the draftable pool) so this
 * single function is what makes AC1 ("kept players are on their teams'
 * rosters ... before pick 1") and AC4 ("excluded from the draftable pool")
 * true simultaneously — the pool-exclusion query just checks teamMembers.
 */
import type { PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray } from 'drizzle-orm';

import { getParticipantIdForTeam } from './participants';
import { UserInputError } from '../graphql-errors';

export interface ApplyKeeperDesignationsParams {
  leagueId: number;
  draftId: number;
  /** League seasonNumber the upcoming draft is for — matches the `season`
   *  keeper_designations were created against. */
  season: number;
  maxRosterSize: number;
  costModel: 'round-penalty' | 'auction-budget';
  /** League's full per-team auction budget (used as the seed before keeper
   *  deductions). Only read when costModel === 'auction-budget'. */
  auctionBudget: number;
  /** Fallback cost for a kept player with no carried-forward salary (e.g.
   *  never won at auction — a waiver/FA pickup). */
  auctionMinBid: number;
}

export interface ApplyKeeperDesignationsResult {
  /** Number of keeper_designations transitioned pending → locked → applied. */
  appliedCount: number;
  /** Kept player IDs per team — callers use this to seed pool exclusions /
   *  auto-pick position accounting without a second roster query. */
  keptPlayerIdsByTeam: Map<number, number[]>;
}

/**
 * Locks all pending keeper_designations for (leagueId, season), applies
 * their cost (round-penalty forfeits a draft round; auction-budget deducts
 * from the team's budget), and rebuilds the league's roster so it contains
 * exactly the locked keepers before the draft's first pick. Must run inside
 * the same transaction as the rest of initializeDraft.
 *
 * A keeper league with zero pending/locked designations still wipes any
 * carried-over roster rows (a no-op if the roster is already empty) so it
 * behaves identically to a redraft league — no forfeited picks, no budget
 * deduction, nothing excluded from the pool.
 */
export async function applyKeeperDesignationsForDraft(
  tx: PublicDb,
  params: ApplyKeeperDesignationsParams,
): Promise<ApplyKeeperDesignationsResult> {
  const {
    leagueId,
    draftId,
    season,
    maxRosterSize,
    costModel,
    auctionBudget,
    auctionMinBid,
  } = params;

  // Draft has now gone live — freeze any designation a manager left pending.
  await tx
    .update(PublicSchema.keeperDesignations)
    .set({ status: 'locked' })
    .where(
      and(
        eq(PublicSchema.keeperDesignations.leagueId, leagueId),
        eq(PublicSchema.keeperDesignations.season, season),
        eq(PublicSchema.keeperDesignations.status, 'pending'),
      ),
    );

  // Include already-'applied' rows too so re-initializing a draft (e.g. the
  // commissioner restarts before any picks are made) is idempotent — the
  // roster wipe below would otherwise permanently discard keepers applied
  // by an earlier init pass, since only 'pending' designations get relocked.
  const locked = await tx
    .select()
    .from(PublicSchema.keeperDesignations)
    .where(
      and(
        eq(PublicSchema.keeperDesignations.leagueId, leagueId),
        eq(PublicSchema.keeperDesignations.season, season),
        inArray(PublicSchema.keeperDesignations.status, ['locked', 'applied']),
      ),
    );

  if (locked.length === 0) {
    await tx
      .delete(PublicSchema.teamMembers)
      .where(eq(PublicSchema.teamMembers.leagueId, leagueId));
    return { appliedCount: 0, keptPlayerIdsByTeam: new Map() };
  }

  // Capture carried-forward roster data (draftRound / salary) for kept
  // players BEFORE the roster wipe below — this is the "carried-forward"
  // value the LS-8673 cost preview already promised managers.
  const keptPlayerIds = [...new Set(locked.map((d) => d.playerId))];
  const priorRows = await tx
    .select({
      teamId: PublicSchema.teamMembers.teamId,
      playerId: PublicSchema.teamMembers.playerId,
      draftRound: PublicSchema.teamMembers.draftRound,
      salary: PublicSchema.teamMembers.salary,
    })
    .from(PublicSchema.teamMembers)
    .where(
      and(
        eq(PublicSchema.teamMembers.leagueId, leagueId),
        inArray(PublicSchema.teamMembers.playerId, keptPlayerIds),
      ),
    );
  const priorByTeamPlayer = new Map<
    string,
    { draftRound: number | null; salary: number | null }
  >();
  for (const row of priorRows) {
    if (row.teamId == null) continue;
    priorByTeamPlayer.set(`${row.teamId}:${row.playerId}`, {
      draftRound: row.draftRound,
      salary: row.salary,
    });
  }

  // Wipe the carried-over roster — everyone not designated as a keeper
  // returns to the draftable pool; kept players are re-added below.
  await tx
    .delete(PublicSchema.teamMembers)
    .where(eq(PublicSchema.teamMembers.leagueId, leagueId));

  const forfeitedRoundsByTeam = new Map<number, Set<number>>();
  const auctionCostByTeam = new Map<number, number>();
  const keptPlayerIdsByTeam = new Map<number, number[]>();

  for (const designation of locked) {
    const prior = priorByTeamPlayer.get(
      `${designation.teamId}:${designation.playerId}`,
    );

    if (costModel === 'round-penalty') {
      // Fallback to the league's last round for undrafted-pickup keepers
      // (LS-8673's resolved default for the parent's open question).
      let round = prior?.draftRound ?? maxRosterSize;
      const taken = forfeitedRoundsByTeam.get(designation.teamId) ?? new Set();
      // Two keepers from the same forfeited round (e.g. both drafted round 5
      // last season) can't both forfeit round 5 — bump to the next open
      // round for that team, capped at the league's last round.
      while (taken.has(round) && round <= maxRosterSize) round += 1;
      if (round > maxRosterSize) {
        throw UserInputError(
          `Team ${designation.teamId} has more keepers than available draft rounds (${maxRosterSize})`,
        );
      }
      taken.add(round);
      forfeitedRoundsByTeam.set(designation.teamId, taken);

      await tx.insert(PublicSchema.teamMembers).values({
        teamId: designation.teamId,
        leagueId,
        playerId: designation.playerId,
        acquisitionType: 'keeper',
        draftRound: round,
      });
      await tx
        .insert(PublicSchema.draftForfeitedPicks)
        .values({
          draftId,
          teamId: designation.teamId,
          round,
          keeperDesignationId: designation.id,
        })
        .onConflictDoNothing();
      await tx
        .update(PublicSchema.keeperDesignations)
        .set({ status: 'applied', costRound: round })
        .where(eq(PublicSchema.keeperDesignations.id, designation.id));
    } else {
      // Fallback to the league minimum bid for undrafted-pickup keepers —
      // the cheapest possible acquisition cost, mirroring the round-penalty
      // "last round" default.
      const amount = Math.max(0, prior?.salary ?? auctionMinBid);

      await tx.insert(PublicSchema.teamMembers).values({
        teamId: designation.teamId,
        leagueId,
        playerId: designation.playerId,
        acquisitionType: 'keeper',
        salary: amount,
      });
      auctionCostByTeam.set(
        designation.teamId,
        (auctionCostByTeam.get(designation.teamId) ?? 0) + amount,
      );
      await tx
        .update(PublicSchema.keeperDesignations)
        .set({ status: 'applied', costAmount: amount })
        .where(eq(PublicSchema.keeperDesignations.id, designation.id));
    }

    const ids = keptPlayerIdsByTeam.get(designation.teamId) ?? [];
    ids.push(designation.playerId);
    keptPlayerIdsByTeam.set(designation.teamId, ids);
  }

  // Seed auction_budgets for teams with a keeper deduction — the amount is
  // deducted before bidding opens. Teams with no keepers are left for the
  // normal draft-start budget initialization to seed at full auctionBudget.
  if (costModel === 'auction-budget' && auctionCostByTeam.size > 0) {
    for (const [teamId, totalCost] of auctionCostByTeam) {
      const participantId = await getParticipantIdForTeam(tx, draftId, teamId);
      if (participantId === null) {
        throw new Error(
          `Team ${teamId} has no seat in draft ${draftId}; seat the draft before applying keepers`,
        );
      }
      const playersWon = keptPlayerIdsByTeam.get(teamId)?.length ?? 0;
      const remainingBudget = Math.max(0, auctionBudget - totalCost);
      await tx
        .insert(PublicSchema.auctionBudgets)
        .values({ draftId, participantId, remainingBudget, playersWon })
        .onConflictDoUpdate({
          target: [
            PublicSchema.auctionBudgets.draftId,
            PublicSchema.auctionBudgets.participantId,
          ],
          set: { remainingBudget, playersWon },
        });
    }
  }

  LOGGER.info('Applied keeper designations at draft initialization', {
    leagueId,
    draftId,
    season,
    costModel,
    appliedCount: locked.length,
    teamCount: keptPlayerIdsByTeam.size,
  });

  return { appliedCount: locked.length, keptPlayerIdsByTeam };
}
