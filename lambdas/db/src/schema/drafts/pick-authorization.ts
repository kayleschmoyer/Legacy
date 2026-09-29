/**
 * Draft domain — "is it your turn?" (LS-10076).
 *
 * A league draft answers that through league membership: the caller's team
 * must be the team on the clock. A draft-first mock draft has no league and
 * no teams, so the question is asked of the seat instead: the caller must
 * hold the seat on the clock — or, in a Control All Teams mock draft
 * (LS-9253), be the host, who makes every seat's picks.
 *
 * Both branches live here so the turn rule has one home, rather than being
 * restated by every pick mutation.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';

import { getSeatById } from './participants';
import { ForbiddenError } from '../graphql-errors';

/** The draft columns the turn rule depends on. */
export interface PickAuthorizationDraft {
  kind: 'league' | 'mock';
  leagueId: number | null;
  createdBy: number;
  controlAllTeams: boolean;
}

/** The pick on the clock, as {@link getCurrentDraftPickInfo} reports it. */
export interface PickOnTheClock {
  teamId: number | null;
  participantId: number;
}

/**
 * Verify `userId` may submit the pick currently on the clock.
 *
 * @throws `FORBIDDEN` when it is not the caller's turn.
 */
export async function assertCallerIsOnTheClock(
  db: PublicDb,
  params: {
    draftId: number;
    draft: PickAuthorizationDraft;
    userId: number;
    pickInfo: PickOnTheClock;
  },
): Promise<void> {
  const { draftId, draft, userId, pickInfo } = params;

  if (draft.kind === 'mock') {
    // Control All Teams: the host drafts for every seat, so the seat's holder
    // is irrelevant — there is no other human in the draft.
    if (draft.controlAllTeams && draft.createdBy === userId) return;

    const seat = await getSeatById(db, pickInfo.participantId);
    if (!seat || seat.draftId !== draftId || seat.userId !== userId) {
      throw ForbiddenError(
        'Not authorized: It is not your turn to pick or you do not hold this seat',
      );
    }
    return;
  }

  const leagueId = draft.leagueId;
  if (leagueId === null) {
    throw new Error(
      `assertCallerIsOnTheClock: league draft ${String(draftId)} has no league_id`,
    );
  }

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

  if (!membership || membership.teamId !== pickInfo.teamId) {
    throw ForbiddenError(
      'Not authorized: It is not your turn to pick or you do not own this team',
    );
  }
}
