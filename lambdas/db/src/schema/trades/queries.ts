/**
 * Trades domain — Query resolvers
 *
 * Queries:
 *   leagueTradeOffers  — all offers for a league (commissioner view)
 *   teamTradeOffers    — incoming + outgoing offers for a specific team
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, desc, eq, inArray, or } from 'drizzle-orm';

import { TradeOffer } from './types';
import { requireAuth, verifyLeagueMembership } from '../authorization';
import { builder, type Context } from '../builder';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';
import { fetchTradeDisplaySalaries } from '../../services/cap-service';

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

  // Fetch trade players — include snapshot playerName and fallback JOIN columns
  const rawPlayers = await context.db
    .select({
      id: PublicSchema.tradeOfferPlayers.id,
      tradeOfferId: PublicSchema.tradeOfferPlayers.tradeOfferId,
      playerId: PublicSchema.tradeOfferPlayers.playerId,
      fromTeamId: PublicSchema.tradeOfferPlayers.fromTeamId,
      playerName: PublicSchema.tradeOfferPlayers.playerName,
      firstName: PublicSchema.players.firstName,
      lastName: PublicSchema.players.lastName,
    })
    .from(PublicSchema.tradeOfferPlayers)
    .innerJoin(
      PublicSchema.players,
      eq(PublicSchema.tradeOfferPlayers.playerId, PublicSchema.players.id),
    )
    .where(inArray(PublicSchema.tradeOfferPlayers.tradeOfferId, tradeIds));

  // Resolve per-player cap-hit salaries per league so a salary-cap preview can
  // be rendered on the trade card (LS-5971). Trades in a single hydrate share a
  // league in practice, but group by league defensively. `tradeLeagueId` maps
  // each trade to its league so the correct salary map is consulted below.
  const tradeLeagueId = new Map<number, number>(
    rawTrades.map((t) => [t.id, t.leagueId]),
  );
  const playerIdsByLeague = new Map<number, Set<number>>();
  for (const p of rawPlayers) {
    const leagueId = tradeLeagueId.get(p.tradeOfferId);
    if (leagueId == null) continue;
    const set = playerIdsByLeague.get(leagueId) ?? new Set<number>();
    set.add(p.playerId);
    playerIdsByLeague.set(leagueId, set);
  }
  const salaryByLeague = new Map<number, Map<number, number>>();
  for (const [leagueId, ids] of playerIdsByLeague) {
    salaryByLeague.set(
      leagueId,
      await fetchTradeDisplaySalaries(context.db, leagueId, [...ids]),
    );
  }

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
      salary: number | null;
    }>
  > = {};

  for (const p of rawPlayers) {
    if (!playersByTrade[p.tradeOfferId]) {
      playersByTrade[p.tradeOfferId] = [];
    }
    const leagueId = tradeLeagueId.get(p.tradeOfferId);
    const salary =
      leagueId != null
        ? (salaryByLeague.get(leagueId)?.get(p.playerId) ?? null)
        : null;
    playersByTrade[p.tradeOfferId].push({
      id: p.id,
      tradeOfferId: p.tradeOfferId,
      playerId: p.playerId,
      fromTeamId: p.fromTeamId,
      // Use snapshot captured at proposal time; fall back to current name for
      // older rows that predate this column.
      playerName: p.playerName ?? `${p.firstName} ${p.lastName}`.trim(),
      playerPosition: null,
      salary,
    });
  }

  return rawTrades.map((trade) => ({
    ...trade,
    // Use snapshot captured at proposal time; fall back to current team name
    // for older rows that predate these columns.
    proposingTeamName:
      trade.proposingTeamName ??
      (teamNameMap[trade.proposingTeamId] as string | undefined) ??
      null,
    receivingTeamName:
      trade.receivingTeamName ??
      (teamNameMap[trade.receivingTeamId] as string | undefined) ??
      null,
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
      limit: t.arg.int({ required: false, defaultValue: 50 }),
      offset: t.arg.int({ required: false, defaultValue: 0 }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId } = args;

      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      const statusFilter = (args.status ?? null) as
        | 'pending'
        | 'accepted'
        | 'rejected'
        | 'cancelled'
        | 'vetoed'
        | 'expired'
        | null;
      const limit = Math.min(args.limit ?? 50, 100);
      const offset = args.offset ?? 0;

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
        .orderBy(desc(PublicSchema.tradeOffers.createdAt))
        .limit(limit)
        .offset(offset);

      LOGGER.debug('leagueTradeOffers query', {
        leagueId,
        statusFilter,
        limit,
        offset,
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
      limit: t.arg.int({ required: false, defaultValue: 50 }),
      offset: t.arg.int({ required: false, defaultValue: 0 }),
    },
    resolve: async (_parent, args, context) => {
      const user = requireAuth(context);

      const { teamId } = args;

      // Look up the team to find its league, then verify the caller is a
      // member of that league. Without this check any authenticated user can
      // enumerate trade offers for any team across any league.
      const [team] = await context.db
        .select({ leagueId: PublicSchema.teams.leagueId })
        .from(PublicSchema.teams)
        .where(eq(PublicSchema.teams.id, teamId))
        .limit(1);

      if (!team) {
        throw ForbiddenError('Team not found or access denied');
      }

      await verifyLeagueMembership(context.db, team.leagueId, user.id);

      const statusFilter = (args.status ?? null) as
        | 'pending'
        | 'accepted'
        | 'rejected'
        | 'cancelled'
        | 'vetoed'
        | 'expired'
        | null;
      const limit = Math.min(args.limit ?? 50, 100);
      const offset = args.offset ?? 0;

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
        .orderBy(desc(PublicSchema.tradeOffers.createdAt))
        .limit(limit)
        .offset(offset);

      LOGGER.debug('teamTradeOffers query', {
        teamId,
        statusFilter,
        limit,
        offset,
        count: rawTrades.length,
      });

      return hydrateTrades(rawTrades, context);
    },
  }),
);
