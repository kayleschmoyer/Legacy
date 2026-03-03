/**
 * Draft domain — helper functions
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { ForbiddenError } from '../graphql-errors';

// ── Position eligibility for auto-pick ──────────────────────────────────────
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
    // No picks yet — all position types are still needed
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

  // Build map: playerId → set of slot types the player can fill
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
      ALLOWED_POSITIONS_FOR_AUTO_PICK,
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
      (ALLOWED_POSITIONS_FOR_AUTO_PICK[a]?.length ?? 1) -
      (ALLOWED_POSITIONS_FOR_AUTO_PICK[b]?.length ?? 1),
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
