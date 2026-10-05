/**
 * Auction draft — GraphQL types, queries, and mutations (LS-646)
 *
 * Covers live auction state, per-team budgets, and the two user-facing
 * mutations: nominatePlayer and placeBid.
 */
import type { PublicDb } from '@legacy-sports/db-client';
import { PublicSchema } from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import { and, eq, inArray } from 'drizzle-orm';
import { Team } from './types';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
} from '../graphql-errors';
import { builder } from '../builder';
import { requireLeagueId } from '../drafts/league-draft';
import { getParticipantIdForTeam } from '../drafts/participants';

type AuctionStateRow = typeof PublicSchema.auctionState.$inferSelect;

/**
 * League team ids for a set of seats. Auction rows reference the seat
 * (`participant_id`, LS-10073); the GraphQL types still expose the team.
 */
async function teamIdsBySeat(
  db: PublicDb,
  participantIds: number[],
): Promise<Map<number, number | null>> {
  if (participantIds.length === 0) return new Map();
  const seats = await db
    .select({
      id: PublicSchema.draftParticipants.id,
      teamId: PublicSchema.draftParticipants.teamId,
    })
    .from(PublicSchema.draftParticipants)
    .where(inArray(PublicSchema.draftParticipants.id, participantIds));
  return new Map(seats.map((seat) => [seat.id, seat.teamId]));
}

/** Shape an auction_state row for the AuctionState GraphQL type. */
async function toAuctionState(db: PublicDb, row: AuctionStateRow) {
  const seatIds = [
    row.nominatorParticipantId,
    row.currentBidderParticipantId,
  ].filter((id): id is number => id !== null);
  const teamIds = await teamIdsBySeat(db, seatIds);
  const teamOf = (participantId: number | null) =>
    participantId === null ? null : (teamIds.get(participantId) ?? null);
  return {
    draftId: row.draftId,
    nominatorTeamId: teamOf(row.nominatorParticipantId),
    nominatedPlayerId: row.nominatedPlayerId,
    currentBid: row.currentBid,
    currentBidderTeamId: teamOf(row.currentBidderParticipantId),
    nominationDeadline: row.nominationDeadline,
    bidDeadline: row.bidDeadline,
    nominationOrder: row.nominationOrder,
  };
}

// ── AuctionState type ─────────────────────────────────────────────────────

const AuctionState = builder.objectRef<{
  draftId: number;
  nominatorTeamId: number | null;
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
        if (parent.nominatorTeamId === null) {
          throw NotFoundError('Nominator team not found');
        }
        const team = await context.loaders.teams.load(parent.nominatorTeamId);
        if (!team) throw NotFoundError('Nominator team not found');
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
        if (!team) throw NotFoundError('Team not found');
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
      return toAuctionState(context.db, row);
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
      const leagueId = requireLeagueId(draftRow);

      const [leagueRow] = await context.db
        .select({
          maxRosterSize: PublicSchema.leagues.maxRosterSize,
          auctionMinBid: PublicSchema.leagues.auctionMinBid,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      const maxRosterSize = leagueRow?.maxRosterSize ?? 25;
      const minBid = leagueRow?.auctionMinBid ?? 1;

      const budgets = await context.db
        .select({
          draftId: PublicSchema.auctionBudgets.draftId,
          teamId: PublicSchema.draftParticipants.teamId,
          remainingBudget: PublicSchema.auctionBudgets.remainingBudget,
          playersWon: PublicSchema.auctionBudgets.playersWon,
        })
        .from(PublicSchema.auctionBudgets)
        .innerJoin(
          PublicSchema.draftParticipants,
          eq(
            PublicSchema.draftParticipants.id,
            PublicSchema.auctionBudgets.participantId,
          ),
        )
        .where(eq(PublicSchema.auctionBudgets.draftId, draftId));

      return budgets.flatMap((b) => {
        // A league auction seat always holds a team.
        if (b.teamId === null) return [];
        const unfilledSlots = Math.max(0, maxRosterSize - b.playersWon);
        const maxBid = Math.max(
          minBid,
          b.remainingBudget - Math.max(0, unfilledSlots - 1) * minBid,
        );
        return [
          {
            draftId: b.draftId,
            teamId: b.teamId,
            remainingBudget: b.remainingBudget,
            playersWon: b.playersWon,
            maxBid,
          },
        ];
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

      const callerParticipantId = membership?.teamId
        ? await getParticipantIdForTeam(context.db, draftId, membership.teamId)
        : null;
      if (
        callerParticipantId === null ||
        callerParticipantId !== state.nominatorParticipantId
      ) {
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
      if (!draftRow) {
        throw NotFoundError('Draft not found');
      }
      const leagueId = requireLeagueId(draftRow);

      const [leagueRow] = await context.db
        .select({ auctionMinBid: PublicSchema.leagues.auctionMinBid })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      const minBid = leagueRow?.auctionMinBid ?? 1;
      const BID_DEADLINE_SECONDS = 30;

      const bidDeadline = new Date(Date.now() + BID_DEADLINE_SECONDS * 1000);

      const [updated] = await context.db
        .update(PublicSchema.auctionState)
        .set({
          nominatedPlayerId: playerId,
          currentBid: minBid,
          currentBidderParticipantId: null,
          bidDeadline,
          nominationDeadline: null,
        })
        .where(eq(PublicSchema.auctionState.draftId, draftId))
        .returning();

      if (!updated) throw new Error('Failed to nominate player');

      LOGGER.info('Player nominated in auction draft', {
        draftId,
        playerId,
        nominatorParticipantId: state.nominatorParticipantId,
      });

      return toAuctionState(context.db, updated);
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
      if (!draftRow) {
        throw NotFoundError('Draft not found');
      }
      const leagueId = requireLeagueId(draftRow);

      const [membership] = await context.db
        .select({ teamId: PublicSchema.leagueMembers.teamId })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      const participantId = membership?.teamId
        ? await getParticipantIdForTeam(context.db, draftId, membership.teamId)
        : null;
      if (participantId === null) {
        throw ForbiddenError('You are not a participant in this draft');
      }

      const [budget] = await context.db
        .select()
        .from(PublicSchema.auctionBudgets)
        .where(
          and(
            eq(PublicSchema.auctionBudgets.draftId, draftId),
            eq(PublicSchema.auctionBudgets.participantId, participantId),
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
        .where(eq(PublicSchema.leagues.id, leagueId))
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
          currentBidderParticipantId: participantId,
          bidDeadline,
        })
        .where(eq(PublicSchema.auctionState.draftId, draftId))
        .returning();

      if (!updated) throw new Error('Failed to place bid');

      LOGGER.info('Bid placed in auction draft', {
        draftId,
        amount,
        participantId,
      });

      return toAuctionState(context.db, updated);
    },
  }),
);
