/**
 * Waivers domain — Query resolvers
 *
 * Queries: teamWaiverClaims
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq, inArray } from 'drizzle-orm';
import { WaiverClaim } from './types';
import { builder } from '../builder';
import { AuthenticationError } from '../graphql-errors';

// ── Query resolvers ────────────────────────────────────────────────────────

builder.queryField('teamWaiverClaims', (t) =>
  t.field({
    type: [WaiverClaim],
    args: {
      teamId: t.arg.int({ required: true }),
      status: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const db = context.db;
      const { teamId } = args;
      const statusFilter = (args.status ?? 'pending') as
        | 'pending'
        | 'processing'
        | 'completed'
        | 'failed'
        | 'cancelled';

      // Fetch claims with player name joins
      const claims = await db
        .select({
          id: PublicSchema.waiverClaims.id,
          leagueId: PublicSchema.waiverClaims.leagueId,
          teamId: PublicSchema.waiverClaims.teamId,
          userId: PublicSchema.waiverClaims.userId,
          playerId: PublicSchema.waiverClaims.playerId,
          dropPlayerId: PublicSchema.waiverClaims.dropPlayerId,
          faabBid: PublicSchema.waiverClaims.faabBid,
          status: PublicSchema.waiverClaims.status,
          errorMessage: PublicSchema.waiverClaims.errorMessage,
          processedAt: PublicSchema.waiverClaims.processedAt,
          createdAt: PublicSchema.waiverClaims.createdAt,
          playerFirstName: PublicSchema.players.firstName,
          playerLastName: PublicSchema.players.lastName,
        })
        .from(PublicSchema.waiverClaims)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.waiverClaims.playerId, PublicSchema.players.id),
        )
        .where(
          and(
            eq(PublicSchema.waiverClaims.teamId, teamId),
            eq(PublicSchema.waiverClaims.status, statusFilter),
          ),
        )
        .orderBy(PublicSchema.waiverClaims.createdAt);

      // Resolve drop player names in a second pass
      const dropPlayerIds = claims
        .map((c) => c.dropPlayerId)
        .filter((id): id is number => id != null);

      let dropPlayerMap: Record<number, string> = {};
      if (dropPlayerIds.length > 0) {
        const dropPlayers = await db
          .select({
            id: PublicSchema.players.id,
            firstName: PublicSchema.players.firstName,
            lastName: PublicSchema.players.lastName,
          })
          .from(PublicSchema.players)
          .where(inArray(PublicSchema.players.id, dropPlayerIds));

        dropPlayerMap = Object.fromEntries(
          dropPlayers.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]),
        );
      }

      return claims.map((c) => {
        const { playerFirstName, playerLastName, ...claim } = c;
        return {
          ...claim,
          playerName: `${playerFirstName} ${playerLastName}`.trim(),
          dropPlayerName: c.dropPlayerId
            ? (dropPlayerMap[c.dropPlayerId] ?? null)
            : null,
        };
      });
    },
  }),
);
