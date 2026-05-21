/**
 * Sport-aware reference data — player pools and era windows per sport (LS-4633).
 *
 * Reads from the `sport_player_pools` and `sport_eras` tables seeded by
 * migration 20260521_000000. Queryable by sport so the UI can populate
 * pool / era selectors for baseball vs football without hard-coding the lists.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { asc, eq } from 'drizzle-orm';
import { builder } from './builder';
import { UserInputError } from './graphql-errors';

const SUPPORTED_SPORTS = ['baseball', 'football'] as const;
type SupportedSport = (typeof SUPPORTED_SPORTS)[number];

function assertSupportedSport(sport: string): SupportedSport {
  if (!(SUPPORTED_SPORTS as readonly string[]).includes(sport)) {
    throw UserInputError(
      `Unsupported sport: "${sport}". Supported values: ${SUPPORTED_SPORTS.join(', ')}.`,
    );
  }
  return sport as SupportedSport;
}

interface SportPlayerPoolShape {
  sport: string;
  key: string;
  label: string;
  sortOrder: number;
}

interface SportEraShape {
  sport: string;
  key: string;
  label: string;
  startYear: number | null;
  endYear: number | null;
  sortOrder: number;
}

const SportPlayerPoolRef =
  builder.objectRef<SportPlayerPoolShape>('SportPlayerPool');

SportPlayerPoolRef.implement({
  description:
    'A player pool option available for a given sport (e.g. AL/NL for baseball, AFC/NFC for football).',
  fields: (t) => ({
    sport: t.exposeString('sport', { nullable: false }),
    key: t.exposeString('key', { nullable: false }),
    label: t.exposeString('label', { nullable: false }),
    sortOrder: t.exposeInt('sortOrder', { nullable: false }),
  }),
});

const SportEraRef = builder.objectRef<SportEraShape>('SportEra');

SportEraRef.implement({
  description:
    'A historical era window for a sport. startYear/endYear may be null when unbounded.',
  fields: (t) => ({
    sport: t.exposeString('sport', { nullable: false }),
    key: t.exposeString('key', { nullable: false }),
    label: t.exposeString('label', { nullable: false }),
    startYear: t.exposeInt('startYear', { nullable: true }),
    endYear: t.exposeInt('endYear', { nullable: true }),
    sortOrder: t.exposeInt('sortOrder', { nullable: false }),
  }),
});

builder.queryField('sportPlayerPools', (t) =>
  t.field({
    type: [SportPlayerPoolRef],
    nullable: false,
    description:
      'List the available player pool keys for a sport (e.g. baseball, football).',
    args: {
      sport: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      const sport = assertSupportedSport(args.sport);
      const rows = await context.db
        .select({
          sport: PublicSchema.sportPlayerPools.sport,
          key: PublicSchema.sportPlayerPools.key,
          label: PublicSchema.sportPlayerPools.label,
          sortOrder: PublicSchema.sportPlayerPools.sortOrder,
        })
        .from(PublicSchema.sportPlayerPools)
        .where(eq(PublicSchema.sportPlayerPools.sport, sport))
        .orderBy(
          asc(PublicSchema.sportPlayerPools.sortOrder),
          asc(PublicSchema.sportPlayerPools.key),
        );
      return rows;
    },
  }),
);

builder.queryField('sportEras', (t) =>
  t.field({
    type: [SportEraRef],
    nullable: false,
    description:
      'List the available era windows for a sport with their start/end year ranges.',
    args: {
      sport: t.arg.string({ required: true }),
    },
    resolve: async (_parent, args, context) => {
      const sport = assertSupportedSport(args.sport);
      const rows = await context.db
        .select({
          sport: PublicSchema.sportEras.sport,
          key: PublicSchema.sportEras.key,
          label: PublicSchema.sportEras.label,
          startYear: PublicSchema.sportEras.startYear,
          endYear: PublicSchema.sportEras.endYear,
          sortOrder: PublicSchema.sportEras.sortOrder,
        })
        .from(PublicSchema.sportEras)
        .where(eq(PublicSchema.sportEras.sport, sport))
        .orderBy(
          asc(PublicSchema.sportEras.sortOrder),
          asc(PublicSchema.sportEras.key),
        );
      return rows;
    },
  }),
);
