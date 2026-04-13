/**
 * Season Awards — GraphQL types, queries, and mutations.
 *
 * Allows commissioners to assign season-long fantasy awards (e.g. League MVP,
 * Cy Young, Gold Glove) to players on a per-league, per-season basis.  Awards
 * are stored in the `league_season_awards` table and reflect in-league fantasy
 * performance, NOT real MLB awards.
 */
import { LOGGER } from '@legacy-sports/logging';
import { PublicSchema } from '@legacy-sports/db-client';
import { and, count, eq, sql } from 'drizzle-orm';
import { builder } from './builder';
import { AuthenticationError, UserInputError } from './graphql-errors';
import {
  verifyCommissionerAccess,
  verifyLeagueMembership,
} from './authorization';

// ─── Award type constants ──────────────────────────────────────────────────────

/** All valid season award_type values. */
export const SEASON_AWARD_TYPES = [
  { key: 'mvp', label: 'Most Valuable Player' },
  { key: 'cy_young', label: 'Cy Young Award' },
  { key: 'rookie_of_the_year', label: 'Rookie of the Year' },
  { key: 'gold_glove', label: 'Gold Glove' },
  { key: 'silver_slugger', label: 'Silver Slugger' },
] as const;

export type SeasonAwardTypeKey = (typeof SEASON_AWARD_TYPES)[number]['key'];

const VALID_SEASON_AWARD_TYPES = new Set<string>(
  SEASON_AWARD_TYPES.map((a) => a.key),
);

// ─── GraphQL object type ───────────────────────────────────────────────────────

interface LeagueSeasonAwardShape {
  id: number;
  leagueId: number;
  season: number;
  playerId: number;
  playerFirstName: string;
  playerLastName: string;
  awardType: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const LeagueSeasonAwardRef =
  builder.objectRef<LeagueSeasonAwardShape>('LeagueSeasonAward');

LeagueSeasonAwardRef.implement({
  description:
    'A fantasy-league-specific seasonal award assigned by the commissioner to a player',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    season: t.exposeInt('season'),
    playerId: t.exposeInt('playerId'),
    playerFirstName: t.exposeString('playerFirstName'),
    playerLastName: t.exposeString('playerLastName'),
    awardType: t.exposeString('awardType', {
      description:
        'One of: mvp | cy_young | rookie_of_the_year | gold_glove | silver_slugger',
    }),
    notes: t.exposeString('notes', { nullable: true }),
    createdAt: t.string({ resolve: (a) => a.createdAt.toISOString() }),
    updatedAt: t.string({ resolve: (a) => a.updatedAt.toISOString() }),
  }),
});

// ─── Query ─────────────────────────────────────────────────────────────────────

builder.queryField('leagueSeasonAwards', (t) =>
  t.field({
    type: [LeagueSeasonAwardRef],
    description:
      'Return all season awards for a league, optionally filtered by season',
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: false }),
    },
    resolve: async (_root, { leagueId, season }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const conditions = [
        eq(PublicSchema.leagueSeasonAwards.leagueId, leagueId),
      ];
      if (season != null) {
        conditions.push(eq(PublicSchema.leagueSeasonAwards.season, season));
      }

      const rows = await context.db
        .select({
          id: PublicSchema.leagueSeasonAwards.id,
          leagueId: PublicSchema.leagueSeasonAwards.leagueId,
          season: PublicSchema.leagueSeasonAwards.season,
          playerId: PublicSchema.leagueSeasonAwards.playerId,
          awardType: PublicSchema.leagueSeasonAwards.awardType,
          notes: PublicSchema.leagueSeasonAwards.notes,
          createdAt: PublicSchema.leagueSeasonAwards.createdAt,
          updatedAt: PublicSchema.leagueSeasonAwards.updatedAt,
          playerFirstName: PublicSchema.players.firstName,
          playerLastName: PublicSchema.players.lastName,
        })
        .from(PublicSchema.leagueSeasonAwards)
        .innerJoin(
          PublicSchema.players,
          eq(PublicSchema.leagueSeasonAwards.playerId, PublicSchema.players.id),
        )
        .where(and(...conditions))
        .orderBy(
          PublicSchema.leagueSeasonAwards.season,
          PublicSchema.leagueSeasonAwards.awardType,
        );

      return rows.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }));
    },
  }),
);

// ─── Input types ───────────────────────────────────────────────────────────────

const UpsertLeagueSeasonAwardInput = builder.inputType(
  'UpsertLeagueSeasonAwardInput',
  {
    fields: (t) => ({
      leagueId: t.int({ required: true }),
      season: t.int({ required: true }),
      playerId: t.int({ required: true }),
      /** Must be one of the SEASON_AWARD_TYPES keys */
      awardType: t.string({ required: true }),
      notes: t.string({ required: false }),
    }),
  },
);

// ─── Mutations ────────────────────────────────────────────────────────────────

builder.mutationField('upsertLeagueSeasonAward', (t) =>
  t.field({
    type: LeagueSeasonAwardRef,
    description:
      'Create or update a season award for a player in a league. ' +
      'Commissioner / General Manager access required.',
    args: {
      input: t.arg({ type: UpsertLeagueSeasonAwardInput, required: true }),
    },
    resolve: async (_root, { input }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const { leagueId, season, playerId, awardType, notes } = input;

      // Validate award type
      if (!VALID_SEASON_AWARD_TYPES.has(awardType)) {
        throw new Error(
          `Invalid awardType "${awardType}". ` +
            `Allowed values: ${[...VALID_SEASON_AWARD_TYPES].join(', ')}`,
        );
      }

      // Verify commissioner / General Manager access
      await verifyCommissionerAccess(context.db, leagueId, context.user.id);

      const [row] = await context.db
        .insert(PublicSchema.leagueSeasonAwards)
        .values({ leagueId, season, playerId, awardType, notes: notes ?? null })
        .onConflictDoUpdate({
          target: [
            PublicSchema.leagueSeasonAwards.leagueId,
            PublicSchema.leagueSeasonAwards.season,
            PublicSchema.leagueSeasonAwards.awardType,
          ],
          set: {
            playerId,
            notes: notes ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Fetch player name for the response
      const [player] = await context.db
        .select({
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
        })
        .from(PublicSchema.players)
        .where(eq(PublicSchema.players.id, playerId))
        .limit(1);

      LOGGER.info('Upserted league season award', {
        leagueId,
        season,
        playerId,
        awardType,
        userId: context.user.id,
      });

      return {
        ...row,
        playerFirstName: player?.firstName ?? '',
        playerLastName: player?.lastName ?? '',
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      };
    },
  }),
);

builder.mutationField('deleteLeagueSeasonAward', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Remove a season award from a league. Commissioner / General Manager access required.',
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
      awardType: t.arg.string({ required: true }),
    },
    resolve: async (_root, { leagueId, season, awardType }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Verify commissioner / General Manager access
      await verifyCommissionerAccess(context.db, leagueId, context.user.id);

      await context.db
        .delete(PublicSchema.leagueSeasonAwards)
        .where(
          and(
            eq(PublicSchema.leagueSeasonAwards.leagueId, leagueId),
            eq(PublicSchema.leagueSeasonAwards.season, season),
            eq(PublicSchema.leagueSeasonAwards.awardType, awardType),
          ),
        );

      LOGGER.info('Deleted league season award', {
        leagueId,
        season,
        awardType,
        userId: context.user.id,
      });

      return true;
    },
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// Award Voting System (LS-3126)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Voting period type ───────────────────────────────────────────────────────

interface AwardVotingPeriodShape {
  id: number;
  leagueId: number;
  season: number;
  status: string;
  awardTypes: string[];
  openedAt: Date;
  closedAt: Date | null;
}

const AwardVotingPeriodRef =
  builder.objectRef<AwardVotingPeriodShape>('AwardVotingPeriod');

AwardVotingPeriodRef.implement({
  description: 'A voting period for season awards in a league',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    season: t.exposeInt('season'),
    status: t.exposeString('status', {
      description: '"open" or "closed"',
    }),
    awardTypes: t.exposeStringList('awardTypes', {
      description: 'Award type keys included in this vote',
    }),
    openedAt: t.string({ resolve: (p) => p.openedAt.toISOString() }),
    closedAt: t.string({
      nullable: true,
      resolve: (p) => (p.closedAt ? p.closedAt.toISOString() : null),
    }),
  }),
});

// ─── Vote result type (aggregated, anonymous) ─────────────────────────────────

interface AwardVoteResultShape {
  awardType: string;
  playerId: number;
  playerFirstName: string;
  playerLastName: string;
  voteCount: number;
}

const AwardVoteResultRef =
  builder.objectRef<AwardVoteResultShape>('AwardVoteResult');

AwardVoteResultRef.implement({
  description: 'Aggregated vote count for a player in an award category',
  fields: (t) => ({
    awardType: t.exposeString('awardType'),
    playerId: t.exposeInt('playerId'),
    playerFirstName: t.exposeString('playerFirstName'),
    playerLastName: t.exposeString('playerLastName'),
    voteCount: t.exposeInt('voteCount'),
  }),
});

// ─── My vote type (for current user to see/update their own votes) ────────────

interface MyAwardVoteShape {
  awardType: string;
  playerId: number;
  playerFirstName: string;
  playerLastName: string;
}

const MyAwardVoteRef = builder.objectRef<MyAwardVoteShape>('MyAwardVote');

MyAwardVoteRef.implement({
  description: "The current user's vote for a specific award type",
  fields: (t) => ({
    awardType: t.exposeString('awardType'),
    playerId: t.exposeInt('playerId'),
    playerFirstName: t.exposeString('playerFirstName'),
    playerLastName: t.exposeString('playerLastName'),
  }),
});

// ─── Voting queries ───────────────────────────────────────────────────────────

builder.queryField('awardVotingPeriod', (t) =>
  t.field({
    type: AwardVotingPeriodRef,
    nullable: true,
    description: 'Get the voting period for a league and season (if any)',
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId, season }, context) => {
      if (!context.user) throw AuthenticationError();
      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      const [row] = await context.db
        .select()
        .from(PublicSchema.leagueAwardVotingPeriods)
        .where(
          and(
            eq(PublicSchema.leagueAwardVotingPeriods.leagueId, leagueId),
            eq(PublicSchema.leagueAwardVotingPeriods.season, season),
          ),
        )
        .limit(1);

      if (!row) return null;

      return {
        ...row,
        awardTypes: row.awardTypes ?? [],
        openedAt: new Date(row.openedAt),
        closedAt: row.closedAt ? new Date(row.closedAt) : null,
      };
    },
  }),
);

builder.queryField('awardVoteResults', (t) =>
  t.field({
    type: [AwardVoteResultRef],
    description:
      'Aggregated vote results for a league season. No voter identity is exposed.',
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId, season }, context) => {
      if (!context.user) throw AuthenticationError();
      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      const rows = await context.db
        .select({
          awardType: PublicSchema.leagueSeasonAwardVotes.awardType,
          playerId: PublicSchema.leagueSeasonAwardVotes.playerId,
          playerFirstName: PublicSchema.players.firstName,
          playerLastName: PublicSchema.players.lastName,
          voteCount: count(PublicSchema.leagueSeasonAwardVotes.id),
        })
        .from(PublicSchema.leagueSeasonAwardVotes)
        .innerJoin(
          PublicSchema.players,
          eq(
            PublicSchema.leagueSeasonAwardVotes.playerId,
            PublicSchema.players.id,
          ),
        )
        .where(
          and(
            eq(PublicSchema.leagueSeasonAwardVotes.leagueId, leagueId),
            eq(PublicSchema.leagueSeasonAwardVotes.season, season),
          ),
        )
        .groupBy(
          PublicSchema.leagueSeasonAwardVotes.awardType,
          PublicSchema.leagueSeasonAwardVotes.playerId,
          PublicSchema.players.firstName,
          PublicSchema.players.lastName,
        )
        .orderBy(
          PublicSchema.leagueSeasonAwardVotes.awardType,
          sql`count(${PublicSchema.leagueSeasonAwardVotes.id}) DESC`,
        );

      return rows.map((r) => ({
        ...r,
        voteCount: Number(r.voteCount),
      }));
    },
  }),
);

builder.queryField('myAwardVotes', (t) =>
  t.field({
    type: [MyAwardVoteRef],
    description: "Get the current user's votes for a league season",
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId, season }, context) => {
      if (!context.user) throw AuthenticationError();
      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      const rows = await context.db
        .select({
          awardType: PublicSchema.leagueSeasonAwardVotes.awardType,
          playerId: PublicSchema.leagueSeasonAwardVotes.playerId,
          playerFirstName: PublicSchema.players.firstName,
          playerLastName: PublicSchema.players.lastName,
        })
        .from(PublicSchema.leagueSeasonAwardVotes)
        .innerJoin(
          PublicSchema.players,
          eq(
            PublicSchema.leagueSeasonAwardVotes.playerId,
            PublicSchema.players.id,
          ),
        )
        .where(
          and(
            eq(PublicSchema.leagueSeasonAwardVotes.leagueId, leagueId),
            eq(PublicSchema.leagueSeasonAwardVotes.season, season),
            eq(
              PublicSchema.leagueSeasonAwardVotes.voterUserId,
              context.user.id,
            ),
          ),
        );

      return rows;
    },
  }),
);

// ─── Voting mutations ─────────────────────────────────────────────────────────

builder.mutationField('openAwardVoting', (t) =>
  t.field({
    type: AwardVotingPeriodRef,
    description:
      'Open a voting period for season awards. Commissioner access required.',
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
      awardTypes: t.arg.stringList({ required: true }),
    },
    resolve: async (_root, { leagueId, season, awardTypes }, context) => {
      if (!context.user) throw AuthenticationError();
      await verifyCommissionerAccess(context.db, leagueId, context.user.id);

      // Deduplicate to prevent double-tallying when voting closes
      const uniqueAwardTypes = [...new Set(awardTypes)];

      // Validate award types
      for (const at of uniqueAwardTypes) {
        if (!VALID_SEASON_AWARD_TYPES.has(at)) {
          throw UserInputError(
            `Invalid awardType "${at}". ` +
              `Allowed values: ${[...VALID_SEASON_AWARD_TYPES].join(', ')}`,
          );
        }
      }

      if (uniqueAwardTypes.length === 0) {
        throw UserInputError(
          'At least one award type must be selected for voting',
        );
      }

      const [row] = await context.db
        .insert(PublicSchema.leagueAwardVotingPeriods)
        .values({
          leagueId,
          season,
          status: 'open',
          awardTypes: uniqueAwardTypes,
        })
        .onConflictDoUpdate({
          target: [
            PublicSchema.leagueAwardVotingPeriods.leagueId,
            PublicSchema.leagueAwardVotingPeriods.season,
          ],
          set: {
            status: 'open',
            awardTypes: uniqueAwardTypes,
            openedAt: new Date(),
            closedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning();

      LOGGER.info('Opened award voting period', {
        leagueId,
        season,
        awardTypes: uniqueAwardTypes,
        userId: context.user.id,
      });

      return {
        ...row,
        awardTypes: row.awardTypes ?? [],
        openedAt: new Date(row.openedAt),
        closedAt: null,
      };
    },
  }),
);

builder.mutationField('closeAwardVoting', (t) =>
  t.field({
    type: AwardVotingPeriodRef,
    description:
      'Close voting and tally results. Winners are stored in league_season_awards. Commissioner access required.',
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId, season }, context) => {
      if (!context.user) throw AuthenticationError();
      await verifyCommissionerAccess(context.db, leagueId, context.user.id);

      // Get the voting period
      const [period] = await context.db
        .select()
        .from(PublicSchema.leagueAwardVotingPeriods)
        .where(
          and(
            eq(PublicSchema.leagueAwardVotingPeriods.leagueId, leagueId),
            eq(PublicSchema.leagueAwardVotingPeriods.season, season),
          ),
        )
        .limit(1);

      if (!period) {
        throw UserInputError(
          'No voting period found for this league and season',
        );
      }
      if (period.status === 'closed') {
        throw UserInputError('Voting is already closed for this season');
      }

      const awardTypes = period.awardTypes ?? [];

      // Wrap tally + close in a transaction for atomicity
      const updated = await context.db.transaction(async (tx) => {
        // Close the period first (WHERE status='open' guards against concurrent
        // close requests and ensures castAwardVote rejects new votes immediately)
        const [row] = await tx
          .update(PublicSchema.leagueAwardVotingPeriods)
          .set({
            status: 'closed',
            closedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(PublicSchema.leagueAwardVotingPeriods.id, period.id),
              eq(PublicSchema.leagueAwardVotingPeriods.status, 'open'),
            ),
          )
          .returning();

        // Another request already closed the period — nothing left to do
        if (!row) return null;

        // Tally votes: for each award type, find the player with the most votes
        for (const awardType of awardTypes) {
          const [topVote] = await tx
            .select({
              playerId: PublicSchema.leagueSeasonAwardVotes.playerId,
              voteCount: count(PublicSchema.leagueSeasonAwardVotes.id),
            })
            .from(PublicSchema.leagueSeasonAwardVotes)
            .where(
              and(
                eq(PublicSchema.leagueSeasonAwardVotes.leagueId, leagueId),
                eq(PublicSchema.leagueSeasonAwardVotes.season, season),
                eq(PublicSchema.leagueSeasonAwardVotes.awardType, awardType),
              ),
            )
            .groupBy(PublicSchema.leagueSeasonAwardVotes.playerId)
            .orderBy(
              sql`count(${PublicSchema.leagueSeasonAwardVotes.id}) DESC`,
              PublicSchema.leagueSeasonAwardVotes.playerId,
            )
            .limit(1);

          if (topVote) {
            // Upsert the winner into league_season_awards
            await tx
              .insert(PublicSchema.leagueSeasonAwards)
              .values({
                leagueId,
                season,
                playerId: topVote.playerId,
                awardType,
                notes: `Elected by league vote (${Number(topVote.voteCount)} votes)`,
              })
              .onConflictDoUpdate({
                target: [
                  PublicSchema.leagueSeasonAwards.leagueId,
                  PublicSchema.leagueSeasonAwards.season,
                  PublicSchema.leagueSeasonAwards.awardType,
                ],
                set: {
                  playerId: topVote.playerId,
                  notes: `Elected by league vote (${Number(topVote.voteCount)} votes)`,
                  updatedAt: new Date(),
                },
              });
          }
        }

        return row;
      });

      if (!updated) {
        throw UserInputError('Voting is already closed for this season');
      }

      LOGGER.info('Closed award voting period and tallied results', {
        leagueId,
        season,
        userId: context.user.id,
      });

      return {
        ...updated,
        awardTypes: updated.awardTypes ?? [],
        openedAt: new Date(updated.openedAt),
        closedAt: updated.closedAt ? new Date(updated.closedAt) : null,
      };
    },
  }),
);

builder.mutationField('castAwardVote', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Cast or update a vote for a season award. League membership required. Voting must be open.',
    args: {
      leagueId: t.arg.int({ required: true }),
      season: t.arg.int({ required: true }),
      awardType: t.arg.string({ required: true }),
      playerId: t.arg.int({ required: true }),
    },
    resolve: async (
      _root,
      { leagueId, season, awardType, playerId },
      context,
    ) => {
      if (!context.user) throw AuthenticationError();
      await verifyLeagueMembership(context.db, leagueId, context.user.id);

      // Validate award type
      if (!VALID_SEASON_AWARD_TYPES.has(awardType)) {
        throw UserInputError(
          `Invalid awardType "${awardType}". ` +
            `Allowed values: ${[...VALID_SEASON_AWARD_TYPES].join(', ')}`,
        );
      }

      // Validate that the player exists
      const [player] = await context.db
        .select({ id: PublicSchema.players.id })
        .from(PublicSchema.players)
        .where(eq(PublicSchema.players.id, playerId))
        .limit(1);

      if (!player) {
        throw UserInputError(`Player with id ${playerId} does not exist`);
      }

      // Check voting is open
      const [period] = await context.db
        .select()
        .from(PublicSchema.leagueAwardVotingPeriods)
        .where(
          and(
            eq(PublicSchema.leagueAwardVotingPeriods.leagueId, leagueId),
            eq(PublicSchema.leagueAwardVotingPeriods.season, season),
          ),
        )
        .limit(1);

      if (!period || period.status !== 'open') {
        throw UserInputError('Voting is not currently open for this season');
      }

      // Check that this award type is included in the voting period
      const includedTypes = period.awardTypes ?? [];
      if (!includedTypes.includes(awardType)) {
        throw UserInputError(
          `Award type "${awardType}" is not included in this voting period`,
        );
      }

      // Upsert the vote (one per user per award type per season)
      await context.db
        .insert(PublicSchema.leagueSeasonAwardVotes)
        .values({
          leagueId,
          season,
          awardType,
          voterUserId: context.user.id,
          playerId,
        })
        .onConflictDoUpdate({
          target: [
            PublicSchema.leagueSeasonAwardVotes.leagueId,
            PublicSchema.leagueSeasonAwardVotes.season,
            PublicSchema.leagueSeasonAwardVotes.awardType,
            PublicSchema.leagueSeasonAwardVotes.voterUserId,
          ],
          set: {
            playerId,
            updatedAt: new Date(),
          },
        });

      LOGGER.info('Cast award vote', {
        leagueId,
        season,
        awardType,
        playerId,
        userId: context.user.id,
      });

      return true;
    },
  }),
);
