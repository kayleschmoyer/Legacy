/**
 * Draft mutations: setDraftOrder + randomizeDraftOrder
 * Includes the shared postDraftOrderChatNotification helper.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, sql } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { ENTITLEMENTS } from '@legacy-sports/utils';

import { Draft } from '../types';
import { getDraftSeats, setLeagueDraftSeatOrder } from '../participants';
import { builder } from '../../builder';
import type { Context } from '../../builder';
import { requireEntitlement } from '../../authorization';
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
      await requireEntitlement(context, ENTITLEMENTS.premium_draft_controls);

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

          // Fetch the draft's current seats to validate the provided teamIds.
          const seats = await getDraftSeats(tx, draftId);
          const seatedTeamIds = new Set(
            seats
              .map((seat) => seat.teamId)
              .filter((id): id is number => id !== null),
          );

          if (teamIds.length !== seatedTeamIds.size) {
            throw UserInputError(
              `Expected ${String(seatedTeamIds.size)} team IDs but received ${String(teamIds.length)}`,
            );
          }
          for (const id of teamIds) {
            if (!seatedTeamIds.has(id)) {
              throw UserInputError(
                `Team ${String(id)} is not part of this draft`,
              );
            }
          }

          // Permute the seats in place (LS-10074). Each seat keeps its id,
          // auto-pick flag and controller, so anything referencing the seat
          // follows its team to the new slot — the delete-and-reinsert this
          // replaces existed only to dodge draft_teams' NOT DEFERRABLE unique
          // constraint on (draft_id, draft_order).
          await setLeagueDraftSeatOrder(tx, draftId, teamIds);

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
        if (error instanceof GraphQLError) {
          throw error;
        }
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
 * Shuffles the draft's existing seat order using a Fisher-Yates shuffle.
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
      await requireEntitlement(context, ENTITLEMENTS.premium_draft_controls);

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
          const currentTeams = (await getDraftSeats(tx, draftId))
            .map((seat) => seat.teamId)
            .filter((id): id is number => id !== null);

          if (currentTeams.length === 0) {
            throw UserInputError('No teams found for this draft');
          }

          // Fisher-Yates shuffle
          const shuffled = [...currentTeams];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          // Permute the seats in place — see setDraftOrder above (LS-10074).
          await setLeagueDraftSeatOrder(tx, draftId, shuffled);

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
        if (error instanceof GraphQLError) {
          throw error;
        }
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
