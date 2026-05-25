import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Seed scoring_stat_definitions for IDP (Individual Defensive Player) stats (LS-251)
 *
 * Inserts 9 IDP stat rows into scoring_stat_definitions. IDP stats use a separate
 * source table (game_football_defense_idp) and stat_group ('idp') from team DST
 * stats so the scoring editor can display them as a distinct section.
 *
 * Uses ON CONFLICT (stat_key) DO NOTHING so re-running is always safe.
 *
 * Depends on:
 *   LS-245  — scoring_stat_group enum includes 'idp'
 *   LS-4155 — game_football_defense_idp source table exists (source_table is a
 *              varchar reference, not a FK, so this migration can run before the
 *              table lands)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    INSERT INTO public.scoring_stat_definitions
      (stat_key, stat_group, source_table, source_column, display_name, description,
       default_multiplier, min_multiplier, max_multiplier, step_size,
       is_required, enforce_positive, enforce_negative)
    VALUES
      ('idp_solo_tkl', 'idp', 'game_football_defense_idp', 'solo_tkl', 'Solo Tackles',          'Unassisted tackle credited to one defender',    1.000, 0.000, 5.000, 0.500, false, false, false),
      ('idp_ast_tkl',  'idp', 'game_football_defense_idp', 'ast_tkl',  'Assisted Tackles',      'Tackle shared with another defender',           0.500, 0.000, 3.000, 0.500, false, false, false),
      ('idp_sack',     'idp', 'game_football_defense_idp', 'sacks',    'Sacks',                 'Quarterback brought down behind the line',      2.000, 0.000, 6.000, 0.500, false, false, false),
      ('idp_int',      'idp', 'game_football_defense_idp', 'int',      'Interceptions',         'Pass intercepted by this defender',             3.000, 0.000, 8.000, 0.500, false, false, false),
      ('idp_pd',       'idp', 'game_football_defense_idp', 'pd',       'Passes Defended',       'Pass broken up or batted away',                 1.000, 0.000, 4.000, 0.500, false, false, false),
      ('idp_ff',       'idp', 'game_football_defense_idp', 'ff',       'Forced Fumbles',        'Fumble caused by this defender',                2.000, 0.000, 6.000, 0.500, false, false, false),
      ('idp_fr',       'idp', 'game_football_defense_idp', 'fr',       'Fumbles Recovered',     'Fumble picked up by this defender',             2.000, 0.000, 6.000, 0.500, false, false, false),
      ('idp_def_td',   'idp', 'game_football_defense_idp', 'def_td',   'Defensive Touchdowns',  'Touchdown scored by this defender',             6.000, 0.000, 12.000, 0.500, false, false, false),
      ('idp_safety',   'idp', 'game_football_defense_idp', 'safeties', 'Safeties',              'Ball carrier tackled in own end zone',          2.000, 0.000, 6.000, 0.500, false, false, false)

    ON CONFLICT (stat_key) DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DELETE FROM public.scoring_stat_definitions
    WHERE stat_key IN (
      'idp_solo_tkl', 'idp_ast_tkl', 'idp_sack', 'idp_int', 'idp_pd',
      'idp_ff', 'idp_fr', 'idp_def_td', 'idp_safety'
    );
  `);
};
