/**
 * Waivers domain — GraphQL type definitions
 */
import { builder } from '../builder';

// ── WaiverClaim type ───────────────────────────────────────────────────────

export const WaiverClaim = builder.objectRef<{
  id: number;
  leagueId: number;
  teamId: number;
  userId: number;
  playerId: number;
  dropPlayerId: number | null;
  faabBid: number | null;
  status: string;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
  playerName?: string;
  dropPlayerName?: string | null;
}>('WaiverClaim');

WaiverClaim.implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    teamId: t.exposeInt('teamId'),
    userId: t.exposeInt('userId'),
    playerId: t.exposeInt('playerId'),
    dropPlayerId: t.exposeInt('dropPlayerId', { nullable: true }),
    faabBid: t.exposeInt('faabBid', { nullable: true }),
    status: t.exposeString('status'),
    errorMessage: t.exposeString('errorMessage', { nullable: true }),
    playerName: t.string({
      nullable: true,
      resolve: (parent) => parent.playerName ?? null,
    }),
    dropPlayerName: t.string({
      nullable: true,
      resolve: (parent) => parent.dropPlayerName ?? null,
    }),
    processedAt: t.string({
      nullable: true,
      resolve: (parent) =>
        parent.processedAt ? parent.processedAt.toISOString() : null,
    }),
    createdAt: t.string({
      resolve: (parent) => parent.createdAt.toISOString(),
    }),
  }),
});

// ── ProcessWaiverClaimsResult type ─────────────────────────────────────────

export const ProcessWaiverClaimsResult = builder.objectRef<{
  processed: number;
  succeeded: number;
  failed: number;
}>('ProcessWaiverClaimsResult');

ProcessWaiverClaimsResult.implement({
  fields: (t) => ({
    processed: t.exposeInt('processed'),
    succeeded: t.exposeInt('succeeded'),
    failed: t.exposeInt('failed'),
  }),
});
