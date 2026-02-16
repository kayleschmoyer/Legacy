import {
  pgTable,
  serial,
  varchar,
  integer,
  smallint,
  timestamp,
  boolean,
  numeric,
  index,
  uniqueIndex,
  foreignKey,
  bigserial,
  text,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { leagues } from './Leagues';
import {
  scoringStatGroup,
  scoringProfileStatus,
  scoringChangeAction,
} from './Enums';

export const scoringStatDefinitions = pgTable(
  'scoring_stat_definitions',
  {
    id: serial('id').primaryKey().notNull(),
    statKey: varchar('stat_key', { length: 64 }).notNull(),
    statGroup: scoringStatGroup('stat_group').notNull(),
    sourceTable: varchar('source_table', { length: 48 }).notNull(),
    sourceColumn: varchar('source_column', { length: 48 }).notNull(),
    displayName: varchar('display_name', { length: 80 }).notNull(),
    description: text('description'),
    defaultMultiplier: numeric('default_multiplier', {
      precision: 6,
      scale: 3,
    }).notNull(),
    minMultiplier: numeric('min_multiplier', {
      precision: 6,
      scale: 3,
    }).notNull(),
    maxMultiplier: numeric('max_multiplier', {
      precision: 6,
      scale: 3,
    }).notNull(),
    stepSize: numeric('step_size', { precision: 4, scale: 3 })
      .notNull()
      .default('0.5'),
    isRequired: boolean('is_required').notNull().default(false),
    enforcePositive: boolean('enforce_positive').notNull().default(false),
    enforceNegative: boolean('enforce_negative').notNull().default(false),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      statKeyUnique: uniqueIndex('scoring_stat_definitions_stat_key_unique').on(
        table.statKey,
      ),
      statGroupIdx: index('scoring_stat_definitions_group_idx').on(
        table.statGroup,
      ),
    };
  },
);

export const leagueScoringProfiles = pgTable(
  'league_scoring_profiles',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    profileName: varchar('profile_name', { length: 64 })
      .notNull()
      .default('Default'),
    seasonYear: smallint('season_year'),
    status: scoringProfileStatus('status').notNull().default('active'),
    isDefault: boolean('is_default').notNull().default(false),
    copiedFromProfileId: integer('copied_from_profile_id'),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    activatedAt: timestamp('activated_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (table) => {
    return {
      leagueForeignKey: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_scoring_profiles_league_fk',
      }),
      copiedFromForeignKey: foreignKey({
        columns: [table.copiedFromProfileId],
        foreignColumns: [table.id],
        name: 'league_scoring_profiles_copied_from_fk',
      }),
      leagueIdx: index('league_scoring_profiles_league_idx').on(table.leagueId),
      defaultUnique: uniqueIndex('league_scoring_profiles_unique_default')
        .on(table.leagueId)
        .where(sql`${table.isDefault} = true`),
      copiedFromProfileIdIdx: index(
        'league_scoring_profiles_copied_from_profile_id_idx',
      )
        .on(table.copiedFromProfileId)
        .where(sql`${table.copiedFromProfileId} IS NOT NULL`),
    };
  },
);

export const leagueScoringProfileEntries = pgTable(
  'league_scoring_profile_entries',
  {
    id: serial('id').primaryKey().notNull(),
    profileId: integer('profile_id').notNull(),
    statDefinitionId: integer('stat_definition_id').notNull(),
    multiplier: numeric('multiplier', { precision: 6, scale: 3 }).notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      profileForeignKey: foreignKey({
        columns: [table.profileId],
        foreignColumns: [leagueScoringProfiles.id],
        name: 'league_scoring_profile_entries_profile_fk',
      }),
      statDefinitionForeignKey: foreignKey({
        columns: [table.statDefinitionId],
        foreignColumns: [scoringStatDefinitions.id],
        name: 'league_scoring_profile_entries_stat_fk',
      }),
      profileStatUnique: uniqueIndex(
        'league_scoring_profile_entries_unique',
      ).on(table.profileId, table.statDefinitionId),
      profileIdIdx: index('league_scoring_profile_entries_profile_id_idx')
        .on(table.profileId)
        .where(sql`${table.isEnabled} = true`),
    };
  },
);

export const leagueScoringChangeLog = pgTable(
  'league_scoring_change_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey().notNull(),
    profileId: integer('profile_id').notNull(),
    statDefinitionId: integer('stat_definition_id').notNull(),
    previousMultiplier: numeric('previous_multiplier', {
      precision: 6,
      scale: 3,
    }),
    newMultiplier: numeric('new_multiplier', { precision: 6, scale: 3 }),
    changedBy: integer('changed_by'),
    changedAt: timestamp('changed_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    changeReason: varchar('change_reason', { length: 120 }),
    action: scoringChangeAction('action').notNull(),
  },
  (table) => {
    return {
      changeLogProfileForeignKey: foreignKey({
        columns: [table.profileId],
        foreignColumns: [leagueScoringProfiles.id],
        name: 'league_scoring_change_log_profile_fk',
      }),
      changeLogStatForeignKey: foreignKey({
        columns: [table.statDefinitionId],
        foreignColumns: [scoringStatDefinitions.id],
        name: 'league_scoring_change_log_stat_fk',
      }),
      profileIdx: index('league_scoring_change_log_profile_idx').on(
        table.profileId,
      ),
      statIdx: index('league_scoring_change_log_stat_idx').on(
        table.statDefinitionId,
      ),
      actionIdx: index('league_scoring_change_log_action_idx').on(table.action),
      profileIdChangedAtIdx: index(
        'league_scoring_change_log_profile_id_changed_at_idx',
      ).on(table.profileId, sql`${table.changedAt} DESC`),
    };
  },
);
