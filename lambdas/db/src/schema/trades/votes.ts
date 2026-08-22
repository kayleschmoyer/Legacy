/**
 * Trades domain — league-member vote helpers (LS-6349)
 *
 * Shared by queries.ts (hydrateTrades) and mutations.ts (enrichTrade) so a
 * trade's votes and eligible-voter count are computed identically regardless
 * of whether it was fetched via a list query or returned from a mutation.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { count, eq, inArray } from 'drizzle-orm';

import type { Context } from '../builder';

export interface HydratedVote {
  id: number;
  tradeOfferId: number;
  teamId: number;
  teamName: string | null;
  vote: 'approve' | 'veto';
  createdAt: Date;
}

/**
 * Fetch votes + the eligible-voter count (all teams in the trade's league
 * except its two participants) for a batch of trades. Returns maps keyed by
 * trade offer id so callers can attach `votes` / `eligibleVoterCount` to
 * their hydrated trade objects.
 */
export async function fetchTradeVotesData(
  db: Context['db'],
  trades: Array<{
    id: number;
    leagueId: number;
    proposingTeamId: number;
    receivingTeamId: number;
  }>,
): Promise<{
  votesByTrade: Map<number, HydratedVote[]>;
  eligibleVoterCountByTrade: Map<number, number>;
}> {
  const votesByTrade = new Map<number, HydratedVote[]>();
  const eligibleVoterCountByTrade = new Map<number, number>();

  if (trades.length === 0) {
    return { votesByTrade, eligibleVoterCountByTrade };
  }

  const tradeIds = trades.map((t) => t.id);

  const rawVotes = await db
    .select({
      id: PublicSchema.tradeOfferVotes.id,
      tradeOfferId: PublicSchema.tradeOfferVotes.tradeOfferId,
      teamId: PublicSchema.tradeOfferVotes.teamId,
      teamName: PublicSchema.teams.name,
      vote: PublicSchema.tradeOfferVotes.vote,
      createdAt: PublicSchema.tradeOfferVotes.createdAt,
    })
    .from(PublicSchema.tradeOfferVotes)
    .innerJoin(
      PublicSchema.teams,
      eq(PublicSchema.tradeOfferVotes.teamId, PublicSchema.teams.id),
    )
    .where(inArray(PublicSchema.tradeOfferVotes.tradeOfferId, tradeIds));

  for (const v of rawVotes) {
    const list = votesByTrade.get(v.tradeOfferId) ?? [];
    list.push(v);
    votesByTrade.set(v.tradeOfferId, list);
  }

  // Eligible voters = teams in the trade's league excluding the two trade
  // participants. Fetch total team counts per distinct league in one batch
  // query, then subtract 2 (the trade's own two participants) per trade.
  const leagueIds = [...new Set(trades.map((t) => t.leagueId))];
  const teamCountRows = await db
    .select({
      leagueId: PublicSchema.teams.leagueId,
      total: count(),
    })
    .from(PublicSchema.teams)
    .where(inArray(PublicSchema.teams.leagueId, leagueIds))
    .groupBy(PublicSchema.teams.leagueId);

  const teamCountByLeague = new Map<number, number>(
    teamCountRows.map((r) => [r.leagueId, r.total]),
  );

  for (const trade of trades) {
    const totalTeams = teamCountByLeague.get(trade.leagueId) ?? 0;
    eligibleVoterCountByTrade.set(trade.id, Math.max(0, totalTeams - 2));
  }

  return { votesByTrade, eligibleVoterCountByTrade };
}
