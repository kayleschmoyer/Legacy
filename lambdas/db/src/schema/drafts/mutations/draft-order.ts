/**
 * Draft mutations: setDraftOrder + randomizeDraftOrder
 * Includes the shared postDraftOrderChatNotification helper.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, asc, eq } from 'drizzle-orm';

import { Draft } from '../types';
import { builder } from '../../builder';
import type { Context } from '../../builder';

// ── Helpers shared by setDraftOrder / randomizeDraftOrder ────────────────────

/**
 * Post a system chat notification for a draft order change and broadcast it
 * over WebSocket so all connected league members see the update immediately.
 */
async function postDraftOrderChatNotification(
  db: Context['db'],
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

  const notificationService = createNotificationService();
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
        throw new Error('Authentication required');
      }

      const { draftId, teamIds } = args;
      const userId = context.user.id;

      try {
        // Fetch draft + league
        const [draft] = await context.db
          .select({
            id: PublicSchema.drafts.id,
            leagueId: PublicSchema.drafts.leagueId,
            currentPick: PublicSchema.drafts.currentPick,
          })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        if (!draft) {
          throw new Error('Draft not found');
        }

        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            draftStatus: PublicSchema.leagues.draftStatus,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, draft.leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        // Only allowed when draft is in-progress and no picks made yet
        if (league.draftStatus !== 'in-progress') {
          throw new Error(
            'Draft order can only be changed while the draft is in-progress',
          );
        }
        if (Number(draft.currentPick) !== 0) {
          throw new Error(
            'Draft order cannot be changed after picks have been made',
          );
        }

        // Verify the caller is the league GM (commissioner)
        const [membership] = await context.db
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
          throw new Error(
            'Only the league General Manager can change the draft order',
          );
        }

        // Fetch current draft_teams to validate the provided teamIds
        const currentTeams = await context.db
          .select({ teamId: PublicSchema.draftTeams.teamId })
          .from(PublicSchema.draftTeams)
          .where(eq(PublicSchema.draftTeams.draftId, draftId));

        const currentTeamIds = new Set(currentTeams.map((t) => t.teamId));

        if (teamIds.length !== currentTeamIds.size) {
          throw new Error(
            `Expected ${String(currentTeamIds.size)} team IDs but received ${String(teamIds.length)}`,
          );
        }
        for (const id of teamIds) {
          if (!currentTeamIds.has(id)) {
            throw new Error(`Team ${String(id)} is not part of this draft`);
          }
        }

        // Update draft_teams draftOrder for each team
        for (let i = 0; i < teamIds.length; i++) {
          await context.db
            .update(PublicSchema.draftTeams)
            .set({ draftOrder: i + 1 })
            .where(
              and(
                eq(PublicSchema.draftTeams.draftId, draftId),
                eq(PublicSchema.draftTeams.teamId, teamIds[i]),
              ),
            );
        }

        LOGGER.info('Commissioner set draft order', {
          draftId,
          leagueId: draft.leagueId,
          teamIds,
          userId,
        });

        // Post chat notification
        const username = context.user.username ?? `user_${String(userId)}`;
        const notificationText = `${username} set a custom draft order.`;
        await postDraftOrderChatNotification(
          context.db,
          draft.leagueId,
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
        LOGGER.error('Error setting draft order', {
          draftId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
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
        throw new Error('Authentication required');
      }

      const { draftId } = args;
      const userId = context.user.id;

      try {
        // Fetch draft + league
        const [draft] = await context.db
          .select({
            id: PublicSchema.drafts.id,
            leagueId: PublicSchema.drafts.leagueId,
            currentPick: PublicSchema.drafts.currentPick,
          })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.id, draftId))
          .limit(1);

        if (!draft) {
          throw new Error('Draft not found');
        }

        const [league] = await context.db
          .select({
            id: PublicSchema.leagues.id,
            draftStatus: PublicSchema.leagues.draftStatus,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, draft.leagueId))
          .limit(1);

        if (!league) {
          throw new Error('League not found');
        }

        // Only allowed when draft is in-progress and no picks made yet
        if (league.draftStatus !== 'in-progress') {
          throw new Error(
            'Draft order can only be randomized while the draft is in-progress',
          );
        }
        if (Number(draft.currentPick) !== 0) {
          throw new Error(
            'Draft order cannot be randomized after picks have been made',
          );
        }

        // Verify the caller is the league GM
        const [membership] = await context.db
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
          throw new Error(
            'Only the league General Manager can randomize the draft order',
          );
        }

        // Fetch current team IDs in this draft
        const currentTeams = await context.db
          .select({ teamId: PublicSchema.draftTeams.teamId })
          .from(PublicSchema.draftTeams)
          .where(eq(PublicSchema.draftTeams.draftId, draftId))
          .orderBy(asc(PublicSchema.draftTeams.draftOrder));

        if (currentTeams.length === 0) {
          throw new Error('No teams found for this draft');
        }

        // Fisher-Yates shuffle
        const shuffled = [...currentTeams];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Update draftOrder for each team
        for (let i = 0; i < shuffled.length; i++) {
          await context.db
            .update(PublicSchema.draftTeams)
            .set({ draftOrder: i + 1 })
            .where(
              and(
                eq(PublicSchema.draftTeams.draftId, draftId),
                eq(PublicSchema.draftTeams.teamId, shuffled[i].teamId),
              ),
            );
        }

        LOGGER.info('Commissioner randomized draft order', {
          draftId,
          leagueId: draft.leagueId,
          userId,
        });

        // Post chat notification
        const username = context.user.username ?? `user_${String(userId)}`;
        const notificationText = `${username} randomized the draft order.`;
        await postDraftOrderChatNotification(
          context.db,
          draft.leagueId,
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
        LOGGER.error('Error randomizing draft order', {
          draftId,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  }),
);
