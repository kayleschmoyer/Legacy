/**
 * Settle a new league member's pending direct invites (LS-10831).
 *
 * `respondToInvite` accepts a league invite, but an invitee can also join by
 * the league's invite code, a public join, or as an assistant manager. Any of
 * those leaves the direct invite pending, so the commissioner's Invite Users
 * panel keeps listing a member as invited. Every path that writes a
 * league_members row calls this in the same transaction, so the invite and the
 * membership commit (or roll back) together.
 *
 * Kept free of resolver imports: leagues/mutations and teams/mutations call it,
 * and direct-invites already imports leagues/mutations.
 */

import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';

/** Mark `userId`'s pending invites to `leagueId` accepted. */
export async function settleLeagueInvitesOnJoin(
  db: PublicDb,
  leagueId: number,
  userId: number,
): Promise<void> {
  await db
    .update(PublicSchema.invitations)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(
      and(
        eq(PublicSchema.invitations.leagueId, leagueId),
        eq(PublicSchema.invitations.invitedUserId, userId),
        eq(PublicSchema.invitations.status, 'pending'),
      ),
    );
}
