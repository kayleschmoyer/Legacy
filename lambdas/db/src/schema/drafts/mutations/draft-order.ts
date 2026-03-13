/**
 * Draft mutations: setDraftOrder + randomizeDraftOrder
 * Includes the shared postDraftOrderChatNotification helper.
 */

import { PublicSchema } from '@legacy-sports/db-client';
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

        // Fetch current draft_teams to validate the provided teamIds (preserve autoPick/leagueId)
        const currentTeams = await context.db
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

        if (new Set(teamIds).size !== teamIds.length) {
          throw new Error('teamIds must not contain duplicate values');
        }

        if (teamIds.length !== currentTeamMap.size) {
          throw new Error(
            `Expected ${String(currentTeamMap.size)} team IDs but received ${String(teamIds.length)}`,
          );
        }
        for (const id of teamIds) {
          if (!currentTeamMap.has(id)) {
            throw new Error(`Team ${String(id)} is not part of this draft`);
          }
        }

        // Delete and re-insert to avoid unique constraint violation on (draftId, draftOrder)
        // when the reorder conflicts with existing orders during per-row updates.
        await context.db.transaction(async (tx) => {
          await tx
            .delete(PublicSchema.draftTeams)
            .where(eq(PublicSchema.draftTeams.draftId, draftId));
          await tx.insert(PublicSchema.draftTeams).values(
            teamIds.map((teamId, index) => {
              const meta = currentTeamMap.get(teamId);
              if (!meta)
                throw new Error(`Team ${String(teamId)} not found in draft`);
              return {
                draftId,
                teamId,
                leagueId: meta.leagueId,
                draftOrder: index + 1,
                autoPick: meta.autoPick,
              };
            }),
          );
        });

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
          context.notificationService,
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

        if (
          !membership ||
          (membership.permissionLevel !== 'general_manager' &&
            membership.permissionLevel !== 'commissioner')
        ) {
          throw new Error(
            'Only the league General Manager or Commissioner can randomize the draft order',
          );
        }

        // Fetch current team IDs in this draft (preserve autoPick and leagueId)
        const currentTeams = await context.db
          .select({
            teamId: PublicSchema.draftTeams.teamId,
            leagueId: PublicSchema.draftTeams.leagueId,
            autoPick: PublicSchema.draftTeams.autoPick,
          })
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

        // Delete and re-insert to avoid unique constraint violation on (draftId, draftOrder)
        // when the shuffled order conflicts with existing orders during per-row updates.
        await context.db.transaction(async (tx) => {
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
        });

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
          context.notificationService,
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
