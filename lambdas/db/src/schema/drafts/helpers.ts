/**
 * Draft domain â€” helper functions
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { ALLOWED_POSITIONS } from '@legacy-sports/utils';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { ForbiddenError } from '../graphql-errors';

// â”€â”€ commitDraftPick types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface CommitDraftPickParams {
  /** Drizzle transaction (or plain db) to run writes inside. */
  tx: PublicDb;
  draftId: number;
  leagueId: number;
  /** Current pick slot being filled, as returned by getCurrentDraftPickInfo. */
  pickInfo: {
    teamId: number;
    round: number;
    pickNumber: number;
    overallPick: number;
  };
  playerId: number;
  maxRosterSize: number;
  pickTimeLimitSeconds: number;
  /**
   * Base time for computing the next pick deadline.
   * Defaults to the wall-clock `now` captured inside this function.
   * Scheduled auto-picks pass the *expired* deadline so the next team gets
   * a full timer window regardless of when EventBridge fired.
   */
  deadlineBaseTime?: Date;
  /**
   * When true, sets `draftStartedAt` on the drafts row.
   * Only the very first manual pick (overallPick === 1, current_pick === 0)
   * should pass this as true.
   */
  setStartedAt?: boolean;
}

export interface CommitDraftPickResult {
  draftPick: typeof PublicSchema.draftPicks.$inferSelect;
  isDraftComplete: boolean;
  nextDeadline: Date | null;
  nextPickInfo: Awaited<ReturnType<typeof getCurrentDraftPickInfo>>;
  /** Wall-clock timestamp captured at the start of the commit. */
  now: Date;
}

// â”€â”€ Position eligibility for auto-pick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Maps each league roster slot type to the player stat position keys that qualify.
// Source of truth: lib/shared-components/src/utils/PositionModels.ts
// Shared by autoProcessDraftPicks (scheduled-mutations.ts) and the
// makeDraftPick auto-pick chain (mutations.ts).
export const ALLOWED_POSITIONS_FOR_AUTO_PICK: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  '1B': ['1B'],
  '2B': ['2B'],
  '3B': ['3B'],
  C: ['C'],
  CF: ['CF'],
  DH: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'],
  IF: ['1B', '2B', '3B', 'SS'],
  LF: ['LF'],
  OF: ['LF', 'RF', 'CF'],
  RF: ['RF'],
  RP: ['RP', 'P'],
  SP: ['SP', 'P'],
  SS: ['SS'],
  XDH: ['DH'],
});

/**
 * Determine which league-defined position slot types still need a player
 * on the given team for this draft. Works inside any transaction (tx: PublicDb).
 *
 * Shared by autoProcessDraftPicks (scheduled-mutations.ts) and the
 * makeDraftPick auto-pick chain (mutations.ts).
 */
export async function getUnfilledPositionTypes(
  tx: PublicDb,
  draftId: number,
  teamId: number,
  leagueId: number,
): Promise<string[]> {
  // 1. League position requirements
  const leaguePositions = await tx
    .select({ positionType: PublicSchema.leaguePosition.positionType })
    .from(PublicSchema.leaguePosition)
    .where(eq(PublicSchema.leaguePosition.leagueId, leagueId));

  if (leaguePositions.length === 0) return [];

  // Count slots needed per position type
  const slotsNeeded = new Map<string, number>();
  for (const lp of leaguePositions) {
    slotsNeeded.set(
      lp.positionType,
      (slotsNeeded.get(lp.positionType) ?? 0) + 1,
    );
  }

  // 2. Team's already-drafted player IDs in this draft
  const teamPicksResult = await tx.execute(
    sql`SELECT player_id FROM draft_picks WHERE draft_id = ${draftId} AND team_id = ${teamId}`,
  );
  const teamPlayerIds = teamPicksResult.rows.map((r) => r.player_id as number);

  if (teamPlayerIds.length === 0) {
    // No picks yet â€” all position types are still needed
    return [...new Set(leaguePositions.map((lp) => lp.positionType))];
  }

  // 3. Career fielding data for already-drafted players
  const fieldingRows = await tx
    .select({
      playerId: PublicSchema.careerFielding.playerId,
      positionsPlayed: PublicSchema.careerFielding.positionsPlayed,
    })
    .from(PublicSchema.careerFielding)
    .where(inArray(PublicSchema.careerFielding.playerId, teamPlayerIds));

  // Build map: playerId â†’ set of slot types the player can fill
  const playerSlotMap = new Map<number, Set<string>>();
  for (const row of fieldingRows) {
    if (!row.playerId) continue;
    const positionsPlayed = row.positionsPlayed as Record<
      string,
      unknown
    > | null;
    const playerStatPositions = positionsPlayed
      ? Object.keys(positionsPlayed)
      : [];

    const coverableSlots = new Set<string>();
    for (const [slotType, allowedStatPositions] of Object.entries(
      ALLOWED_POSITIONS,
    )) {
      if (allowedStatPositions.some((sp) => playerStatPositions.includes(sp))) {
        coverableSlots.add(slotType);
      }
    }
    playerSlotMap.set(row.playerId, coverableSlots);
  }

  // 4. Greedily assign players to slots (most-specific slots first)
  const slotsCovered = new Map<string, number>();
  const orderedSlotTypes = [...slotsNeeded.keys()].sort(
    (a, b) =>
      (ALLOWED_POSITIONS[a]?.length ?? 1) - (ALLOWED_POSITIONS[b]?.length ?? 1),
  );

  for (const playerId of teamPlayerIds) {
    const coverableSlots = playerSlotMap.get(playerId);
    if (!coverableSlots) continue;

    for (const slotType of orderedSlotTypes) {
      const needed = slotsNeeded.get(slotType) ?? 0;
      const covered = slotsCovered.get(slotType) ?? 0;
      if (covered < needed && coverableSlots.has(slotType)) {
        slotsCovered.set(slotType, covered + 1);
        break; // Each player fills exactly one slot
      }
    }
  }

  // 5. Return slot types that still have open slots
  return orderedSlotTypes.filter(
    (slotType) =>
      (slotsCovered.get(slotType) ?? 0) < (slotsNeeded.get(slotType) ?? 0),
  );
}

/**
 * Calculate current pick information based on draft settings
 */
export async function getCurrentDraftPickInfo(
  db: PublicDb,
  draftId: number,
): Promise<{
  draftId: number;
  teamId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
} | null> {
  // Get draft and draft teams
  const [draft] = await db
    .select()
    .from(PublicSchema.drafts)
    .where(eq(PublicSchema.drafts.id, draftId))
    .limit(1);

  if (!draft) {
    return null;
  }

  const draftTeams = await db
    .select()
    .from(PublicSchema.draftTeams)
    .where(eq(PublicSchema.draftTeams.draftId, draftId))
    .orderBy(asc(PublicSchema.draftTeams.draftOrder));

  if (draftTeams.length === 0) {
    throw new Error('No teams configured for this draft');
  }

  const teamCount = draftTeams.length;
  const currentOverallPick = draft.currentPick + 1;

  // Calculate round (1-indexed)
  const round = Math.ceil(currentOverallPick / teamCount);

  // Determine team based on draft order (snake vs normal)
  const isSnake = draft.draftOrder === 'snake';
  const isReverseRound = isSnake && round % 2 === 0;

  // Calculate pick within round (1-indexed)
  const pickInRound = ((currentOverallPick - 1) % teamCount) + 1;

  // Determine team index
  const teamIndex = isReverseRound
    ? teamCount - pickInRound // Reverse order for snake draft even rounds
    : pickInRound - 1; // Normal order (0-indexed)

  const team = draftTeams[teamIndex];

  if (!team) {
    throw new Error('Could not determine team for current pick');
  }

  return {
    draftId,
    teamId: team.teamId,
    round,
    pickNumber: pickInRound,
    overallPick: currentOverallPick,
    isComplete: false,
  };
}

/**
 * Verify that a user is a member of a league. Throws if not.
 */
export async function verifyLeagueMembership(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<void> {
  const [membership] = await db
    .select({ leagueId: PublicSchema.leagueMembers.leagueId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw ForbiddenError('You are not a member of this league');
  }
}

/**
 * Commit a single draft pick inside a transaction: insert the draftPicks row,
 * advance the draft state (currentPick, deadline, completion timestamps),
 * update league status when the draft completes, and add the player to the
 * team roster. Returns the inserted pick, completion flag, next deadline, and
 * the next pick info.
 *
 * This is the single source of truth for draft-pick DB writes, shared by:
 *   - makeDraftPick (manual pick + chained auto-picks)
 *   - commissionerPick
 *   - autoProcessDraftPicks (scheduled/EventBridge auto-picks)
 */
export async function commitDraftPick(
  params: CommitDraftPickParams,
): Promise<CommitDraftPickResult> {
  const {
    tx,
    draftId,
    leagueId,
    pickInfo,
    playerId,
    maxRosterSize,
    pickTimeLimitSeconds,
    deadlineBaseTime,
    setStartedAt = false,
  } = params;

  const now = new Date();

  // Insert the draft pick record
  const [draftPick] = await tx
    .insert(PublicSchema.draftPicks)
    .values({
      draftId,
      teamId: pickInfo.teamId,
      playerId,
      round: pickInfo.round,
      pickNumber: pickInfo.pickNumber,
      overallPick: pickInfo.overallPick,
      pickedAt: now,
    })
    .returning();

  // Determine whether the draft is now complete
  const draftTeamRows = await tx
    .select()
    .from(PublicSchema.draftTeams)
    .where(eq(PublicSchema.draftTeams.draftId, draftId));
  const numTeams = draftTeamRows.length;
  const totalPicks = numTeams * maxRosterSize;
  const isDraftComplete = pickInfo.overallPick >= totalPicks;

  // Compute the next pick deadline.
  // Callers that need to preserve intended cadence (scheduled auto-picks)
  // pass deadlineBaseTime = the expired deadline rather than wall-clock now.
  const baseTime = deadlineBaseTime ?? now;
  const nextDeadline = isDraftComplete
    ? null
    : new Date(baseTime.getTime() + pickTimeLimitSeconds * 1000);

  // Advance the draft row
  await tx
    .update(PublicSchema.drafts)
    .set({
      currentPick: pickInfo.overallPick,
      currentPickDeadline: nextDeadline,
      updatedAt: now,
      ...(setStartedAt ? { draftStartedAt: now } : {}),
      ...(isDraftComplete ? { draftCompletedAt: now } : {}),
    })
    .where(eq(PublicSchema.drafts.id, draftId));

  // Mark the league draft as completed when the last pick is made
  if (isDraftComplete) {
    await tx
      .update(PublicSchema.leagues)
      .set({ draftStatus: 'completed' })
      .where(eq(PublicSchema.leagues.id, leagueId));
  }

  // Add the drafted player to the team's roster
  await tx.insert(PublicSchema.teamMembers).values({
    teamId: pickInfo.teamId,
    leagueId,
    playerId,
    draftRound: pickInfo.round,
    draftPick: pickInfo.pickNumber,
    acquisitionType: 'draft',
  });

  // Fetch next pick info so callers can send notifications / chain auto-picks
  let nextPickInfo: Awaited<ReturnType<typeof getCurrentDraftPickInfo>> = null;
  if (!isDraftComplete) {
    nextPickInfo = await getCurrentDraftPickInfo(tx, draftId);
  }

  return { draftPick, isDraftComplete, nextDeadline, nextPickInfo, now };
}

/**
 * Return the first player from a team's draft queue that is still available
 * (not yet drafted) in the given draft.
 *
 * Returns `null` if:
 *  - the queue is empty
 *  - all queued players have already been drafted
 *
 * Used by both auto-pick paths (scheduled-mutations.ts and make-draft-pick.ts).
 */
export async function getFirstQueuedPlayerForTeam(
  db: PublicDb,
  draftId: number,
  teamId: number,
): Promise<number | null> {
  // Fetch the queue ordered by priority
  const queueRows = await db
    .select({ playerId: PublicSchema.draftQueue.playerId })
    .from(PublicSchema.draftQueue)
    .where(
      and(
        eq(PublicSchema.draftQueue.draftId, draftId),
        eq(PublicSchema.draftQueue.teamId, teamId),
      ),
    )
    .orderBy(asc(PublicSchema.draftQueue.priority));

  if (queueRows.length === 0) return null;

  // Check which queued players are still undrafted
  const queuedPlayerIds = queueRows.map((r) => r.playerId);
  const draftedRows = await db
    .select({ playerId: PublicSchema.draftPicks.playerId })
    .from(PublicSchema.draftPicks)
    .where(
      and(
        eq(PublicSchema.draftPicks.draftId, draftId),
        inArray(PublicSchema.draftPicks.playerId, queuedPlayerIds),
      ),
    );

  const draftedIds = new Set(draftedRows.map((r) => r.playerId));

  // Return the first undrafted entry
  for (const row of queueRows) {
    if (!draftedIds.has(row.playerId)) {
      return row.playerId;
    }
  }

  return null;
}
