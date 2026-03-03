/**
 * Achievement Restrictions — GraphQL types, queries, and mutations.
 *
 * Allows commissioners to configure roster restrictions based on career
 * achievements per league.  Each restriction is keyed (leagueId, achievementType)
 * and stored in the `league_achievement_restrictions` table.
 */
import { LOGGER } from '@legacy-sports/logging';
import { PublicSchema } from '@legacy-sports/db-client';
import { and, eq } from 'drizzle-orm';
import { builder } from './builder';
import { AuthenticationError, ForbiddenError } from './graphql-errors';

// ─── Achievement type constants ───────────────────────────────────────────────

/** All valid achievement_type values and whether they are repeatable. */
export const ACHIEVEMENT_TYPES = [
  {
    key: 'all_star_selections',
    label: 'All-Star Selections',
    repeatable: true,
  },
  { key: 'gold_gloves', label: 'Gold Gloves', repeatable: true },
  { key: 'silver_sluggers', label: 'Silver Sluggers', repeatable: true },
  { key: 'mvp_awards', label: 'MVP Awards', repeatable: true },
  { key: 'cy_young_awards', label: 'Cy Young Awards', repeatable: true },
  { key: 'world_series_rings', label: 'World Series Rings', repeatable: true },
  { key: 'hall_of_fame', label: 'Hall of Fame', repeatable: false },
  { key: 'rookie_of_the_year', label: 'Rookie of the Year', repeatable: false },
] as const;

export type AchievementTypeKey = (typeof ACHIEVEMENT_TYPES)[number]['key'];

const VALID_ACHIEVEMENT_TYPES = new Set<string>(
  ACHIEVEMENT_TYPES.map((a) => a.key),
);

// ─── GraphQL object type ───────────────────────────────────────────────────────

interface AchievementRestrictionShape {
  id: number;
  leagueId: number;
  achievementType: string;
  isRepeatable: boolean;
  playerMinCount: number | null;
  rosterMin: number | null;
  rosterMax: number | null;
  repeatableRosterMax: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const AchievementRestrictionRef =
  builder.objectRef<AchievementRestrictionShape>('AchievementRestriction');

AchievementRestrictionRef.implement({
  description:
    'A per-league rule that restricts rosters based on a career achievement type',
  fields: (t) => ({
    id: t.exposeInt('id'),
    leagueId: t.exposeInt('leagueId'),
    achievementType: t.exposeString('achievementType', {
      description:
        'One of: all_star_selections | gold_gloves | silver_sluggers | ' +
        'mvp_awards | cy_young_awards | world_series_rings | hall_of_fame | rookie_of_the_year',
    }),
    isRepeatable: t.exposeBoolean('isRepeatable', {
      description: 'Whether the achievement can be earned multiple times',
    }),
    playerMinCount: t.exposeInt('playerMinCount', {
      description:
        'Minimum count of the award a player must have to qualify (repeatable types only)',
      nullable: true,
    }),
    rosterMin: t.exposeInt('rosterMin', {
      description: 'Minimum number of qualifying players required on a roster',
      nullable: true,
    }),
    rosterMax: t.exposeInt('rosterMax', {
      description: 'Maximum number of qualifying players allowed on a roster',
      nullable: true,
    }),
    repeatableRosterMax: t.exposeInt('repeatableRosterMax', {
      description:
        'Cap on the total count of a repeatable award summed across the whole roster ' +
        '(e.g. no more than 25 All-Star selections total on one team)',
      nullable: true,
    }),
    createdAt: t.string({
      resolve: (p) => p.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      resolve: (p) => p.updatedAt.toISOString(),
    }),
  }),
});

// ─── Query ─────────────────────────────────────────────────────────────────────

builder.queryField('achievementRestrictions', (t) =>
  t.field({
    type: [AchievementRestrictionRef],
    description:
      'Return all achievement restrictions configured for a league, sorted by achievement type',
    args: {
      leagueId: t.arg.int({ required: true }),
    },
    resolve: async (_root, { leagueId }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const rows = await context.db
        .select()
        .from(PublicSchema.leagueAchievementRestrictions)
        .where(
          eq(PublicSchema.leagueAchievementRestrictions.leagueId, leagueId),
        )
        .orderBy(PublicSchema.leagueAchievementRestrictions.achievementType);

      return rows.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      }));
    },
  }),
);

// ─── Input types ───────────────────────────────────────────────────────────────

const UpsertAchievementRestrictionInput = builder.inputType(
  'UpsertAchievementRestrictionInput',
  {
    fields: (t) => ({
      leagueId: t.int({ required: true }),
      /** Must be one of the ACHIEVEMENT_TYPES keys */
      achievementType: t.string({ required: true }),
      /**
       * Minimum count the player must have to qualify.
       * Pass null to remove the constraint.
       * For boolean (non-repeatable) types this is always effectively 1.
       */
      playerMinCount: t.int({ required: false }),
      /** Minimum number of qualifying players required on a roster */
      rosterMin: t.int({ required: false }),
      /** Maximum number of qualifying players allowed on a roster */
      rosterMax: t.int({ required: false }),
      /**
       * Cap on the TOTAL count of a repeatable award across the whole roster.
       * Ignored for non-repeatable types.
       */
      repeatableRosterMax: t.int({ required: false }),
    }),
  },
);

// ─── Mutations ────────────────────────────────────────────────────────────────

builder.mutationField('upsertAchievementRestriction', (t) =>
  t.field({
    type: AchievementRestrictionRef,
    description:
      'Create or update a single achievement restriction for a league. ' +
      'Commissioner / General Manager access required.',
    args: {
      input: t.arg({ type: UpsertAchievementRestrictionInput, required: true }),
    },
    resolve: async (_root, { input }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      const {
        leagueId,
        achievementType,
        playerMinCount,
        rosterMin,
        rosterMax,
        repeatableRosterMax,
      } = input;

      // Validate achievement type
      if (!VALID_ACHIEVEMENT_TYPES.has(achievementType)) {
        throw new Error(
          `Invalid achievementType "${achievementType}". ` +
            `Allowed values: ${[...VALID_ACHIEVEMENT_TYPES].join(', ')}`,
        );
      }

      // Verify commissioner / General Manager access
      const [membership] = await context.db
        .select({ permissionLevel: PublicSchema.leagueMembers.permissionLevel })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (!membership) {
        throw ForbiddenError('You are not a member of this league');
      }

      // Derive isRepeatable from the known type catalogue
      const meta = ACHIEVEMENT_TYPES.find((a) => a.key === achievementType);
      const isRepeatable = meta?.repeatable ?? false;

      const insertValues = {
        leagueId,
        achievementType,
        isRepeatable,
        playerMinCount: playerMinCount ?? null,
        rosterMin: rosterMin ?? null,
        rosterMax: rosterMax ?? null,
        repeatableRosterMax: isRepeatable
          ? (repeatableRosterMax ?? null)
          : null,
      };

      const [row] = await context.db
        .insert(PublicSchema.leagueAchievementRestrictions)
        .values(insertValues)
        .onConflictDoUpdate({
          target: [
            PublicSchema.leagueAchievementRestrictions.leagueId,
            PublicSchema.leagueAchievementRestrictions.achievementType,
          ],
          set: {
            playerMinCount: insertValues.playerMinCount,
            rosterMin: insertValues.rosterMin,
            rosterMax: insertValues.rosterMax,
            repeatableRosterMax: insertValues.repeatableRosterMax,
            updatedAt: new Date(),
          },
        })
        .returning();

      LOGGER.info('Upserted achievement restriction', {
        leagueId,
        achievementType,
        userId: context.user.id,
      });

      return {
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      };
    },
  }),
);

builder.mutationField('deleteAchievementRestriction', (t) =>
  t.field({
    type: 'Boolean',
    description:
      'Remove an achievement restriction from a league. ' +
      'Commissioner / General Manager access required.',
    args: {
      leagueId: t.arg.int({ required: true }),
      achievementType: t.arg.string({ required: true }),
    },
    resolve: async (_root, { leagueId, achievementType }, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      // Verify access
      const [membership] = await context.db
        .select({ permissionLevel: PublicSchema.leagueMembers.permissionLevel })
        .from(PublicSchema.leagueMembers)
        .where(
          and(
            eq(PublicSchema.leagueMembers.leagueId, leagueId),
            eq(PublicSchema.leagueMembers.userId, context.user.id),
          ),
        )
        .limit(1);

      if (!membership) {
        throw ForbiddenError('You are not a member of this league');
      }

      await context.db
        .delete(PublicSchema.leagueAchievementRestrictions)
        .where(
          and(
            eq(PublicSchema.leagueAchievementRestrictions.leagueId, leagueId),
            eq(
              PublicSchema.leagueAchievementRestrictions.achievementType,
              achievementType,
            ),
          ),
        );

      LOGGER.info('Deleted achievement restriction', {
        leagueId,
        achievementType,
        userId: context.user.id,
      });

      return true;
    },
  }),
);
