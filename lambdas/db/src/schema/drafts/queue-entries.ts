/**
 * Draft-queue reads and pruning that account for players already drafted
 * (LS-10680).
 *
 * A queued player stays in `draft_queue` after someone drafts them — the pick
 * path never touches the queue, and auto-pick simply skips drafted entries
 * (getFirstQueuedPlayerForSeat). These helpers keep the drafted rows out of
 * what the seat holder sees and out of the set a queue edit works against.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, asc, eq, sql } from 'drizzle-orm';

/** True when the queue row's player has a pick in the same draft. */
function queuedPlayerDrafted() {
  const { draftPicks, draftQueue } = PublicSchema;
  return sql`exists (
    select 1 from ${draftPicks}
    where ${draftPicks.draftId} = ${draftQueue.draftId}
      and ${draftPicks.playerId} = ${draftQueue.playerId}
  )`;
}

/** A seat's queue in priority order, without players already drafted. */
export function selectUndraftedQueue(
  db: PublicDb,
  draftId: number,
  participantId: number,
) {
  const { draftQueue } = PublicSchema;
  return db
    .select()
    .from(draftQueue)
    .where(
      and(
        eq(draftQueue.draftId, draftId),
        eq(draftQueue.participantId, participantId),
        sql`not ${queuedPlayerDrafted()}`,
      ),
    )
    .orderBy(asc(draftQueue.priority));
}

/**
 * Delete a seat's queue rows whose player has been drafted, so a queue edit
 * (add / remove / reorder) works against the same set the client displays.
 */
export async function pruneDraftedQueueEntries(
  db: PublicDb,
  draftId: number,
  participantId: number,
): Promise<void> {
  const { draftQueue } = PublicSchema;
  await db
    .delete(draftQueue)
    .where(
      and(
        eq(draftQueue.draftId, draftId),
        eq(draftQueue.participantId, participantId),
        queuedPlayerDrafted(),
      ),
    );
}
