/**
 * Draft domain — hand the next pick to autoProcessDraftPicks when the seat
 * now on the clock auto-picks (LS-8107, shared with commissionerPick in
 * LS-10593).
 *
 * After a human-submitted pick commits, the next seat gets a full timer. If
 * that seat is on auto-pick, nobody is going to pick for it, so without this
 * it would sit on the clock for the whole timer. Instead:
 *   1. Expire the seat's deadline so the pick is due now.
 *   2. Fire a set-and-forget HTTP nudge to autoProcessDraftPicks (the same
 *      system mutation EventBridge invokes every minute) so it runs within
 *      ~1 s instead of waiting a full EventBridge cycle.
 * The EventBridge schedule (≤60 s) stays as the safety net if the nudge is
 * dropped. Never throws — the triggering pick is already committed (LS-3704:
 * never surface a chain error to the client).
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { eq } from 'drizzle-orm';

import { getSeatById } from './participants';
import { triggerAutoProcessDraftPicks } from './trigger-auto-process';

export async function offloadNextPickIfAutoPick(
  db: PublicDb,
  params: {
    draftId: number;
    leagueId: number | null;
    /** The seat now on the clock (`draft_participants.id`). */
    nextParticipantId: number;
  },
): Promise<void> {
  const { draftId, leagueId, nextParticipantId } = params;
  try {
    const upcomingSeat = await getSeatById(db, nextParticipantId);
    if (!upcomingSeat?.autoPick) return;

    // Expire the next seat's deadline so autoProcessDraftPicks treats it as
    // due immediately (mirrors LS-3643 / LS-427).
    await db
      .update(PublicSchema.drafts)
      .set({ currentPickDeadline: new Date(Date.now() - 1) })
      .where(eq(PublicSchema.drafts.id, draftId));

    // Set-and-forget: dispatch the nudge without awaiting it. Nudged by
    // draft id so a league-less mock draft is reachable too (LS-10076).
    triggerAutoProcessDraftPicks({ leagueId, draftId });

    LOGGER.info(
      '[LS-8107] Offloaded chained auto-picks to autoProcessDraftPicks',
      { draftId, leagueId, nextParticipantId },
    );
  } catch (offloadError) {
    LOGGER.warn(
      '[LS-8107] Failed to offload auto-picks (non-fatal)',
      offloadError instanceof Error
        ? offloadError
        : new Error(String(offloadError)),
      { draftId, leagueId },
    );
  }
}
