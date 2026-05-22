/**
 * Draft mutations: setDraftOrder + randomizeDraftOrder
 * Includes the shared postDraftOrderChatNotification helper.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, eq, sql } from 'drizzle-orm';

import { Draft } from '../types';
import { builder } from '../../builder';
import type { Context } from '../../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';

// ── Helpers shared by setDraftOrder / randomizeDraftOrder ────────────────────

/**
 * Post a system chat notification for a draft order change and broadcast it
 * over WebSocket so all connected league members see the update immediately.
 */
async function postDraftOrderChatNotification(
  db: Context['db'],
  notificationService: Context['notificationService'],
  leagueId: number,
  username: string,
  messageText: string,
): Promise<void> {
  const [chatMsg] = await db
    .insert(PublicSchema.leagueMessages)
    .values({
      leagueId,
      userId: null,
      messageText,
      messageType: 'draft_order',
      metadata: { username },
    })
    .returning();

  if (notificationService) {
    notificationService
      .notifyLeagueChatMessage(leagueId, {
        leagueId,
        messageId: chatMsg.id,
        senderId: null,
        senderUsername: username,
        messageText,
        timestamp: chatMsg.timestamp ?? new Date().toISOString(),
        messageType: 'draft_order',
        metadata: { username },
      })
      .catch((err: unknown) => {
        LOGGER.warn(
          'Failed to send league chat WS notification for draft order change',
          { err },
        );
      });
  }
}

// ── setDraftOrder ─────────────────────────────────────────────────────────────

/**
 * Mutation: Set a specific draft order
 *
 * Allows the commissioner to supply an explicit ordered list of teamIds.
 * Only permitted when the draft is 'in-progress' and no picks have been made
 * (currentPick === 0).
 *
 * Posts a system chat message so all league members are notified.
 */
builder.mutationField('setDraftOrder', (t) =>
  t.field({
    type: Draft,
    args: {
      draftId: t.arg.int({ required: true }),
      teamIds: t.arg.intList({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { draftId, teamIds } = args;
      const userId = context.user.id;

      try {
        // Fetch + check + write inside one transaction with SELECT ... FOR UPDATE
        // on the drafts row so concurrent makeDraftPick (which also locks the
        // row) serializes against us — preventing TOCTOU on currentPick where
        // a pick lands between the state check and the order rewrite.
        const leagueIdForLog = await context.db.transaction(async (tx) => {
          // Surface lock waits as errors rather than silent hangs.
          await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

          if (new Set(teamIds).size !== teamIds.length) {
            throw UserInputError('teamIds must not contain duplicate values');
          }

          const [draft] = await tx
            .select({
              id: PublicSchema.drafts.id,
              leagueId: PublicSchema.drafts.leagueId,
              currentPick: PublicSchema.drafts.currentPick,
            })
            .from(PublicSchema.drafts)
            .where(eq(PublicSchema.drafts.id, draftId))
            .limit(1)
            .for('update');

          if (!draft) {
            throw UserInputError('Draft not found');
          }

          const [league] = await tx
            .select({
              id: PublicSchema.leagues.id,
              draftStatus: PublicSchema.leagues.draftStatus,
            })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.leagueId))
            .limit(1);

          if (!league) {
            throw UserInputError('League not found');
          }

          if (league.draftStatus !== 'in-progress') {
            throw UserInputError(
              'Draft order can only be changed while the draft is in-progress',
            );
          }
          if (Number(draft.currentPick) !== 0) {
            throw UserInputError(
              'Draft order cannot be changed after picks have been made',
            );
          }

          // Verify the caller is the league GM (commissioner).
          const [membership] = await tx
            .select()
            .from(PublicSchema.leagueMembers)
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
                eq(PublicSchema.leagueMembers.userId, userId),
              ),
            )
            .limit(1);

          if (!membership || membership.permissionLevel !== 'general_manager') {
            throw ForbiddenError(
              'Only the league General Manager can change the draft order',
            );
          }

          // Fetch current draft_teams to validate the provided teamIds
          // (preserve autoPick/leagueId).
          const currentTeams = await tx
            .select({
              teamId: PublicSchema.draftTeams.teamId,
              leagueId: PublicSchema.draftTeams.leagueId,
              autoPick: PublicSchema.draftTeams.autoPick,
            })
            .from(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, draftId));

          const currentTeamMap = new Map(
            currentTeams.map((t) => [
              t.teamId,
              { leagueId: t.leagueId, autoPick: t.autoPick },
            ]),
          );

          if (teamIds.length !== currentTeamMap.size) {
            throw UserInputError(
              `Expected ${String(currentTeamMap.size)} team IDs but received ${String(teamIds.length)}`,
            );
          }
          for (const id of teamIds) {
            if (!currentTeamMap.has(id)) {
              throw UserInputError(
                `Team ${String(id)} is not part of this draft`,
              );
            }
          }

          // Delete and re-insert to avoid unique constraint violation on
          // (draftId, draftOrder) when the reorder conflicts with existing
          // orders during per-row updates.
          await tx
            .delete(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, draftId));
          await tx.insert(PublicSchema.draftTeams).values(
            teamIds.map((teamId, index) => {
              const meta = currentTeamMap.get(teamId);
              if (!meta)
                throw UserInputError(
                  `Team ${String(teamId)} not found in draft`,
                );
              return {
                draftId,
                teamId,
                leagueId: meta.leagueId,
                draftOrder: index + 1,
                autoPick: meta.autoPick,
              };
            }),
          );

          return draft.leagueId;
        });

        LOGGER.info('Commissioner set draft order', {
          draftId,
          leagueId: leagueIdForLog,
          teamIds,
          userId,
        });

        // Post chat notification
        const username = context.user.username ?? `user_${String(userId)}`;
        const notificationText = `${username} set a custom draft order.`;
        await postDraftOrderChatNotification(
          context.db,
          context.notificationService,
          leagueIdForLog,
          username,
          notificationText,
        );

        // Return updated draft record
        const [updatedDraft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        return updatedDraft;
      } catch (error) {
        LOGGER.error(
          'Error setting draft order',
          error instanceof Error ? error : new Error(String(error)),
          { draftId, userId },
        );
        throw error;
      }
    },
  }),
);

// ── randomizeDraftOrder ───────────────────────────────────────────────────────

/**
 * Mutation: Randomize the draft order
 *
 * Shuffles the existing draft_teams positions using a Fisher-Yates shuffle.
 * Only permitted when the draft is 'in-progress' and no picks have been made
 * (currentPick === 0).
 *
 * Posts a system chat message so all league members are notified.
 */
builder.mutationField('randomizeDraftOrder', (t) =>
  t.field({
    type: Draft,
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
        // Fetch + check + write inside one transaction with SELECT ... FOR UPDATE
        // on the drafts row so concurrent makeDraftPick (which also locks the
        // row) serializes against us — preventing TOCTOU on currentPick where
        // a pick lands between the state check and the order rewrite.
        const leagueIdForLog = await context.db.transaction(async (tx) => {
          // Surface lock waits as errors rather than silent hangs.
          await tx.execute(sql`SET LOCAL statement_timeout = '5000'`);

          const [draft] = await tx
            .select({
              id: PublicSchema.drafts.id,
              leagueId: PublicSchema.drafts.leagueId,
              currentPick: PublicSchema.drafts.currentPick,
            })
            .from(PublicSchema.drafts)
            .where(eq(PublicSchema.drafts.id, draftId))
            .limit(1)
            .for('update');

          if (!draft) {
            throw UserInputError('Draft not found');
          }

          const [league] = await tx
            .select({
              id: PublicSchema.leagues.id,
              draftStatus: PublicSchema.leagues.draftStatus,
            })
            .from(PublicSchema.leagues)
            .where(eq(PublicSchema.leagues.id, draft.leagueId))
            .limit(1);

          if (!league) {
            throw UserInputError('League not found');
          }

          if (league.draftStatus !== 'in-progress') {
            throw UserInputError(
              'Draft order can only be randomized while the draft is in-progress',
            );
          }
          if (Number(draft.currentPick) !== 0) {
            throw UserInputError(
              'Draft order cannot be randomized after picks have been made',
            );
          }

          // Verify the caller is the league GM or Commissioner.
          const [membership] = await tx
            .select()
            .from(PublicSchema.leagueMembers)
            .where(
              and(
                eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
                eq(PublicSchema.leagueMembers.userId, userId),
              ),
            )
            .limit(1);

          if (
            !membership ||
            (membership.permissionLevel !== 'general_manager' &&
              membership.permissionLevel !== 'commissioner')
          ) {
            throw ForbiddenError(
              'Only the league General Manager or Commissioner can randomize the draft order',
            );
          }

          // Fetch current team IDs in this draft (preserve autoPick and leagueId).
          const currentTeams = await tx
            .select({
              teamId: PublicSchema.draftTeams.teamId,
              leagueId: PublicSchema.draftTeams.leagueId,
              autoPick: PublicSchema.draftTeams.autoPick,
            })
            .from(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, draftId))
            .orderBy(asc(PublicSchema.draftTeams.draftOrder));

          if (currentTeams.length === 0) {
            throw UserInputError('No teams found for this draft');
          }

          // Fisher-Yates shuffle
          const shuffled = [...currentTeams];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          // Delete and re-insert to avoid unique constraint violation on
          // (draftId, draftOrder) when the shuffled order conflicts with
          // existing orders during per-row updates.
          await tx
            .delete(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, draftId));
          await tx.insert(PublicSchema.draftTeams).values(
            shuffled.map((team, index) => ({
              draftId,
              teamId: team.teamId,
              leagueId: team.leagueId,
              draftOrder: index + 1,
              autoPick: team.autoPick,
            })),
          );

          return draft.leagueId;
        });

        LOGGER.info('Commissioner randomized draft order', {
          draftId,
          leagueId: leagueIdForLog,
          userId,
        });

        // Post chat notification
        const username = context.user.username ?? `user_${String(userId)}`;
        const notificationText = `${username} randomized the draft order.`;
        await postDraftOrderChatNotification(
          context.db,
          context.notificationService,
          leagueIdForLog,
          username,
          notificationText,
        );

        // Return updated draft record
        const [updatedDraft] = await context.db
          .select()
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        return updatedDraft;
      } catch (error) {
        LOGGER.error(
          'Error randomizing draft order',
          error instanceof Error ? error : new Error(String(error)),
          { draftId, userId },
        );
        throw error;
      }
    },
  }),
);
