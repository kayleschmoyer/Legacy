/**
 * Draft slot trades domain — Query resolvers
 *
 * Queries:
 *   leagueDraftSlotTrades — all draft slot trades for a league (any status)
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { desc, eq } from 'drizzle-orm';

import { DraftSlotTrade } from './types';
import { builder } from '../builder';
import { AuthenticationError } from '../graphql-errors';
import { verifyLeagueMembership } from '../authorization';

builder.queryField('leagueDraftSlotTrades', (t) =>
  t.field({
    type: [DraftSlotTrade],
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId } = args;
      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      const rawTrades = await context.db
        .select()
        .from(PublicSchema.draftSlotTrades)
        .where(eq(PublicSchema.draftSlotTrades.leagueId, leagueId))
        .orderBy(desc(PublicSchema.draftSlotTrades.createdAt));

      if (rawTrades.length === 0) return [];

      const teams = await context.db
        .select({ id: PublicSchema.teams.id, name: PublicSchema.teams.name })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.leagueId, leagueId));
      const teamNameMap = new Map(teams.map((t) => [t.id, t.name]));

      return rawTrades.map((trade) => ({
        ...trade,
        proposerTeamName: teamNameMap.get(trade.proposerTeamId) ?? null,
        counterpartTeamName: teamNameMap.get(trade.counterpartTeamId) ?? null,
      }));
    },
  }),
);
