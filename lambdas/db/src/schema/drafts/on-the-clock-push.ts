/**
 * Draft domain — "you're on the clock" / "your draft has started" push
 * notifications (LS-10593).
 *
 * The draft room tells a connected client whose turn it is over the
 * WebSocket, but a manager who has backgrounded the app (or closed the tab)
 * gets no signal at all and burns their whole pick timer. Every path that
 * puts a new seat on the clock — a manual pick, a commissioner pick, a
 * scheduled auto-pick, and the draft starting (manually or on schedule) —
 * calls {@link notifyOnTheClock} (or, at draft start,
 * {@link notifyDraftStartPushes}) after its transaction commits.
 *
 * The push is sent unconditionally, even to managers who appear to be in the
 * draft room: `websocket_connections` rows can be stale (a killed app leaves
 * its row until TTL), and suppressing on a stale row would drop exactly the
 * pushes this exists for.
 *
 * Never throws — a push failure must not fail the pick / start that
 * triggered it.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import type { NotificationPublisher } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import { getCurrentDraftPickInfo } from './helpers';
import { getSeatById } from './participants';

/** Push `notificationType` for the on-the-clock alert (LS-10593). */
export const DRAFT_ON_THE_CLOCK_NOTIFICATION_TYPE = 'DRAFT_ON_THE_CLOCK';

/** Push `notificationType` for the draft-started alert (LS-10593). */
export const DRAFT_STARTED_NOTIFICATION_TYPE = 'DRAFT_STARTED';

export interface OnTheClockParams {
  draftId: number;
  /** `null` for a league-less mock draft — no push is sent (LS-10593). */
  leagueId: number | null;
  /** The seat now on the clock (`draft_participants.id`). */
  participantId: number;
  round: number;
  pickNumber: number;
}

/**
 * Resolve the user(s) who drive a seat: the seat's own `user_id` when set,
 * otherwise every league member managing the seat's team (league seats hold
 * a team rather than a user — mirrors pick-authorization.ts).
 */
async function resolveSeatUserIds(
  db: PublicDb,
  leagueId: number,
  seat: { userId: number | null; teamId: number | null },
): Promise<number[]> {
  if (seat.userId !== null) return [seat.userId];
  if (seat.teamId === null) return [];

  const members = await db
    .select({ userId: PublicSchema.leagueMembers.userId })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.teamId, seat.teamId),
      ),
    );

  return [...new Set(members.map((m) => m.userId))];
}

/**
 * Publish a DRAFT_ON_THE_CLOCK push to the manager(s) of the seat now on the
 * clock. Skips mock drafts, auto-pick seats, and seats with no user.
 *
 * @returns the user ids pushed (empty when skipped or on failure).
 */
export async function notifyOnTheClock(
  db: PublicDb,
  publisher: NotificationPublisher | null | undefined,
  params: OnTheClockParams,
): Promise<number[]> {
  const { draftId, leagueId, participantId, round, pickNumber } = params;
  if (!publisher || leagueId === null) return [];

  try {
    const seat = await getSeatById(db, participantId);
    if (!seat || seat.autoPick) return [];

    const userIds = await resolveSeatUserIds(db, leagueId, seat);
    if (userIds.length === 0) return [];

    await publisher.publishToMany(userIds, {
      notificationType: DRAFT_ON_THE_CLOCK_NOTIFICATION_TYPE,
      title: "You're on the clock!",
      body: `Round ${String(round)}, Pick ${String(pickNumber)} — it's your turn to draft.`,
      data: { leagueId, draftId },
    });
    return userIds;
  } catch (error) {
    LOGGER.warn('[LS-10593] On-the-clock push failed (non-fatal)', {
      draftId,
      leagueId,
      participantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Draft-start pushes (LS-10593), sent after a league draft goes live —
 * manually (initializeDraft) or on schedule (autoStartScheduledDrafts):
 *   - DRAFT_ON_THE_CLOCK to the manager(s) holding the first pick;
 *   - DRAFT_STARTED to every other league member, so managers who are not
 *     in the app (or are sitting on a stale league screen) learn the draft
 *     is live.
 * The first-pick holder gets only the on-the-clock push — two simultaneous
 * pushes for one event is noise, and "you're on the clock" implies the
 * draft has started. Never throws.
 */
export async function notifyDraftStartPushes(
  db: PublicDb,
  publisher: NotificationPublisher | null | undefined,
  params: { draftId: number; leagueId: number | null },
): Promise<void> {
  const { draftId, leagueId } = params;
  if (!publisher || leagueId === null) return;

  try {
    let onTheClockUserIds: number[] = [];
    const pickInfo = await getCurrentDraftPickInfo(db, draftId);
    if (pickInfo && !pickInfo.isComplete) {
      onTheClockUserIds = await notifyOnTheClock(db, publisher, {
        draftId,
        leagueId,
        participantId: pickInfo.participantId,
        round: pickInfo.round,
        pickNumber: pickInfo.pickNumber,
      });
    }

    const [league] = await db
      .select({ name: PublicSchema.leagues.name })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    const members = await db
      .select({ userId: PublicSchema.leagueMembers.userId })
      .from(PublicSchema.leagueMembers)
      .where(eq(PublicSchema.leagueMembers.leagueId, leagueId));

    const alreadyPushed = new Set(onTheClockUserIds);
    const recipients = [
      ...new Set(
        members.map((m) => m.userId).filter((id) => !alreadyPushed.has(id)),
      ),
    ];
    if (recipients.length === 0) return;

    await publisher.publishToMany(recipients, {
      notificationType: DRAFT_STARTED_NOTIFICATION_TYPE,
      title: 'Your draft has started!',
      body: league
        ? `The ${league.name} draft is live — join the draft room.`
        : 'Your league draft is live — join the draft room.',
      data: { leagueId, draftId },
    });
  } catch (error) {
    LOGGER.warn('[LS-10593] Draft-start push failed (non-fatal)', {
      draftId,
      leagueId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
