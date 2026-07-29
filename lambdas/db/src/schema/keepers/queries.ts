/**
 * Keeper designations domain — Query resolvers (LS-8673)
 *
 * Query: keeperEligibleRoster
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, inArray } from 'drizzle-orm';
import {
  isRookiePlayer,
  previewKeeperCost,
  resolveTeamIdForUser,
} from './helpers';
import { KeeperEligiblePlayer } from './types';
import { builder } from '../builder';
import { AuthenticationError } from '../graphql-errors';

// Returns [] (rather than throwing) whenever the league is not in keeper
// mode or the caller has no team — the manager UI calls this defensively on
// every pre-draft team view and simply renders nothing in that case.
builder.queryField('keeperEligibleRoster', (t) =>
  t.field({
    type: [KeeperEligiblePlayer],
    description:
      "The caller's roster players eligible for keeper designation, with " +
      'rookie-exemption and cost-preview info. Empty when the league is not ' +
      'in keeper mode or the caller has no team in it. (LS-8673)',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }
      const { leagueId } = args;
      const db = context.db;

      const teamId = await resolveTeamIdForUser(db, leagueId, context.user.id);
      if (!teamId) return [];

      const [league] = await db
        .select({
          rosterContinuity: PublicSchema.leagues.rosterContinuity,
          keeperSettings: PublicSchema.leagues.keeperSettings,
          seasonNumber: PublicSchema.leagues.seasonNumber,
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (
        !league ||
        league.rosterContinuity !== 'keeper' ||
        !league.keeperSettings
      ) {
        return [];
      }
      const season = league.seasonNumber ?? 1;
      const costModel = league.keeperSettings.costModel;

      const [roster, designations] = await Promise.all([
        db
          .select({
            playerId: PublicSchema.teamMembers.playerId,
            draftRound: PublicSchema.teamMembers.draftRound,
            totalGames: PublicSchema.players.totalGames,
          })
          .from(PublicSchema.teamMembers)
          .innerJoin(
            PublicSchema.players,
            eq(PublicSchema.players.id, PublicSchema.teamMembers.playerId),
          )
          .where(
            and(
              eq(PublicSchema.teamMembers.leagueId, leagueId),
              eq(PublicSchema.teamMembers.teamId, teamId),
            ),
          ),
        db
          .select({
            id: PublicSchema.keeperDesignations.id,
            playerId: PublicSchema.keeperDesignations.playerId,
          })
          .from(PublicSchema.keeperDesignations)
          .where(
            and(
              eq(PublicSchema.keeperDesignations.leagueId, leagueId),
              eq(PublicSchema.keeperDesignations.teamId, teamId),
              eq(PublicSchema.keeperDesignations.season, season),
              inArray(PublicSchema.keeperDesignations.status, [
                'pending',
                'locked',
              ]),
            ),
          ),
      ]);

      const designationByPlayer = new Map(
        designations.map((d) => [d.playerId, d.id]),
      );

      return roster.map((member) => {
        const { previewCostRound, previewCostAmount } = previewKeeperCost({
          costModel,
          draftRound: member.draftRound,
          maxRosterSize: league.maxRosterSize,
        });
        return {
          playerId: member.playerId,
          teamId,
          isRookie: isRookiePlayer(member.totalGames),
          designated: designationByPlayer.has(member.playerId),
          designationId: designationByPlayer.get(member.playerId) ?? null,
          previewCostRound,
          previewCostAmount,
        };
      });
    },
  }),
);
