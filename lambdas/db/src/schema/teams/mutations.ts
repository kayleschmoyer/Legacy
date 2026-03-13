/**
 * Teams domain — Mutation resolvers
 *
 * Mutations: updateTeamMemberPosition, swapTeamMemberPositions, renameTeam,
 *            inviteAssistantManager, removeAssistantManager
 */
import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { authorized, isTeamGeneralManager } from '../authorization';
import { builder } from '../builder';
import { LeagueMember, Team, TeamMember } from '../leagues/types';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * After a team member position change, mirror the new positionId onto the
 * current active matchup week AND all future matchup weeks where the player's
 * slot has NOT been manually edited via the matchup lineup editor.
 *
 * Rows where `manually_edited = true` are left untouched — those represent
 * intentional future-week edits made by the user and should not be
 * overwritten.
 *
 * Best-effort: logs a warning on failure rather than throwing, so a sync
 * error never rolls back the already-committed team_members update.
 */
async function syncCurrentMatchupPositions(
  db: PublicDb,
  leagueId: number,
  changes: Array<{
    teamId: number;
    playerId: number;
    positionId: number | null;
  }>,
): Promise<void> {
  if (changes.length === 0) return;

  // 1. Find the current active matchup pointer for the league
  const leagueRows = await db
    .select({ currentMatchup: PublicSchema.leagues.currentMatchup })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);
  const currentMatchupId = leagueRows[0]?.currentMatchup;
  if (!currentMatchupId) return; // No active matchup — nothing to sync

  // 2. Resolve the current week number from the reference matchup
  const refMatchup = await db
    .select({ weekNumber: PublicSchema.matchups.weekNumber })
    .from(PublicSchema.matchups)
    .where(eq(PublicSchema.matchups.id, currentMatchupId))
    .limit(1);
  const weekNumber = refMatchup[0]?.weekNumber;
  if (weekNumber == null) return;

  // 3. Load all matchups for this league at or after the current week
  //    and build a teamId+weekNumber → matchupId map.
  const futureMatchups = await db
    .select({
      id: PublicSchema.matchups.id,
      weekNumber: PublicSchema.matchups.weekNumber,
      team1Id: PublicSchema.matchups.team1Id,
      team2Id: PublicSchema.matchups.team2Id,
    })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        gte(PublicSchema.matchups.weekNumber, weekNumber),
      ),
    );

  // Build a set of matchup IDs relevant to each changed teamId
  const matchupIdsByTeam = new Map<number, number[]>();
  for (const m of futureMatchups) {
    for (const teamId of [m.team1Id, m.team2Id]) {
      if (!teamId) continue;
      let teamMatchupIds = matchupIdsByTeam.get(teamId);
      if (!teamMatchupIds) {
        teamMatchupIds = [];
        matchupIdsByTeam.set(teamId, teamMatchupIds);
      }
      teamMatchupIds.push(m.id);
    }
  }

  // 4. For each change, update matchup_players rows where manuallyEdited = false
  for (const change of changes) {
    const matchupIds = matchupIdsByTeam.get(change.teamId);
    if (!matchupIds || matchupIds.length === 0) continue;

    await db
      .update(PublicSchema.matchupPlayers)
      .set({ positionId: change.positionId })
      .where(
        and(
          inArray(PublicSchema.matchupPlayers.matchupId, matchupIds),
          eq(PublicSchema.matchupPlayers.playerId, change.playerId),
          eq(PublicSchema.matchupPlayers.teamId, change.teamId),
          eq(PublicSchema.matchupPlayers.manuallyEdited, false),
        ),
      );
  }
}

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
              onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
            });

          if (updated.length === 0) {
            throw new Error('Failed to update team member position');
          }

          const member = updated[0];

          // Mirror the position change onto matchup_players for the active week
          if (member.teamId) {
            try {
              await syncCurrentMatchupPositions(db, member.leagueId, [
                {
                  teamId: member.teamId,
                  playerId: member.playerId,
                  positionId: positionId ?? null,
                },
              ]);
            } catch (syncError) {
              LOGGER.warn(
                'Failed to sync matchup player position after roster update',
                {
                  teamMemberId,
                  positionId,
                  error:
                    syncError instanceof Error
                      ? syncError.message
                      : String(syncError),
                },
              );
            }
          }

          return member;
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
                onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
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
                onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
              });

            if (updatedA.length === 0 || updatedB.length === 0) {
              throw new Error(
                'Failed to update one or both team member positions',
              );
            }

            return [updatedA[0], updatedB[0]];
          });

          // Mirror both position changes onto matchup_players for the active week.
          // Uses memberA's leagueId — both members belong to the same league.
          const [memberA, memberB] = results;
          if (memberA.teamId && memberB.teamId) {
            try {
              await syncCurrentMatchupPositions(db, memberA.leagueId, [
                {
                  teamId: memberA.teamId,
                  playerId: memberA.playerId,
                  positionId: positionIdA ?? null,
                },
                {
                  teamId: memberB.teamId,
                  playerId: memberB.playerId,
                  positionId: positionIdB ?? null,
                },
              ]);
            } catch (syncError) {
              LOGGER.warn(
                'Failed to sync matchup player positions after roster swap',
                {
                  teamMemberIdA,
                  teamMemberIdB,
                  error:
                    syncError instanceof Error
                      ? syncError.message
                      : String(syncError),
                },
              );
            }
          }

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
        throw AuthenticationError();
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
        throw ForbiddenError('Not a member of this league');
      }

      const isCommish =
        membership[0].permissionLevel === 'commissioner' ||
        membership[0].permissionLevel === 'general_manager' ||
        membership[0].permissionLevel === 'assistant_manager';

      if (!isCommish && membership[0].teamId !== teamId) {
        throw ForbiddenError('You can only rename your own team');
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
          divisionId: PublicSchema.teams.divisionId,
          waiverOrder: PublicSchema.teams.waiverOrder,
          faabBudget: PublicSchema.teams.faabBudget,
          createdAt: PublicSchema.teams.createdAt,
          updatedAt: PublicSchema.teams.updatedAt,
          logoUrl: PublicSchema.teams.logoUrl,
          primaryColor: PublicSchema.teams.primaryColor,
          secondaryColor: PublicSchema.teams.secondaryColor,
          isLocked: PublicSchema.teams.isLocked,
          avatarUrl: PublicSchema.teams.avatarUrl,
          bannerUrl: PublicSchema.teams.bannerUrl,
        });

      if (updated.length === 0) {
        throw new Error('Failed to rename team');
      }

      const senderUsername = context.user.username ?? `user_${context.user.id}`;

      // Send league chat notification (fire-and-forget)
      const { notificationService } = context;
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

// ── Invite / Remove Assistant Manager ─────────────────────────────────────

/**
 * Mutation: inviteAssistantManager
 *
 * Allows the General Manager (owner) of a team to invite another user as an
 * assistant manager for that team.  The invited user must already have an
 * account in the system and must not already be a member of the same league.
 *
 * Authorization: caller must be the owner/general_manager of the team, OR a
 * league commissioner.
 */
builder.mutationField('inviteAssistantManager', (t) =>
  t.field({
    type: LeagueMember,
    args: {
      teamId: t.arg.int({ required: true }),
      username: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { teamId, username } = args;
      const userId = context.user.id;
      const db = context.db;

      // 1. Resolve teamId → leagueId
      const teamRows = await db
        .select({
          id: PublicSchema.teams.id,
          leagueId: PublicSchema.teams.leagueId,
        })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, teamId))
        .limit(1);

      if (teamRows.length === 0) {
        throw new Error('Team not found');
      }

      const leagueId = teamRows[0].leagueId;

      // 2. Verify caller has permission: must be the team's GM or a commissioner
      const callerMembership = await db
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

      if (callerMembership.length === 0) {
        throw ForbiddenError('You are not a member of this league');
      }

      const callerRole = callerMembership[0];
      const isCommissioner = callerRole.permissionLevel === 'commissioner';
      const isGM = isTeamGeneralManager(
        {
          leagueId,
          userId,
          teamId: callerRole.teamId,
          permissionLevel: callerRole.permissionLevel,
        },
        teamId,
      );

      if (!isGM && !isCommissioner) {
        throw new Error(
          'Only the team General Manager or a league commissioner can invite assistant managers',
        );
      }

      // 3. Look up the invitee by username
      const inviteeRows = await db
        .select({
          id: PublicSchema.users.id,
          username: PublicSchema.users.username,
        })
        .from(PublicSchema.users)
        .where(eq(PublicSchema.users.username, username.trim()))
        .limit(1);

      if (inviteeRows.length === 0) {
        throw new Error(`No user found with username "${username}"`);
      }

      const inviteeId = Number(inviteeRows[0].id);

      if (inviteeId === userId) {
        throw new Error('You cannot invite yourself as an assistant manager');
      }

      // 4. Check the invitee is not already a member of this league
      const existingMembership = await db
        .select({
          leagueId: PublicSchema.leagueMembers.leagueId,
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, inviteeId),
          ),
        )
        .limit(1);

      if (existingMembership.length > 0) {
        const existing = existingMembership[0];
        if (
          existing.teamId === teamId &&
          existing.permissionLevel === 'assistant_manager'
        ) {
          throw new Error(
            `${username} is already an assistant manager for this team`,
          );
        }
        throw new Error(`${username} is already a member of this league`);
      }

      // 5. Insert the new league_members row with assistant_manager permission
      const inserted = await db
        .insert(PublicSchema.leagueMembers)
        .values({
          leagueId,
          userId: inviteeId,
          teamId,
          permissionLevel: 'assistant_manager',
        })
        .returning({
          leagueId: PublicSchema.leagueMembers.leagueId,
          userId: PublicSchema.leagueMembers.userId,
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        });

      LOGGER.info('Invited assistant manager', {
        invitedBy: userId,
        inviteeId,
        teamId,
        leagueId,
      });

      // 6. Send a league chat notification
      const senderUsername = context.user.username ?? `user_${userId}`;
      const { notificationService } = context;
      if (notificationService) {
        const chatText = `${senderUsername} added ${username} as an assistant manager`;
        try {
          const msgRows = await db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId, userId, messageText: chatText })
            .returning();
          const msg = msgRows[0];
          await notificationService.notifyLeagueChatMessage(leagueId, {
            leagueId,
            messageId: msg.id,
            senderId: userId,
            senderUsername,
            messageText: chatText,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send invite assistant manager chat notification',
            { err },
          );
        }
      }

      return inserted[0];
    },
  }),
);

/**
 * Mutation: removeAssistantManager
 *
 * Removes an assistant manager from a team.  Only the team's General Manager
 * or a league commissioner can remove an assistant manager.
 */
builder.mutationField('removeAssistantManager', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      teamId: t.arg.int({ required: true }),
      userId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { teamId, userId: targetUserId } = args;
      const callerId = context.user.id;
      const db = context.db;

      // Resolve leagueId
      const teamRows = await db
        .select({ leagueId: PublicSchema.teams.leagueId })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, teamId))
        .limit(1);

      if (teamRows.length === 0) {
        throw new Error('Team not found');
      }

      const leagueId = teamRows[0].leagueId;

      // Verify caller permission
      const callerMembership = await db
        .select({
          teamId: PublicSchema.leagueMembers.teamId,
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, callerId),
          ),
        )
        .limit(1);

      if (callerMembership.length === 0) {
        throw ForbiddenError('You are not a member of this league');
      }

      const callerRole = callerMembership[0];
      const isCommissioner = callerRole.permissionLevel === 'commissioner';
      const isGM = isTeamGeneralManager(
        {
          leagueId,
          userId: callerId,
          teamId: callerRole.teamId,
          permissionLevel: callerRole.permissionLevel,
        },
        teamId,
      );

      if (!isGM && !isCommissioner) {
        throw new Error(
          'Only the team General Manager or a league commissioner can remove assistant managers',
        );
      }

      // Verify that the target is actually an assistant_manager for this team
      const targetMembership = await db
        .select({
          permissionLevel: PublicSchema.leagueMembers.permissionLevel,
          teamId: PublicSchema.leagueMembers.teamId,
        })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, targetUserId),
          ),
        )
        .limit(1);

      if (targetMembership.length === 0) {
        throw ForbiddenError('User is not a member of this league');
      }

      if (
        targetMembership[0].permissionLevel !== 'assistant_manager' ||
        targetMembership[0].teamId !== teamId
      ) {
        throw ForbiddenError('User is not an assistant manager for this team');
      }

      // Remove the league_members row
      await db
        .delete(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, targetUserId),
          ),
        );

      LOGGER.info('Removed assistant manager', {
        removedBy: callerId,
        targetUserId,
        teamId,
        leagueId,
      });

      // Send a league chat notification
      const senderUsername = context.user.username ?? `user_${callerId}`;
      const { notificationService } = context;
      if (notificationService) {
        const chatText = `${senderUsername} removed an assistant manager from the team`;
        try {
          const msgRows = await db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId, userId: callerId, messageText: chatText })
            .returning();
          const msg = msgRows[0];
          await notificationService.notifyLeagueChatMessage(leagueId, {
            leagueId,
            messageId: msg.id,
            senderId: callerId,
            senderUsername,
            messageText: chatText,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send remove assistant manager chat notification',
            { err },
          );
        }
      }

      return true;
    },
  }),
);

// ── Update Team Branding ────────────────────────────────────────────────────

/**
 * Mutation: updateTeamBranding
 *
 * Allows a team's General Manager (or commissioner) to set or clear team
 * branding fields:
 *   - logoUrl: team logo image URL (must be HTTPS)
 *   - primaryColor / secondaryColor: brand hex colours (e.g. #FF0000)
 *   - avatarUrl: team avatar image URL (must be HTTPS)
 *   - bannerUrl: team header/banner image URL (must be HTTPS)
 *
 * Each field is optional; omit to leave unchanged, pass empty string to clear.
 */
builder.mutationField('updateTeamBranding', (t) =>
  t.field({
    type: Team,
    args: {
      teamId: t.arg.int({ required: true }),
      leagueId: t.arg.int({ required: true }),
      logoUrl: t.arg.string({ required: false }),
      primaryColor: t.arg.string({ required: false }),
      secondaryColor: t.arg.string({ required: false }),
      /** New avatar URL, or empty string to clear. Omit to leave unchanged. */
      avatarUrl: t.arg.string({ required: false }),
      /** New banner URL, or empty string to clear. Omit to leave unchanged. */
      bannerUrl: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { teamId, leagueId, primaryColor, secondaryColor } = args;
      const userId = context.user.id;
      const db = context.db;

      // ── Validate hex colors ────────────────────────────────────────────────
      const hexPattern = /^#[0-9A-Fa-f]{6}$/;
      if (
        primaryColor !== null &&
        primaryColor !== undefined &&
        !hexPattern.test(primaryColor)
      ) {
        throw new Error(
          'primaryColor must be a valid hex color (e.g. #FF0000)',
        );
      }
      if (
        secondaryColor !== null &&
        secondaryColor !== undefined &&
        !hexPattern.test(secondaryColor)
      ) {
        throw new Error(
          'secondaryColor must be a valid hex color (e.g. #FF0000)',
        );
      }

      // ── Validate URL fields ────────────────────────────────────────────────
      const validateUrl = (
        raw: string | null | undefined,
        fieldName: string,
      ): string | null => {
        if (raw === undefined) return undefined as unknown as null; // sentinel: skip this field
        if (raw === null || raw.trim() === '') return null; // clear the field
        const trimmed = raw.trim();
        if (trimmed.length > 2048) {
          throw new Error(`${fieldName} URL is too long (max 2048 chars)`);
        }

        // Parse and validate as a proper URL (catches malformed inputs).
        let parsed: URL;
        try {
          parsed = new URL(trimmed);
        } catch {
          throw new Error(`${fieldName} must be a valid URL`);
        }

        // Only allow HTTPS — no http, data:, javascript:, etc.
        if (parsed.protocol !== 'https:') {
          throw new Error(`${fieldName} must use HTTPS`);
        }

        // Reject embedded credentials (user:pass@host) — phishing/confusion vector.
        if (parsed.username || parsed.password) {
          throw new Error(`${fieldName} must not contain credentials`);
        }

        const hostname = parsed.hostname.toLowerCase();

        // Block hostnames that resolve to private/loopback networks (SSRF
        // prevention). These addresses are unreachable from end-user browsers
        // and serve no purpose for image hosting.
        const blockedPatterns = [
          /^localhost$/,
          /^127\./,
          /^10\./,
          /^172\.(1[6-9]|2\d|3[01])\./,
          /^192\.168\./,
          /^169\.254\./, // AWS instance metadata service
          /^\[?::1\]?$/, // IPv6 loopback
          /^\[?fc[0-9a-f]{2}:/i, // IPv6 ULA
          /^\[?fe[89ab][0-9a-f]:/i, // IPv6 link-local
        ];
        for (const pattern of blockedPatterns) {
          if (pattern.test(hostname)) {
            throw new Error(`${fieldName} must be a public URL`);
          }
        }

        // Block bare IPv4 addresses (no legitimate image CDN uses a raw IP).
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
          throw new Error(
            `${fieldName} must use a domain name, not an IP address`,
          );
        }

        return trimmed;
      };

      const newLogoUrl = validateUrl(args.logoUrl, 'logoUrl');
      const newAvatarUrl = validateUrl(args.avatarUrl, 'avatarUrl');
      const newBannerUrl = validateUrl(args.bannerUrl, 'bannerUrl');

      // ── Verify GM / commissioner ownership ────────────────────────────────
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
        throw ForbiddenError('Not a member of this league');
      }

      const { permissionLevel, teamId: memberTeamId } = membership[0];

      const isCommissioner = permissionLevel === 'commissioner';
      const isOwner = memberTeamId === teamId;
      const isGM =
        isOwner &&
        (permissionLevel === 'general_manager' ||
          permissionLevel === 'assistant_manager');

      if (!isCommissioner && !isGM) {
        throw new Error(
          'Only the team General Manager can update team branding',
        );
      }

      // ── Build update set ───────────────────────────────────────────────────
      const updateSet: Partial<{
        logoUrl: string | null;
        primaryColor: string | null;
        secondaryColor: string | null;
        avatarUrl: string | null;
        bannerUrl: string | null;
        updatedAt: Date;
      }> = { updatedAt: new Date() };

      if (newLogoUrl !== undefined) updateSet.logoUrl = newLogoUrl;
      if (primaryColor !== undefined)
        updateSet.primaryColor = primaryColor ?? null;
      if (secondaryColor !== undefined)
        updateSet.secondaryColor = secondaryColor ?? null;
      if (newAvatarUrl !== undefined) updateSet.avatarUrl = newAvatarUrl;
      if (newBannerUrl !== undefined) updateSet.bannerUrl = newBannerUrl;

      // ── Persist ────────────────────────────────────────────────────────────
      const updated = await db
        .update(PublicSchema.teams)
        .set(updateSet)
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
          divisionId: PublicSchema.teams.divisionId,
          waiverOrder: PublicSchema.teams.waiverOrder,
          faabBudget: PublicSchema.teams.faabBudget,
          isLocked: PublicSchema.teams.isLocked,
          logoUrl: PublicSchema.teams.logoUrl,
          primaryColor: PublicSchema.teams.primaryColor,
          secondaryColor: PublicSchema.teams.secondaryColor,
          avatarUrl: PublicSchema.teams.avatarUrl,
          bannerUrl: PublicSchema.teams.bannerUrl,
          createdAt: PublicSchema.teams.createdAt,
          updatedAt: PublicSchema.teams.updatedAt,
        });

      if (updated.length === 0) {
        throw new Error('Team not found');
      }

      LOGGER.info('Updated team branding', {
        teamId,
        leagueId,
        userId,
      });

      return updated[0];
    },
  }),
);

// ── setTradeBlock ─────────────────────────────────────────────────────────────

builder.mutationField('setTradeBlock', (t) =>
  t.field({
    type: TeamMember,
    description:
      'Mark or unmark a roster player as available for trade. Only the team owner (GM or assistant manager) may call this.',
    args: {
      teamMemberId: t.arg.int({ required: true }),
      onTradeBlock: t.arg.boolean({ required: true }),
    },
    resolve: authorized(
      { teamMembers: (args) => [args.teamMemberId] },
      async (_parent, args, _context) => {
        const { teamMemberId, onTradeBlock } = args;
        const db = _context.db;

        const updated = await db
          .update(PublicSchema.teamMembers)
          .set({ onTradeBlock })
          .where(eq(PublicSchema.teamMembers.id, teamMemberId))
          .returning({
            id: PublicSchema.teamMembers.id,
            teamId: PublicSchema.teamMembers.teamId,
            leagueId: PublicSchema.teamMembers.leagueId,
            playerId: PublicSchema.teamMembers.playerId,
            positionId: PublicSchema.teamMembers.positionId,
            onTradeBlock: PublicSchema.teamMembers.onTradeBlock,
          });

        if (updated.length === 0) {
          throw new Error('Team member not found');
        }

        LOGGER.info('Updated trade block status', {
          teamMemberId,
          onTradeBlock,
        });

        return updated[0];
      },
    ),
  }),
);
