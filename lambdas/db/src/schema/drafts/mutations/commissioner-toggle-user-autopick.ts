/**
 * Draft mutation: commissionerToggleUserAutoPick (LS-7981)
 *
 * Allows the league commissioner to enable or disable auto-pick for a
 * specific team in a live draft. The action is logged as a system message
 * in the draft chat so all participants can see it.
 *
 * Auth: league commissioner (permissionLevel = 'commissioner').
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';

import { builder } from '../../builder';
import {
  AuthenticationError,
  ForbiddenError,
  UserInputError,
} from '../../graphql-errors';

// ── commissionerToggleUserAutoPick ───────────────────────────────────────────

builder.mutationField('commissionerToggleUserAutoPick', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      draftId: t.arg.int({ required: true }),
      teamId: t.arg.int({ required: true }),
      enable: t.arg.boolean({ required: true }),
    },
    description:
      'Commissioner: enable or disable auto-pick for a specific team in a live draft (LS-7981).' +
      ' Logs the action as a system message in the draft chat.',
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to toggle auto-pick for a team',
        );
      }

      const { draftId, teamId, enable } = args;
      const userId = context.user.id;

      // Fetch draft + leagueId
      const [draft] = await context.db
        .select({
          id: PublicSchema.drafts.id,
          leagueId: PublicSchema.drafts.leagueId,
        })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      if (!draft) {
        throw UserInputError('Draft not found');
      }

      // Verify caller is the league commissioner
      const [membership] = await context.db
        .select({ permissionLevel: PublicSchema.leagueMembers.permissionLevel })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, draft.leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (!membership || membership.permissionLevel !== 'commissioner') {
        throw ForbiddenError(
          'Only the league commissioner can toggle auto-pick for other teams',
        );
      }

      // Verify draft is currently in-progress
      const [league] = await context.db
        .select({ draftStatus: PublicSchema.leagues.draftStatus })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, draft.leagueId))
        .limit(1);

      if (!league || league.draftStatus !== 'in-progress') {
        throw UserInputError(
          'Auto-pick can only be toggled while a draft is in progress',
        );
      }

      // Verify target team participates in this draft
      const [draftTeamEntry] = await context.db
        .select({ draftOrder: PublicSchema.draftTeams.draftOrder })
        .from(PublicSchema.draftTeams)
        .where(
          and(
            eq(PublicSchema.draftTeams.draftId, draftId),
            eq(PublicSchema.draftTeams.teamId, teamId),
          ),
        )
        .limit(1);

      if (!draftTeamEntry) {
        throw UserInputError('Team is not participating in this draft');
      }

      // Apply the change
      await context.db
        .update(PublicSchema.draftTeams)
        .set({ autoPick: enable })
        .where(
          and(
            eq(PublicSchema.draftTeams.draftId, draftId),
            eq(PublicSchema.draftTeams.teamId, teamId),
          ),
        );

      LOGGER.info('[commissionerToggleUserAutoPick] Auto-pick toggled', {
        draftId,
        teamId,
        userId,
        enable,
      });

      // Look up team name and commissioner username for the chat message
      const [team] = await context.db
        .select({ name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, teamId))
        .limit(1);

      const teamName = team?.name ?? `Team #${teamId}`;
      const commissionerName = context.user.username ?? `user_${userId}`;
      const action = enable ? 'enabled' : 'disabled';
      const messageText = `⚙️ Commissioner ${commissionerName} ${action} auto-pick for ${teamName}`;

      // Post system message to the draft chat
      const [chatMsg] = await context.db
        .insert(PublicSchema.leagueMessages)
        .values({
          leagueId: draft.leagueId,
          userId: null,
          messageText,
          messageType: 'system',
        })
        .returning();

      if (context.notificationService) {
        context.notificationService
          .notifyLeagueChatMessage(draft.leagueId, {
            leagueId: draft.leagueId,
            messageId: chatMsg.id,
            senderId: null,
            senderUsername: commissionerName,
            messageText,
            timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            messageType: 'system',
          })
          .catch((err: unknown) => {
            LOGGER.warn(
              'Failed to send league chat WS notification for commissioner auto-pick toggle',
              { err },
            );
          });
      }

      return enable;
    },
  }),
);
