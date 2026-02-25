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
  }>;
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
  }),
});
