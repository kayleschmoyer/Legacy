/**
 * Draft domain — helper functions
 */

import { PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, asc, eq } from 'drizzle-orm';

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
    throw new Error('You are not a member of this league');
  }
}
