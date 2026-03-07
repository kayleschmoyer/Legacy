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
import { and, eq } from 'drizzle-orm';
import { builder } from './builder';
import { AuthenticationError } from './graphql-errors';
import { verifyCommissionerAccess } from './authorization';

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
