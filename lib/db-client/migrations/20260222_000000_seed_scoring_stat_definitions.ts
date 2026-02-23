import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Seed scoring_stat_definitions with default multipliers
 *
 * Populates the scoring_stat_definitions table with the standard fantasy
 * baseball scoring rules matching the DefaultScoring.ts constants.
 *
 * Without this data the compute_career_scores() SQL function returns 0 for
 * every player because all multipliers resolve to 0.
 *
 * The INSERT uses ON CONFLICT (stat_key) DO NOTHING so this migration is
 * safe to re-run against a database that was manually seeded.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    INSERT INTO public.scoring_stat_definitions
      (stat_key, stat_group, source_table, source_column, display_name, description,
       default_multiplier, min_multiplier, max_multiplier, step_size,
       is_required, enforce_positive, enforce_negative)
    VALUES
      -- Batting stats
      ('batting_hits',        'batting',  'season_batting', 'h',       'Hits',            'Singles, doubles, triples, or home runs',      1.000,  0.000, 10.000, 0.500, false, false, false),
      ('batting_doubles',     'batting',  'season_batting', 'doubles', 'Doubles',         'Extra-base hit: two bases',                    2.000,  0.000, 10.000, 0.500, false, false, false),
      ('batting_triples',     'batting',  'season_batting', 'triples', 'Triples',         'Extra-base hit: three bases',                  3.000,  0.000, 15.000, 0.500, false, false, false),
      ('batting_home_runs',   'batting',  'season_batting', 'hr',      'Home Runs',       'Over-the-fence hit scoring all bases',          4.000,  0.000, 20.000, 0.500, false, false, false),
      ('batting_runs',        'batting',  'season_batting', 'r',       'Runs Scored',     'Player crosses home plate',                     1.000,  0.000, 10.000, 0.500, false, false, false),
      ('batting_rbi',         'batting',  'season_batting', 'rbi',     'Runs Batted In',  'Runner scores because of this batter',          1.000,  0.000, 10.000, 0.500, false, false, false),
      ('batting_stolen_bases','batting',  'season_batting', 'sb',      'Stolen Bases',    'Runner advances a base without a hit',          2.000,  0.000, 10.000, 0.500, false, false, false),
      ('batting_caught_stealing','batting','season_batting','cs',      'Caught Stealing', 'Runner thrown out attempting to steal',         -1.000, -5.000,  0.000, 0.500, false, false, true),
      ('batting_hit_by_pitch','batting',  'season_batting', 'hbp',     'Hit By Pitch',    'Batter awarded first base after being hit',     1.000,  0.000, 10.000, 0.500, false, false, false),
      ('batting_strikeouts',  'batting',  'season_batting', 'so',      'Strikeouts',      'Batter records three strikes',                 -0.500, -5.000,  0.000, 0.500, false, false, true),

      -- Pitching stats
      ('pitching_wins',       'pitching', 'season_pitching', 'w',              'Wins',              'Pitcher of record for winning team',            5.000,  0.000, 20.000, 0.500, false, false, false),
      ('pitching_losses',     'pitching', 'season_pitching', 'l',              'Losses',            'Pitcher of record for losing team',            -2.000,-10.000,  0.000, 0.500, false, false, true),
      ('pitching_saves',      'pitching', 'season_pitching', 'sv',             'Saves',             'Closer preserves a lead of three runs or less', 5.000,  0.000, 20.000, 0.500, false, false, false),
      ('pitching_strikeouts', 'pitching', 'season_pitching', 'so',             'Strikeouts',        'Pitcher records three strikes on a batter',     1.000,  0.000, 10.000, 0.500, false, false, false),
      ('pitching_outs',       'pitching', 'season_pitching', 'outs_recorded',  'Outs Recorded',     'One third of an inning pitched',                1.000,  0.000, 10.000, 0.500, false, false, false),
      ('pitching_walks',      'pitching', 'season_pitching', 'bb',             'Walks Allowed',     'Batter awarded first base on four balls',      -1.000, -5.000,  0.000, 0.500, false, false, true),
      ('pitching_hits',       'pitching', 'season_pitching', 'h',              'Hits Allowed',      'Batter reaches base on a hit',                 -1.000, -5.000,  0.000, 0.500, false, false, true),
      ('pitching_earned_runs','pitching', 'season_pitching', 'er',             'Earned Runs',       'Runs scored without benefit of an error',       -2.000,-10.000,  0.000, 0.500, false, false, true),

      -- Fielding stats
      ('fielding_errors',     'fielding', 'season_fielding', 'e_def',          'Errors',            'Fielding mistake allowing runner to advance',  -1.000, -5.000,  0.000, 0.500, false, false, true)

    ON CONFLICT (stat_key) DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DELETE FROM public.scoring_stat_definitions
    WHERE stat_key IN (
      'batting_hits', 'batting_doubles', 'batting_triples', 'batting_home_runs',
      'batting_runs', 'batting_rbi', 'batting_stolen_bases', 'batting_caught_stealing',
      'batting_hit_by_pitch', 'batting_strikeouts',
      'pitching_wins', 'pitching_losses', 'pitching_saves', 'pitching_strikeouts',
      'pitching_outs', 'pitching_walks', 'pitching_hits', 'pitching_earned_runs',
      'fielding_errors'
    );
  `);
};
