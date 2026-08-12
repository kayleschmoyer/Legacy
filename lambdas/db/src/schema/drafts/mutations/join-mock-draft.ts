/**
 * Draft mutation: joinMockDraft (LS-9181)
 *
 * Seats a real user into an open slot of a Shared mock draft lobby created by
 * `initializeMockDraft` (isOffline=false). Mirrors the real-league
 * `joinLeagueByCode` flow (lambdas/db/src/schema/leagues/mutations.ts) —
 * reusing its `claimUnassignedTeamForUser` helper — but scoped to
 * `isMockDraft` leagues and without the real-league active-league cap: a
 * joiner didn't create the league, and the weekly mock-draft cap
 * (`countRecentMockDrafts`) only ever counts leagues by `owner`, so joining
 * is free and uncapped for the joiner.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';
import { GraphQLError } from 'graphql';

import { builder } from '../../builder';
import { AuthenticationError, UserInputError } from '../../graphql-errors';
import { claimUnassignedTeamForUser } from '../../leagues/mutations';
import { Team } from '../../leagues/types';

builder.mutationField('joinMockDraft', (t) =>
  t.field({
    type: Team,
    description:
      'Join a Shared mock draft lobby by invite code, claiming an open slot ' +
      'that would otherwise be seated by AI when the commissioner starts the ' +
      'draft (LS-9181). Fails once the draft has started — join before then.',
    args: {
      inviteCode: t.arg.string({ required: true }),
      teamName: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError(
          'Authentication required to join a mock draft',
        );
      }

      const { inviteCode, teamName } = args;
      const userId = context.user.id;

      try {
        const leagues = await context.db
          .select({
            id: PublicSchema.leagues.id,
            isMockDraft: PublicSchema.leagues.isMockDraft,
            draftStatus: PublicSchema.leagues.draftStatus,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.inviteCode, inviteCode.toUpperCase()))
          .limit(1);

        // A code that resolves to a real (non-mock) league is treated the
        // same as an unknown code — this mutation only ever joins mock drafts.
        const league =
          leagues.length > 0 && leagues[0].isMockDraft ? leagues[0] : null;

        if (!league) {
          throw UserInputError(
            'Invalid invite code. Please check the code and try again.',
          );
        }

        if (league.draftStatus !== 'not-started') {
          throw UserInputError(
            'This mock draft has already started and can no longer be joined.',
          );
        }

        const existingMembership = await context.db
          .select({ userId: PublicSchema.leagueMembers.userId })
          .from(PublicSchema.leagueMembers)
          .where(
            and(
              eq(PublicSchema.leagueMembers.leagueId, league.id),
              eq(PublicSchema.leagueMembers.userId, userId),
            ),
          )
          .limit(1);

        if (existingMembership.length > 0) {
          throw UserInputError('You have already joined this mock draft.');
        }

        // No capCheck: mock-draft leagues never count against (or are
        // constrained by) the real-league active-league cap, and joining
        // doesn't charge the joiner's own weekly mock-draft allowance —
        // that limit is only ever enforced against the creator, in
        // initializeMockDraft.
        const claim = await claimUnassignedTeamForUser(context.db, {
          leagueId: league.id,
          userId,
          teamName,
          permissionLevel: 'general_manager',
        });

        if ('fullLeague' in claim) {
          throw UserInputError(
            'This mock draft is full. All slots have been claimed.',
          );
        }

        const [team] = await context.db
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
            leagueId: PublicSchema.teams.leagueId,
            divisionId: PublicSchema.teams.divisionId,
            createdAt: PublicSchema.teams.createdAt,
            updatedAt: PublicSchema.teams.updatedAt,
            waiverOrder: PublicSchema.teams.waiverOrder,
            faabBudget: PublicSchema.teams.faabBudget,
            logoUrl: PublicSchema.teams.logoUrl,
            primaryColor: PublicSchema.teams.primaryColor,
            secondaryColor: PublicSchema.teams.secondaryColor,
            isLocked: PublicSchema.teams.isLocked,
            avatarUrl: PublicSchema.teams.avatarUrl,
            bannerUrl: PublicSchema.teams.bannerUrl,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.id, claim.teamId))
          .limit(1);

        if (!team || typeof team.leagueId !== 'number') {
          throw new Error(
            `joinMockDraft: post-claim SELECT teams returned malformed row ` +
              `(teamId=${claim.teamId} leagueId=${league.id}); ` +
              `expected { id, leagueId } but got ${JSON.stringify(team)}`,
          );
        }

        LOGGER.info('User joined mock draft', {
          userId,
          leagueId: league.id,
          teamId: team.id,
        });

        // Best-effort league chat notification, mirroring joinLeagueByCode —
        // this is the same WS channel PreDraftLobby's team list relies on to
        // refresh, so joiners appear in the lobby without a page reload.
        const joinerUsername = context.user.username ?? `user_${userId}`;
        const joinText = `🎉 ${joinerUsername} joined the mock draft!`;
        try {
          const [chatMsg] = await context.db
            .insert(PublicSchema.leagueMessages)
            .values({ leagueId: league.id, userId, messageText: joinText })
            .returning();
          const { notificationService } = context;
          if (notificationService) {
            await notificationService.notifyLeagueChatMessage(league.id, {
              leagueId: league.id,
              messageId: chatMsg.id,
              senderId: userId,
              senderUsername: joinerUsername,
              messageText: joinText,
              timestamp: chatMsg.timestamp ?? new Date().toISOString(),
            });
          }
        } catch (err: unknown) {
          LOGGER.warn(
            'Failed to send league chat WS notification for mock draft join',
            { err },
          );
        }

        return team;
      } catch (error) {
        if (error instanceof GraphQLError) {
          throw error;
        }
        LOGGER.error(
          'Error joining mock draft',
          error instanceof Error ? error : new Error(String(error)),
          { userId, inviteCode: args.inviteCode },
        );
        throw new Error(
          `Failed to join mock draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  }),
);
