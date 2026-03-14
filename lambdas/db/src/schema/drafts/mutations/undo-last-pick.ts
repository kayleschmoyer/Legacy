/**
 * Draft mutation: undoLastDraftPick
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, desc, eq, sql } from 'drizzle-orm';

import { DraftPick } from '../types';
import { builder } from '../../builder';
import { AuthenticationError, ForbiddenError } from '../../graphql-errors';

// ── Undo Last Draft Pick ─────────────────────────────────────────────────────

/**
 * Mutation: Undo the most recent draft pick
 *
 * Allows the league commissioner to roll back the last pick made in the draft.
 * Useful for correcting accidental or mis-entered picks.
 *
 * Effects:
 *  1. Deletes the most recent DraftPick row.
 *  2. Removes the corresponding TeamMember roster entry.
 *  3. Decrements drafts.currentPick by 1.
 *  4. If the draft was marked complete, un-completes it (draftCompletedAt ← null,
 *     league.draftStatus ← 'in-progress').
 *  5. Broadcasts a DRAFT_PICK_UNDONE WebSocket notification.
 *
 * Commissioner-only: caller must have permissionLevel = 'commissioner'.
 */
builder.mutationField('undoLastDraftPick', (t) =>
  t.field({
    type: DraftPick,
    nullable: true,
    args: {
      draftId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { draftId } = args;
      const userId = context.user.id;

      try {
        const result = await context.db.transaction(async (tx) => {
          // Surface lock waits as errors rather than silent hangs
          await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

          // Lock the draft row to prevent races
          const draftRows = await tx.execute(
            sql`SELECT id, league_id, current_pick, pick_time_limit_seconds FROM drafts WHERE id = ${draftId} FOR UPDATE`,
          );
          const draft = draftRows.rows[0] as
            | {
                id: number;
                league_id: number;
                current_pick: number;
                pick_time_limit_seconds: number;
              }
            | undefined;

          if (!draft) {
            throw new Error('Draft not found');
          }

          // Verify user is league commissioner
          const [membership] = await tx
            .select()
            .from(PublicSchema.leagueMembers)
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, draft.league_id),
                eq(PublicSchema.leagueMembers.userId, userId),
              ),
            )
            .limit(1);

          if (!membership || membership.permissionLevel !== 'commissioner') {
            throw ForbiddenError('Only a league commissioner can undo picks');
          }

          // Find the most recent pick for this draft
          const [lastPick] = await tx
            .select()
            .from(PublicSchema.draftPicks)
            .where(eq(PublicSchema.draftPicks.draftId, draftId))
            .orderBy(desc(PublicSchema.draftPicks.overallPick))
            .limit(1);

          if (!lastPick) {
            throw new Error('No picks to undo');
          }

          // Delete the last draft pick
          await tx
            .delete(PublicSchema.draftPicks)
            .where(eq(PublicSchema.draftPicks.id, lastPick.id));

          // Remove the corresponding team roster entry
          await tx
            .delete(PublicSchema.teamMembers)
            .where(
              and(
                eq(PublicSchema.teamMembers.teamId, lastPick.teamId),
                eq(PublicSchema.teamMembers.leagueId, draft.league_id),
                eq(PublicSchema.teamMembers.playerId, lastPick.playerId),
                eq(PublicSchema.teamMembers.acquisitionType, 'draft'),
              ),
            );

          // Restore currentPick to one before the undone pick
          const restoredCurrentPick = lastPick.overallPick - 1;

          // Restore pick deadline for the now-current pick slot
          const now = new Date();
          const newPickDeadline = new Date(
            now.getTime() + draft.pick_time_limit_seconds * 1000,
          );

          await tx
            .update(PublicSchema.drafts)
            .set({
              currentPick: restoredCurrentPick,
              currentPickDeadline: newPickDeadline,
              draftCompletedAt: null,
              updatedAt: now,
            })
            .where(eq(PublicSchema.drafts.id, draftId));

          // Check league draft status and re-open if it was completed
          const [league] = await tx
            .select()
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.league_id))
            .limit(1);

          if (league?.draftStatus === 'completed') {
            await tx
              .update(PublicSchema.leagues)
              .set({ draftStatus: 'in-progress' })
              .where(eq(PublicSchema.leagues.id, draft.league_id));
          }

          return {
            undonePickId: lastPick.id,
            leagueId: draft.league_id,
            lastPick,
            restoredCurrentPick,
            newPickDeadline,
            wasDraftCompleted: league?.draftStatus === 'completed',
          };
        });

        LOGGER.info('Draft pick undone', {
          draftId,
          undonePickId: result.undonePickId,
          playerId: result.lastPick.playerId,
          teamId: result.lastPick.teamId,
          overallPick: result.lastPick.overallPick,
          byUserId: userId,
        });

        if (context.notificationService) {
          await context.notificationService.notifyDraftPickUndone(
            result.leagueId,
            draftId,
            result.undonePickId,
            result.lastPick.playerId,
            result.lastPick.teamId,
            result.lastPick.overallPick,
            result.restoredCurrentPick,
            result.newPickDeadline.toISOString(),
          );
        }

        return result.lastPick;
      } catch (error) {
        LOGGER.error(
          'Error undoing draft pick',
          error instanceof Error ? error : new Error(String(error)),
          { draftId, userId },
        );
        throw error;
      }
    },
  }),
);
