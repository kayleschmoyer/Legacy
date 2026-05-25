import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Seed scoring_stat_definitions for football offensive + DST stats (LS-251)
 *
 * Inserts 14 offensive rows (passing, rushing, receiving, kicking) and 12 DST rows
 * (5 flat defensive stats + 7 points-allowed bands) into scoring_stat_definitions.
 *
 * Uses ON CONFLICT (stat_key) DO NOTHING so re-running is always safe.
 *
 * Depends on:
 *   LS-245 — scoring_stat_group enum includes 'passing', 'rushing', 'receiving',
 *             'kicking', 'defense' values
 *   LS-248 — game_football_* source tables exist (source_table is a varchar
 *             reference, not a FK, so this migration can run before the tables land)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    INSERT INTO public.scoring_stat_definitions
      (stat_key, stat_group, source_table, source_column, display_name, description,
       default_multiplier, min_multiplier, max_multiplier, step_size,
       is_required, enforce_positive, enforce_negative)
    VALUES
      -- Passing stats
      ('passing_yds',    'passing', 'game_football_passing', 'yds',    'Passing Yards',         'Yards gained through the air',                  0.040,  0.000, 0.250, 0.010, false, false, false),
      ('passing_td',     'passing', 'game_football_passing', 'td',     'Passing Touchdowns',    'Touchdown passes thrown',                       4.000,  0.000, 12.000, 0.500, false, false, false),
      ('passing_int',    'passing', 'game_football_passing', 'int',    'Interceptions Thrown',  'Pass intercepted by the opposing defense',      -2.000, -5.000,  0.000, 0.500, false, false, true),
      ('passing_sacked', 'passing', 'game_football_passing', 'sacked', 'Times Sacked',          'Quarterback brought down behind the line',      -0.500, -2.000,  0.000, 0.500, false, false, true),

      -- Rushing stats
      ('rushing_yds',     'rushing', 'game_football_rushing', 'yds',     'Rushing Yards',         'Yards gained on the ground',                    0.100,  0.000, 0.500, 0.025, false, false, false),
      ('rushing_td',      'rushing', 'game_football_rushing', 'td',      'Rushing Touchdowns',    'Touchdown runs',                                6.000,  0.000, 12.000, 0.500, false, false, false),
      ('rushing_fumbles', 'rushing', 'game_football_rushing', 'fumbles', 'Rushing Fumbles Lost',  'Ball lost on a fumble while rushing',           -2.000, -5.000,  0.000, 0.500, false, false, true),

      -- Receiving stats (PPR defaults)
      ('receiving_rec',     'receiving', 'game_football_receiving', 'rec',     'Receptions',            'Pass caught (PPR: 1 pt per reception)',          1.000,  0.000,  3.000, 0.500, false, false, false),
      ('receiving_yds',     'receiving', 'game_football_receiving', 'yds',     'Receiving Yards',       'Yards gained on receptions',                    0.100,  0.000,  0.500, 0.025, false, false, false),
      ('receiving_td',      'receiving', 'game_football_receiving', 'td',      'Receiving Touchdowns',  'Touchdowns scored on receptions',               6.000,  0.000, 12.000, 0.500, false, false, false),
      ('receiving_fumbles', 'receiving', 'game_football_receiving', 'fumbles', 'Receiving Fumbles Lost','Ball lost on a fumble while receiving',         -2.000, -5.000,  0.000, 0.500, false, false, true),

      -- Kicking stats
      ('kicking_fgm',    'kicking', 'game_football_kicking', 'fgm',    'Field Goals Made',      'Successful field goal attempt',                 3.000,  0.000,  6.000, 0.500, false, false, false),
      ('kicking_fg_50m', 'kicking', 'game_football_kicking', 'fg_50m', 'FG Made 50+ Yards',     'Successful field goal from 50 yards or more',   5.000,  0.000, 10.000, 0.500, false, false, false),
      ('kicking_xpm',    'kicking', 'game_football_kicking', 'xpm',    'Extra Points Made',     'Successful extra-point kick after a touchdown',  1.000,  0.000,  2.000, 0.500, false, false, false),

      -- DST (team defense) flat stats
      ('defense_sacks',       'defense', 'game_football_defense', 'sacks',       'Sacks',                 'Quarterback brought down behind the line',       1.000,  0.000,  5.000, 0.500, false, false, false),
      ('defense_int',         'defense', 'game_football_defense', 'int',         'Interceptions',         'Pass intercepted by the defense',               2.000,  0.000,  6.000, 0.500, false, false, false),
      ('defense_fumbles_rec', 'defense', 'game_football_defense', 'fumbles_rec', 'Fumbles Recovered',     'Fumble recovered by the defense',               2.000,  0.000,  6.000, 0.500, false, false, false),
      ('defense_td',          'defense', 'game_football_defense', 'def_td',      'Defensive Touchdowns',  'Touchdown scored by the defense or on ST',      6.000,  0.000, 12.000, 0.500, false, false, false),
      ('defense_safeties',    'defense', 'game_football_defense', 'safeties',    'Safeties',              'Defense tackles ball carrier in own end zone',   2.000,  0.000,  6.000, 0.500, false, false, false),

      -- DST points-allowed bands (one row per scoring tier)
      ('defense_pts_band_0',     'defense', 'game_football_defense', 'pts_band_0',     'Points Allowed: Shutout',     'Defense allows 0 points (shutout)',               10.000, -10.000, 15.000, 1.000, false, false, false),
      ('defense_pts_band_1_6',   'defense', 'game_football_defense', 'pts_band_1_6',   'Points Allowed: 1–6',         'Defense allows 1–6 points',                        7.000, -10.000, 15.000, 1.000, false, false, false),
      ('defense_pts_band_7_13',  'defense', 'game_football_defense', 'pts_band_7_13',  'Points Allowed: 7–13',        'Defense allows 7–13 points',                       4.000, -10.000, 15.000, 1.000, false, false, false),
      ('defense_pts_band_14_17', 'defense', 'game_football_defense', 'pts_band_14_17', 'Points Allowed: 14–17',       'Defense allows 14–17 points',                      1.000, -10.000, 15.000, 1.000, false, false, false),
      ('defense_pts_band_18_27', 'defense', 'game_football_defense', 'pts_band_18_27', 'Points Allowed: 18–27',       'Defense allows 18–27 points',                      0.000, -10.000, 15.000, 1.000, false, false, false),
      ('defense_pts_band_28_34', 'defense', 'game_football_defense', 'pts_band_28_34', 'Points Allowed: 28–34',       'Defense allows 28–34 points',                     -1.000, -10.000, 15.000, 1.000, false, false, false),
      ('defense_pts_band_35plus','defense', 'game_football_defense', 'pts_band_35plus','Points Allowed: 35+',         'Defense allows 35 or more points',                -4.000, -10.000, 15.000, 1.000, false, false, false)

    ON CONFLICT (stat_key) DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DELETE FROM public.scoring_stat_definitions
    WHERE stat_key IN (
      'passing_yds', 'passing_td', 'passing_int', 'passing_sacked',
      'rushing_yds', 'rushing_td', 'rushing_fumbles',
      'receiving_rec', 'receiving_yds', 'receiving_td', 'receiving_fumbles',
      'kicking_fgm', 'kicking_fg_50m', 'kicking_xpm',
      'defense_sacks', 'defense_int', 'defense_fumbles_rec', 'defense_td', 'defense_safeties',
      'defense_pts_band_0', 'defense_pts_band_1_6', 'defense_pts_band_7_13',
      'defense_pts_band_14_17', 'defense_pts_band_18_27',
      'defense_pts_band_28_34', 'defense_pts_band_35plus'
    );
  `);
};
