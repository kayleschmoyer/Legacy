/**
 * Auction draft — GraphQL types, queries, and mutations (LS-646)
 *
 * Covers live auction state, per-team budgets, and the two user-facing
 * mutations: nominatePlayer and placeBid.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq } from 'drizzle-orm';
import { Team } from './types';
import { AuthenticationError, ForbiddenError } from '../graphql-errors';
import { builder } from '../builder';

// ── AuctionState type ─────────────────────────────────────────────────────

const AuctionState = builder.objectRef<{
  draftId: number;
  nominatorTeamId: number;
  nominatedPlayerId: number | null;
  currentBid: number | null;
  currentBidderTeamId: number | null;
  nominationDeadline: Date | null;
  bidDeadline: Date | null;
  nominationOrder: number;
}>('AuctionState');

AuctionState.implement({
  description: 'Live state of an auction draft in progress',
  fields: (t) => ({
    draftId: t.exposeInt('draftId'),
    nominatorTeam: t.field({
      type: Team,
      resolve: async (parent, _args, context) => {
        const team = await context.loaders.teams.load(parent.nominatorTeamId);
        if (!team) throw new Error('Nominator team not found');
        return team;
      },
    }),
    nominatedPlayer: t.field({
      type: 'Player',
      nullable: true,
      resolve: async (parent, _args, context) => {
        if (!parent.nominatedPlayerId) return null;
        return context.loaders.players.load(parent.nominatedPlayerId);
      },
    }),
    currentBid: t.exposeInt('currentBid', { nullable: true }),
    currentBidder: t.field({
      type: Team,
      nullable: true,
      resolve: async (parent, _args, context) => {
        if (!parent.currentBidderTeamId) return null;
        return context.loaders.teams.load(parent.currentBidderTeamId);
      },
    }),
    nominationDeadline: t.string({
      nullable: true,
      resolve: (parent) => parent.nominationDeadline?.toISOString() ?? null,
    }),
    bidDeadline: t.string({
      nullable: true,
      resolve: (parent) => parent.bidDeadline?.toISOString() ?? null,
    }),
    nominationOrder: t.exposeInt('nominationOrder'),
  }),
});

// ── AuctionBudget type ────────────────────────────────────────────────────

const AuctionBudget = builder.objectRef<{
  draftId: number;
  teamId: number;
  remainingBudget: number;
  playersWon: number;
  /** Computed: remainingBudget - (unfilled_slots - 1) * min_bid */
  maxBid: number;
}>('AuctionBudget');

AuctionBudget.implement({
  description: 'Per-team budget tracking during an auction draft',
  fields: (t) => ({
    team: t.field({
      type: Team,
      resolve: async (parent, _args, context) => {
        const team = await context.loaders.teams.load(parent.teamId);
        if (!team) throw new Error('Team not found');
        return team;
      },
    }),
    remainingBudget: t.exposeInt('remainingBudget'),
    playersWon: t.exposeInt('playersWon'),
    maxBid: t.exposeInt('maxBid'),
  }),
});

// ── Queries ───────────────────────────────────────────────────────────────

/** Fetch live auction state for a draft in progress. */
builder.queryField('auctionState', (t) =>
  t.field({
    type: AuctionState,
    nullable: true,
    args: { draftId: t.arg.int({ required: true }) },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      const [row] = await context.db
        .select()
        .from(PublicSchema.auctionState)
        .where(eq(PublicSchema.auctionState.draftId, args.draftId))
        .limit(1);
      if (!row) return null;
      return {
        draftId: row.draftId,
        nominatorTeamId: row.nominatorTeamId,
        nominatedPlayerId: row.nominatedPlayerId,
        currentBid: row.currentBid,
        currentBidderTeamId: row.currentBidderTeamId,
        nominationDeadline: row.nominationDeadline,
        bidDeadline: row.bidDeadline,
        nominationOrder: row.nominationOrder,
      };
    },
  }),
);

/** Fetch budget tracker for all teams in an auction draft. */
builder.queryField('auctionBudgets', (t) =>
  t.field({
    type: [AuctionBudget],
    args: { draftId: t.arg.int({ required: true }) },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();

      const draftId = args.draftId;

      // Fetch league settings for maxBid calculation
      const [draftRow] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);
      if (!draftRow) return [];

      const [leagueRow] = await context.db
        .select({
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
          auctionMinBid: PublicSchema.leagues.auctionMinBid,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, draftRow.leagueId))
        .limit(1);

      const maxRosterSize = leagueRow?.maxRosterSize ?? 25;
      const minBid = leagueRow?.auctionMinBid ?? 1;

      const budgets = await context.db
        .select()
        .from(PublicSchema.auctionBudgets)
        .where(eq(PublicSchema.auctionBudgets.draftId, draftId));

      return budgets.map((b) => {
        const unfilledSlots = Math.max(0, maxRosterSize - b.playersWon);
        const maxBid = Math.max(
          minBid,
          b.remainingBudget - Math.max(0, unfilledSlots - 1) * minBid,
        );
        return {
          draftId: b.draftId,
          teamId: b.teamId,
          remainingBudget: b.remainingBudget,
          playersWon: b.playersWon,
          maxBid,
        };
      });
    },
  }),
);

// ── Mutations ─────────────────────────────────────────────────────────────

/** Nominate a player for auction bidding. Only the current nominator may call this. */
builder.mutationField('nominatePlayer', (t) =>
  t.field({
    type: AuctionState,
    args: {
      draftId: t.arg.int({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      const { draftId, playerId } = args;

      const [state] = await context.db
        .select()
        .from(PublicSchema.auctionState)
        .where(eq(PublicSchema.auctionState.draftId, draftId))
        .limit(1);
      if (!state) throw new Error('Auction is not in progress for this draft');

      // Verify caller owns the nominating team
      const [membership] = await context.db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .innerJoin(
          PublicSchema.drafts,
          eq(PublicSchema.drafts.leagueId, PublicSchema.leagueMembers.leagueId),
        )
        .where(
          and(
            eq(PublicSchema.drafts.id, draftId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (membership?.teamId !== state.nominatorTeamId) {
        throw ForbiddenError('It is not your turn to nominate');
      }

      if (state.nominatedPlayerId !== null) {
        throw new Error(
          'A player is already nominated — wait for bidding to finish',
        );
      }

      const [draftRow] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      const [leagueRow] = await context.db
        .select({ auctionMinBid: PublicSchema.leagues.auctionMinBid })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, draftRow.leagueId))
        .limit(1);

      const minBid = leagueRow?.auctionMinBid ?? 1;
      const BID_DEADLINE_SECONDS = 30;

      const bidDeadline = new Date(Date.now() + BID_DEADLINE_SECONDS * 1000);

      const [updated] = await context.db
        .update(PublicSchema.auctionState)
        .set({
          nominatedPlayerId: playerId,
          currentBid: minBid,
          currentBidderTeamId: null,
          bidDeadline,
          nominationDeadline: null,
        })
        .where(eq(PublicSchema.auctionState.draftId, draftId))
        .returning();

      if (!updated) throw new Error('Failed to nominate player');

      LOGGER.info('Player nominated in auction draft', {
        draftId,
        playerId,
        nominatorTeamId: state.nominatorTeamId,
      });

      return {
        draftId: updated.draftId,
        nominatorTeamId: updated.nominatorTeamId,
        nominatedPlayerId: updated.nominatedPlayerId,
        currentBid: updated.currentBid,
        currentBidderTeamId: updated.currentBidderTeamId,
        nominationDeadline: updated.nominationDeadline,
        bidDeadline: updated.bidDeadline,
        nominationOrder: updated.nominationOrder,
      };
    },
  }),
);

/** Place a bid on the currently nominated player. */
builder.mutationField('placeBid', (t) =>
  t.field({
    type: AuctionState,
    args: {
      draftId: t.arg.int({ required: true }),
      amount: t.arg.int({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      if (!context.user) throw AuthenticationError();
      const { draftId, amount } = args;

      const [state] = await context.db
        .select()
        .from(PublicSchema.auctionState)
        .where(eq(PublicSchema.auctionState.draftId, draftId))
        .limit(1);

      if (!state) throw new Error('Auction is not in progress for this draft');
      if (state.nominatedPlayerId === null)
        throw new Error('No player is currently nominated');
      if (!state.bidDeadline || state.bidDeadline < new Date())
        throw new Error('Bidding window has closed');

      if (amount <= (state.currentBid ?? 0)) {
        throw new Error(
          `Bid must exceed the current bid of $${state.currentBid ?? 0}`,
        );
      }

      // Verify caller is a team in this draft and get their budget
      const [draftRow] = await context.db
        .select({ leagueId: PublicSchema.drafts.leagueId })
        .from(PublicSchema.drafts)
        .where(eq(PublicSchema.drafts.id, draftId))
        .limit(1);

      const [membership] = await context.db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, draftRow.leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (!membership?.teamId) {
        throw ForbiddenError('You are not a participant in this draft');
      }

      const [budget] = await context.db
        .select()
        .from(PublicSchema.auctionBudgets)
        .where(
          and(
            eq(PublicSchema.auctionBudgets.draftId, draftId),
            eq(PublicSchema.auctionBudgets.teamId, membership.teamId),
          ),
        )
        .limit(1);

      if (!budget) throw new Error('Budget record not found for your team');

      const [leagueRow] = await context.db
        .select({
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
          auctionMinBid: PublicSchema.leagues.auctionMinBid,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, draftRow.leagueId))
        .limit(1);

      const maxRosterSize = leagueRow?.maxRosterSize ?? 25;
      const minBid = leagueRow?.auctionMinBid ?? 1;
      const unfilledSlots = Math.max(0, maxRosterSize - budget.playersWon);
      const maxBid = Math.max(
        minBid,
        budget.remainingBudget - Math.max(0, unfilledSlots - 1) * minBid,
      );

      if (amount > maxBid) {
        throw new Error(
          `Bid of $${amount} exceeds your maximum allowed bid of $${maxBid}`,
        );
      }

      // Reset bid timer on each new bid
      const BID_DEADLINE_SECONDS = 15;
      const bidDeadline = new Date(Date.now() + BID_DEADLINE_SECONDS * 1000);

      const [updated] = await context.db
        .update(PublicSchema.auctionState)
        .set({
          currentBid: amount,
          currentBidderTeamId: membership.teamId,
          bidDeadline,
        })
        .where(eq(PublicSchema.auctionState.draftId, draftId))
        .returning();

      if (!updated) throw new Error('Failed to place bid');

      LOGGER.info('Bid placed in auction draft', {
        draftId,
        amount,
        teamId: membership.teamId,
      });

      return {
        draftId: updated.draftId,
        nominatorTeamId: updated.nominatorTeamId,
        nominatedPlayerId: updated.nominatedPlayerId,
        currentBid: updated.currentBid,
        currentBidderTeamId: updated.currentBidderTeamId,
        nominationDeadline: updated.nominationDeadline,
        bidDeadline: updated.bidDeadline,
        nominationOrder: updated.nominationOrder,
      };
    },
  }),
);
