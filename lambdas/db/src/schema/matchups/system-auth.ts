/**
 * Shared authorization helper for system / scheduled mutations.
 *
 * Extracted from `scheduled-mutations.ts` so that lightweight consumers
 * (e.g. Discord reminders) can import the auth check without pulling in
 * the heavy module-level side effects (badge service, SQS client, etc.).
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';

import { type Context } from '../builder';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';

/**
 * Guard for system / scheduled mutations.
 *
 * Access rules:
 *  - EventBridge system requests → always allowed (all leagues).
 *  - Admin users → always allowed (all leagues).
 *  - Authenticated non-admin → must supply a leagueId AND be a commissioner /
 *    GM / assistant of that league.
 *  - Unauthenticated → rejected.
 *  - Non-admin without leagueId → rejected.
 *  - Non-admin with leagueId but insufficient permissions within that league →
 *    rejected.
 *  - Non-admin with leagueId and commissioner / GM / assistant permissions
 *    provided (single-league scope).
 *  - Anyone else → rejected.
 */
export async function assertAuthorized(
  context: Context,
  leagueId: number | null | undefined,
): Promise<void> {
  // System requests (EventBridge) can always operate on all leagues
  if (context.isSystemRequest) {
    return;
  }

  // Admin users can always operate on all leagues
  if (context.user?.isAdmin) {
    return;
  }

  // For non-admin authenticated users, a specific leagueId is required
  if (!context.user) {
    throw AuthenticationError('System mutations require authentication');
  }

  if (!leagueId) {
    throw ForbiddenError(
      'Only admins or system processes can trigger mutations for all leagues. Provide a leagueId to operate on your own league.',
    );
  }

  // Check the user is a commissioner or owner of the specified league
  const [membership] = await context.db
    .select({
      permissionLevel: PublicSchema.leagueMembers.permissionLevel,
    })
    .from(PublicSchema.leagueMembers)
    .where(
      and(
        eq(PublicSchema.leagueMembers.leagueId, leagueId),
        eq(PublicSchema.leagueMembers.userId, context.user.id),
      ),
    )
    .limit(1);

  if (
    !membership ||
    (membership.permissionLevel !== 'general_manager' &&
      membership.permissionLevel !== 'assistant_manager' &&
      membership.permissionLevel !== 'commissioner')
  ) {
    throw ForbiddenError(
      'Only the league General Manager or commissioner can trigger this mutation for their league.',
    );
  }
}
