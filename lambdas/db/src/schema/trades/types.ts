/**
 * Trades domain — GraphQL type definitions
 *
 * TradeOfferPlayer: one player leg of a trade
 * TradeOffer: a full trade proposal between two teams
 */
import { builder } from '../builder';

// ── TradeOfferPlayer type ─────────────────────────────────────────────────

export const TradeOfferPlayer = builder.objectRef<{
  id: number;
  tradeOfferId: number;
  playerId: number;
  fromTeamId: number;
  playerName?: string | null;
  playerPosition?: string | null;
  salary?: number | null;
}>('TradeOfferPlayer');

TradeOfferPlayer.implement({
  description: 'A single player leg of a trade offer',
  fields: (t) => ({
    id: t.exposeInt('id'),
    tradeOfferId: t.exposeInt('tradeOfferId'),
    playerId: t.exposeInt('playerId'),
    fromTeamId: t.exposeInt('fromTeamId'),
    playerName: t.string({
      nullable: true,
      resolve: (parent) => parent.playerName ?? null,
    }),
    playerPosition: t.string({
      nullable: true,
      resolve: (parent) => parent.playerPosition ?? null,
    }),
    salary: t.int({
      nullable: true,
      description:
        "This player's salary (dollars) in a salary-cap league — the " +
        'authoritative cap hit used when the trade is accepted. Null in ' +
        'leagues without a salary cap.',
      resolve: (parent) => parent.salary ?? null,
    }),
  }),
});

// ── TradeOfferVote type ───────────────────────────────────────────────────
// A league member's (non-participating team's) vote on an accepted trade
// during premium-league commissioner review (LS-6349).

export const TradeVoteChoice = builder.enumType('TradeVoteChoice', {
  values: ['approve', 'veto'] as const,
});

export const TradeOfferVote = builder.objectRef<{
  id: number;
  tradeOfferId: number;
  teamId: number;
  teamName?: string | null;
  vote: 'approve' | 'veto';
  createdAt: Date;
}>('TradeOfferVote');

TradeOfferVote.implement({
  description:
    "A league member team's vote (approve/veto) on an accepted trade",
  fields: (t) => ({
    id: t.exposeInt('id'),
    tradeOfferId: t.exposeInt('tradeOfferId'),
    teamId: t.exposeInt('teamId'),
    teamName: t.string({
      nullable: true,
      resolve: (parent) => parent.teamName ?? null,
    }),
    vote: t.exposeString('vote'),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
  }),
});

// ── TradeOffer type ───────────────────────────────────────────────────────

export const TradeOffer = builder.objectRef<{
  id: number;
  leagueId: number;
  proposingTeamId: number;
  receivingTeamId: number;
  status:
    | 'pending'
    | 'accepted'
    | 'rejected'
    | 'cancelled'
    | 'vetoed'
    | 'expired';
  message: string | null;
  expiresAt: Date | null;
  respondedAt: Date | null;
  vetoedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  proposingTeamName?: string | null;
  receivingTeamName?: string | null;
  players?: Array<{
    id: number;
    tradeOfferId: number;
    playerId: number;
    fromTeamId: number;
    playerName?: string | null;
    playerPosition?: string | null;
    salary?: number | null;
  }>;
  votes?: Array<{
    id: number;
    tradeOfferId: number;
    teamId: number;
    teamName?: string | null;
    vote: 'approve' | 'veto';
    createdAt: Date;
  }>;
  eligibleVoterCount?: number | null;
}>('TradeOffer');

TradeOffer.implement({
  description: 'A trade proposal between two teams in a fantasy league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    proposingTeamId: t.exposeInt('proposingTeamId'),
    receivingTeamId: t.exposeInt('receivingTeamId'),
    status: t.exposeString('status'),
    message: t.exposeString('message', { nullable: true }),
    proposingTeamName: t.string({
      nullable: true,
      resolve: (parent) => parent.proposingTeamName ?? null,
    }),
    receivingTeamName: t.string({
      nullable: true,
      resolve: (parent) => parent.receivingTeamName ?? null,
    }),
    players: t.field({
      type: [TradeOfferPlayer],
      nullable: true,
      resolve: (parent) => parent.players ?? null,
    }),
    expiresAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.expiresAt ? parent.expiresAt.toISOString() : null,
    }),
    respondedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.respondedAt ? parent.respondedAt.toISOString() : null,
    }),
    vetoedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.vetoedAt ? parent.vetoedAt.toISOString() : null,
    }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (parent) => parent.updatedAt.toISOString(),
    }),
    votes: t.field({
      type: [TradeOfferVote],
      nullable: true,
      description:
        'League-member votes cast on this trade during commissioner review (premium leagues).',
      resolve: (parent) => parent.votes ?? null,
    }),
    eligibleVoterCount: t.int({
      nullable: true,
      description:
        "The number of league teams eligible to vote on this trade (all teams except the trade's two participants). Null when the league does not support trade voting.",
      resolve: (parent) => parent.eligibleVoterCount ?? null,
    }),
  }),
});
