/**
 * Teams domain — Mutation resolvers
 *
 * Mutations: updateTeamMemberPosition, swapTeamMemberPositions, renameTeam
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { createNotificationService } from '@legacy-sports/aws-utils';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray } from 'drizzle-orm';
import { authorized } from '../authorization';
import { builder } from '../builder';
import { Team, TeamMember } from '../leagues/types';

// ── Mutation resolvers ─────────────────────────────────────────────────────

builder.mutationField('updateTeamMemberPosition', (t) =>
  t.field({
    type: TeamMember,
    args: {
      teamMemberId: t.arg.int({ required: true }),
      positionId: t.arg.int({ required: false }),
    },
    resolve: authorized(
      { teamMembers: (args) => [args.teamMemberId], checkLocked: true },
      async (_parent, args, context, user) => {
        const { teamMemberId, positionId } = args;

        try {
          const db = context.db;

          // Update the team member position
          const updated = await db
            .update(PublicSchema.teamMembers)
            .set({ positionId: positionId ?? null })
            .where(eq(PublicSchema.teamMembers.id, teamMemberId))
            .returning({
              id: PublicSchema.teamMembers.id,
              teamId: PublicSchema.teamMembers.teamId,
              leagueId: PublicSchema.teamMembers.leagueId,
              playerId: PublicSchema.teamMembers.playerId,
              positionId: PublicSchema.teamMembers.positionId,
            });

          if (updated.length === 0) {
            throw new Error('Failed to update team member position');
          }

          return updated[0];
        } catch (error) {
          LOGGER.error('Error updating team member position', {
            teamMemberId,
            positionId,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    ),
  }),
);

// Mutation field for atomically swapping two team members' positions
builder.mutationField('swapTeamMemberPositions', (t) =>
  t.field({
    type: [TeamMember],
    args: {
      teamMemberIdA: t.arg.int({ required: true }),
      positionIdA: t.arg.int({ required: false }),
      teamMemberIdB: t.arg.int({ required: true }),
      positionIdB: t.arg.int({ required: false }),
    },
    resolve: authorized(
      {
        teamMembers: (args) => [args.teamMemberIdA, args.teamMemberIdB],
        checkLocked: true,
      },
      async (_parent, args, context, user) => {
        const { teamMemberIdA, positionIdA, teamMemberIdB, positionIdB } = args;

        try {
          const db = context.db;

          // Perform the swap atomically inside a transaction
          const results = await db.transaction(async (tx) => {
            // Step 1: Clear both positions to avoid unique constraint violation
            await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: null })
              .where(
                inArray(PublicSchema.teamMembers.id, [
                  teamMemberIdA,
                  teamMemberIdB,
                ]),
              );

            // Step 2: Assign new positions
            const updatedA = await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: positionIdA ?? null })
              .where(eq(PublicSchema.teamMembers.id, teamMemberIdA))
              .returning({
                id: PublicSchema.teamMembers.id,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
                playerId: PublicSchema.teamMembers.playerId,
                positionId: PublicSchema.teamMembers.positionId,
              });

            const updatedB = await tx
              .update(PublicSchema.teamMembers)
              .set({ positionId: positionIdB ?? null })
              .where(eq(PublicSchema.teamMembers.id, teamMemberIdB))
              .returning({
                id: PublicSchema.teamMembers.id,
                teamId: PublicSchema.teamMembers.teamId,
                leagueId: PublicSchema.teamMembers.leagueId,
                playerId: PublicSchema.teamMembers.playerId,
                positionId: PublicSchema.teamMembers.positionId,
              });

            if (updatedA.length === 0 || updatedB.length === 0) {
              throw new Error(
                'Failed to update one or both team member positions',
              );
            }

            return [updatedA[0], updatedB[0]];
          });

          return results;
        } catch (error) {
          LOGGER.error('Error swapping team member positions', {
            teamMemberIdA,
            positionIdA,
            teamMemberIdB,
            positionIdB,
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    ),
  }),
);

// Mutation field for renaming a team
builder.mutationField('renameTeam', (t) =>
  t.field({
    type: Team,
    args: {
      teamId: t.arg.int({ required: true }),
      leagueId: t.arg.int({ required: true }),
      newName: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const name = args.newName.trim();
      if (name.length === 0) {
        throw new Error('Team name cannot be empty');
      }
      if (name.length > 100) {
        throw new Error('Team name cannot exceed 100 characters');
      }

      const { teamId, leagueId } = args;
      const userId = context.user.id;
      const db = context.db;

      // Verify membership and team ownership
      const membership = await db
        .select({
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, userId),
          ),
        )
        .limit(1);

      if (membership.length === 0) {
        throw new Error('Not a member of this league');
      }

      const isCommish =
        membership[0].permissionLevel === 'commissioner' ||
        membership[0].permissionLevel === 'owner';

      if (!isCommish && membership[0].teamId !== teamId) {
        throw new Error('You can only rename your own team');
      }

      // Fetch old name for the chat notification
      const teamRows = await db
        .select({ name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(
          and(
            eq(PublicSchema.teams.id, teamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .limit(1);

      if (teamRows.length === 0) {
        throw new Error('Team not found');
      }

      const oldName = teamRows[0].name;

      // Update the team name
      const updated = await db
        .update(PublicSchema.teams)
        .set({ name })
        .where(
          and(
            eq(PublicSchema.teams.id, teamId),
            eq(PublicSchema.teams.leagueId, leagueId),
          ),
        )
        .returning({
          id: PublicSchema.teams.id,
          name: PublicSchema.teams.name,
          leagueId: PublicSchema.teams.leagueId,
          waiverOrder: PublicSchema.teams.waiverOrder,
          faabBudget: PublicSchema.teams.faabBudget,
          createdAt: PublicSchema.teams.createdAt,
          updatedAt: PublicSchema.teams.updatedAt,
        });

      if (updated.length === 0) {
        throw new Error('Failed to rename team');
      }

      const senderUsername = context.user.username ?? `user_${context.user.id}`;

      // Send league chat notification (fire-and-forget)
      const notificationService = createNotificationService();
      if (notificationService) {
        const chatText = `${senderUsername} renamed "${oldName}" to "${name}"`;
        // Persist the system message
        const msgRows = await db
          .insert(PublicSchema.leagueMessages)
          .values({
            leagueId,
            userId,
            messageText: chatText,
          })
          .returning();

        const msg = msgRows[0];

        try {
          await notificationService.notifyLeagueChatMessage(leagueId, {
            leagueId,
            messageId: msg.id,
            senderId: userId,
            senderUsername,
            messageText: chatText,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        } catch (err: unknown) {
          LOGGER.warn('Failed to send rename chat WS notification', { err });
        }

        // Broadcast a roster-update so all connected clients refetch league data
        try {
          await notificationService.notifyRosterUpdate(leagueId);
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send roster update WS notification for rename',
            {
              err,
            },
          );
        }
      }

      return updated[0];
    },
  }),
);
