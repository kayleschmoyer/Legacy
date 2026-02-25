/**
 * Trades domain — Query resolvers
 *
 * Queries:
 *   leagueTradeOffers  — all offers for a league (commissioner view)
 *   teamTradeOffers    — incoming + outgoing offers for a specific team
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray, or } from 'drizzle-orm';

import { TradeOffer } from './types';
import { builder, type Context } from '../builder';

// ── helpers ────────────────────────────────────────────────────────────────

/** Hydrate team names and player legs onto a list of raw trade rows. */
async function hydrateTrades(
  rawTrades: Array<typeof PublicSchema.tradeOffers.$inferSelect>,
  context: Context,
) {
  if (rawTrades.length === 0) return [];

  const tradeIds = rawTrades.map((t) => t.id);
  const teamIds = [
    ...new Set(
      rawTrades.flatMap((t) => [t.proposingTeamId, t.receivingTeamId]),
    ),
  ];

  // Fetch team names
  const teamsResult = await context.db
    .select({
      id: PublicSchema.teams.id,
      name: PublicSchema.teams.name,
    })
    .from(PublicSchema.teams)
    .where(inArray(PublicSchema.teams.id, teamIds));

  const teamNameMap = Object.fromEntries(
    teamsResult.map((t: { id: number; name: string }) => [t.id, t.name]),
  );

  // Fetch trade players with player name lookup
  const rawPlayers = await context.db
    .select({
      id: PublicSchema.tradeOfferPlayers.id,
      tradeOfferId: PublicSchema.tradeOfferPlayers.tradeOfferId,
      playerId: PublicSchema.tradeOfferPlayers.playerId,
      fromTeamId: PublicSchema.tradeOfferPlayers.fromTeamId,
      firstName: PublicSchema.players.firstName,
      lastName: PublicSchema.players.lastName,
    })
    .from(PublicSchema.tradeOfferPlayers)
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.tradeOfferPlayers.playerId, PublicSchema.players.id),
    )
    .where(inArray(PublicSchema.tradeOfferPlayers.tradeOfferId, tradeIds));

  // Group players by trade offer id
  const playersByTrade: Record<
    number,
    Array<{
      id: number;
      tradeOfferId: number;
      playerId: number;
      fromTeamId: number;
      playerName: string;
      playerPosition: string | null;
    }>
  > = {};

  for (const p of rawPlayers) {
    if (!playersByTrade[p.tradeOfferId]) {
      playersByTrade[p.tradeOfferId] = [];
    }
    playersByTrade[p.tradeOfferId].push({
      id: p.id,
      tradeOfferId: p.tradeOfferId,
      playerId: p.playerId,
      fromTeamId: p.fromTeamId,
      playerName: `${p.firstName} ${p.lastName}`.trim(),
      playerPosition: null,
    });
  }

  return rawTrades.map((trade) => ({
    ...trade,
    proposingTeamName:
      (teamNameMap[trade.proposingTeamId] as string | undefined) ?? null,
    receivingTeamName:
      (teamNameMap[trade.receivingTeamId] as string | undefined) ?? null,
    players: playersByTrade[trade.id] ?? [],
  }));
}

// ── Query: leagueTradeOffers ───────────────────────────────────────────────

builder.queryField('leagueTradeOffers', (t) =>
  t.field({
    type: [TradeOffer],
    args: {
      leagueId: t.arg.int({ required: true }),
      status: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { leagueId } = args;
      const statusFilter = (args.status ?? null) as
        | 'pending'
        | 'accepted'
        | 'rejected'
        | 'cancelled'
        | 'vetoed'
        | 'expired'
        | null;

      const conditions = [
        eq(PublicSchema.tradeOffers.leagueId, leagueId),
        ...(statusFilter
          ? [eq(PublicSchema.tradeOffers.status, statusFilter)]
          : []),
      ];

      const rawTrades = await context.db
        .select()
        .from(PublicSchema.tradeOffers)
        .where(and(...conditions))
        .orderBy(PublicSchema.tradeOffers.createdAt);

      LOGGER.debug('leagueTradeOffers query', {
        leagueId,
        statusFilter,
        count: rawTrades.length,
      });

      return hydrateTrades(rawTrades, context);
    },
  }),
);

// ── Query: teamTradeOffers ─────────────────────────────────────────────────

builder.queryField('teamTradeOffers', (t) =>
  t.field({
    type: [TradeOffer],
    args: {
      teamId: t.arg.int({ required: true }),
      status: t.arg.string({ required: false }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      const { teamId } = args;
      const statusFilter = (args.status ?? null) as
        | 'pending'
        | 'accepted'
        | 'rejected'
        | 'cancelled'
        | 'vetoed'
        | 'expired'
        | null;

      const teamFilter = or(
        eq(PublicSchema.tradeOffers.proposingTeamId, teamId),
        eq(PublicSchema.tradeOffers.receivingTeamId, teamId),
      );
      const conditions = [
        ...(teamFilter ? [teamFilter] : []),
        ...(statusFilter
          ? [eq(PublicSchema.tradeOffers.status, statusFilter)]
          : []),
      ];

      const rawTrades = await context.db
        .select()
        .from(PublicSchema.tradeOffers)
        .where(and(...conditions))
        .orderBy(PublicSchema.tradeOffers.createdAt);

      LOGGER.debug('teamTradeOffers query', {
        teamId,
        statusFilter,
        count: rawTrades.length,
      });

      return hydrateTrades(rawTrades, context);
    },
  }),
);
