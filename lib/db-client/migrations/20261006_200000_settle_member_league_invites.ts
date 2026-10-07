/**
 * Migration: Settle pending league invites held by league members (LS-10831)
 * Created: 2026-10-06
 * Ticket: LS-10831
 *
 * A direct league invite used to settle only through respondToInvite, so an
 * invitee who joined by invite code, public join, or as an assistant manager
 * left it pending, and the commissioner's Invite Users panel kept listing a
 * member as invited. Every join path now settles the invite; this backfills
 * the invites left pending before that, marking them accepted.
 *
 * Data only. Re-runnable: a second run finds no pending rows to settle.
 * `down` is a no-op: these invites were spent by the join, and reopening them
 * would put members back on the pending list.
 */

interface MigrationDb {
  execute: (query: string) => Promise<unknown>;
}

export const up = async ({ db }: { db: MigrationDb }): Promise<void> => {
  await db.execute(`
    UPDATE public.invitations i
    SET status = 'accepted', responded_at = now()
    WHERE i.status = 'pending'
      AND i.league_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.league_members lm
        WHERE lm.league_id = i.league_id
          AND lm.user_id = i.invited_user_id
      );
  `);
};

export const down = async (_: { db: MigrationDb }): Promise<void> => {
  // Intentionally empty — see the header.
};
