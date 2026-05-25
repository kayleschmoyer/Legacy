import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Seed 32 synthetic DST players (one per NFL team) (LS-251)
 *
 * Each row represents a team defense/special-teams unit. Synthetic DST players
 * allow the roster/draft/waiver system — which operates entirely on player_id FK
 * references — to treat DST as a draftable position without schema changes.
 *
 * bref_id uses the 'dst_' prefix + team abbreviation (e.g. 'dst_KC'). All values
 * fit within the varchar(10) limit. ON CONFLICT (bref_id) DO NOTHING ensures
 * idempotency.
 *
 * first_name = team city, last_name = team nickname.
 *
 * Depends on:
 *   LS-246  — players.sport, players.is_dst, players.nfl_team columns exist
 *   LS-4156 — nfl_teams table is seeded so the FK fk_players_nfl_team is satisfiable
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    INSERT INTO public.players
      (first_name, last_name, bref_id, sport, is_dst, nfl_team)
    VALUES
      -- AFC East
      ('Buffalo',        'Bills',       'dst_BUF', 'football', true, 'BUF'),
      ('Miami',          'Dolphins',    'dst_MIA', 'football', true, 'MIA'),
      ('New England',    'Patriots',    'dst_NE',  'football', true, 'NE'),
      ('New York',       'Jets',        'dst_NYJ', 'football', true, 'NYJ'),
      -- AFC North
      ('Baltimore',      'Ravens',      'dst_BAL', 'football', true, 'BAL'),
      ('Cincinnati',     'Bengals',     'dst_CIN', 'football', true, 'CIN'),
      ('Cleveland',      'Browns',      'dst_CLE', 'football', true, 'CLE'),
      ('Pittsburgh',     'Steelers',    'dst_PIT', 'football', true, 'PIT'),
      -- AFC South
      ('Houston',        'Texans',      'dst_HOU', 'football', true, 'HOU'),
      ('Indianapolis',   'Colts',       'dst_IND', 'football', true, 'IND'),
      ('Jacksonville',   'Jaguars',     'dst_JAX', 'football', true, 'JAX'),
      ('Tennessee',      'Titans',      'dst_TEN', 'football', true, 'TEN'),
      -- AFC West
      ('Denver',         'Broncos',     'dst_DEN', 'football', true, 'DEN'),
      ('Kansas City',    'Chiefs',      'dst_KC',  'football', true, 'KC'),
      ('Las Vegas',      'Raiders',     'dst_LV',  'football', true, 'LV'),
      ('Los Angeles',    'Chargers',    'dst_LAC', 'football', true, 'LAC'),
      -- NFC East
      ('Dallas',         'Cowboys',     'dst_DAL', 'football', true, 'DAL'),
      ('New York',       'Giants',      'dst_NYG', 'football', true, 'NYG'),
      ('Philadelphia',   'Eagles',      'dst_PHI', 'football', true, 'PHI'),
      ('Washington',     'Commanders',  'dst_WAS', 'football', true, 'WAS'),
      -- NFC North
      ('Chicago',        'Bears',       'dst_CHI', 'football', true, 'CHI'),
      ('Detroit',        'Lions',       'dst_DET', 'football', true, 'DET'),
      ('Green Bay',      'Packers',     'dst_GB',  'football', true, 'GB'),
      ('Minnesota',      'Vikings',     'dst_MIN', 'football', true, 'MIN'),
      -- NFC South
      ('Atlanta',        'Falcons',     'dst_ATL', 'football', true, 'ATL'),
      ('Carolina',       'Panthers',    'dst_CAR', 'football', true, 'CAR'),
      ('New Orleans',    'Saints',      'dst_NO',  'football', true, 'NO'),
      ('Tampa Bay',      'Buccaneers',  'dst_TB',  'football', true, 'TB'),
      -- NFC West
      ('Arizona',        'Cardinals',   'dst_ARI', 'football', true, 'ARI'),
      ('Los Angeles',    'Rams',        'dst_LAR', 'football', true, 'LAR'),
      ('Seattle',        'Seahawks',    'dst_SEA', 'football', true, 'SEA'),
      ('San Francisco',  '49ers',       'dst_SF',  'football', true, 'SF')

    ON CONFLICT (bref_id) DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    DELETE FROM public.players
    WHERE bref_id IN (
      'dst_BUF', 'dst_MIA', 'dst_NE',  'dst_NYJ',
      'dst_BAL', 'dst_CIN', 'dst_CLE', 'dst_PIT',
      'dst_HOU', 'dst_IND', 'dst_JAX', 'dst_TEN',
      'dst_DEN', 'dst_KC',  'dst_LV',  'dst_LAC',
      'dst_DAL', 'dst_NYG', 'dst_PHI', 'dst_WAS',
      'dst_CHI', 'dst_DET', 'dst_GB',  'dst_MIN',
      'dst_ATL', 'dst_CAR', 'dst_NO',  'dst_TB',
      'dst_ARI', 'dst_LAR', 'dst_SEA', 'dst_SF'
    );
  `);
};
