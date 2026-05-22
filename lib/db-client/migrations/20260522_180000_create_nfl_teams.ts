import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create nfl_teams reference table + seed 32 franchises (LS-4156)
 *
 * Reference table mirroring the role of MLB team metadata for football. Drives
 * UI display (full name vs abbreviation), conference/division player pool
 * filtering, and team branding in player browse and roster views.
 *
 * The FK from players.nfl_team -> nfl_teams.abbreviation is added by LS-246
 * (which introduces the players.nfl_team column). This migration is decoupled
 * so it can land in parallel with LS-246.
 *
 * Seeds are idempotent via ON CONFLICT DO NOTHING.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."nfl_teams" (
      "abbreviation"    varchar(10) PRIMARY KEY,
      "full_name"       varchar(60) NOT NULL,
      "city"            varchar(40) NOT NULL,
      "conference"      varchar(3)  NOT NULL,
      "division"        varchar(10) NOT NULL,
      "primary_color"   varchar(7),
      "secondary_color" varchar(7),
      "created_at"      timestamptz NOT NULL DEFAULT now(),
      "updated_at"      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "nfl_teams_conference_check"
        CHECK ("conference" IN ('AFC', 'NFC')),
      CONSTRAINT "nfl_teams_division_check"
        CHECK ("division" IN ('North', 'South', 'East', 'West'))
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS "nfl_teams_conference_division_idx"
      ON "public"."nfl_teams" ("conference", "division");
  `);

  await db.execute(`
    INSERT INTO "public"."nfl_teams"
      ("abbreviation", "full_name", "city", "conference", "division", "primary_color", "secondary_color")
    VALUES
      -- AFC East
      ('BUF', 'Buffalo Bills',          'Buffalo',          'AFC', 'East',  '#00338D', '#C60C30'),
      ('MIA', 'Miami Dolphins',         'Miami',            'AFC', 'East',  '#008E97', '#FC4C02'),
      ('NE',  'New England Patriots',   'New England',      'AFC', 'East',  '#002244', '#C60C30'),
      ('NYJ', 'New York Jets',          'New York',         'AFC', 'East',  '#125740', '#000000'),
      -- AFC North
      ('BAL', 'Baltimore Ravens',       'Baltimore',        'AFC', 'North', '#241773', '#9E7C0C'),
      ('CIN', 'Cincinnati Bengals',     'Cincinnati',       'AFC', 'North', '#FB4F14', '#000000'),
      ('CLE', 'Cleveland Browns',       'Cleveland',        'AFC', 'North', '#311D00', '#FF3C00'),
      ('PIT', 'Pittsburgh Steelers',    'Pittsburgh',       'AFC', 'North', '#FFB612', '#101820'),
      -- AFC South
      ('HOU', 'Houston Texans',         'Houston',          'AFC', 'South', '#03202F', '#A71930'),
      ('IND', 'Indianapolis Colts',     'Indianapolis',     'AFC', 'South', '#002C5F', '#A2AAAD'),
      ('JAX', 'Jacksonville Jaguars',   'Jacksonville',     'AFC', 'South', '#101820', '#D7A22A'),
      ('TEN', 'Tennessee Titans',       'Tennessee',        'AFC', 'South', '#0C2340', '#4B92DB'),
      -- AFC West
      ('DEN', 'Denver Broncos',         'Denver',           'AFC', 'West',  '#FB4F14', '#002244'),
      ('KC',  'Kansas City Chiefs',     'Kansas City',      'AFC', 'West',  '#E31837', '#FFB81C'),
      ('LV',  'Las Vegas Raiders',      'Las Vegas',        'AFC', 'West',  '#000000', '#A5ACAF'),
      ('LAC', 'Los Angeles Chargers',   'Los Angeles',      'AFC', 'West',  '#0080C6', '#FFC20E'),
      -- NFC East
      ('DAL', 'Dallas Cowboys',         'Dallas',           'NFC', 'East',  '#003594', '#869397'),
      ('NYG', 'New York Giants',        'New York',         'NFC', 'East',  '#0B2265', '#A71930'),
      ('PHI', 'Philadelphia Eagles',    'Philadelphia',     'NFC', 'East',  '#004C54', '#A5ACAF'),
      ('WAS', 'Washington Commanders',  'Washington',       'NFC', 'East',  '#5A1414', '#FFB612'),
      -- NFC North
      ('CHI', 'Chicago Bears',          'Chicago',          'NFC', 'North', '#0B162A', '#C83803'),
      ('DET', 'Detroit Lions',          'Detroit',          'NFC', 'North', '#0076B6', '#B0B7BC'),
      ('GB',  'Green Bay Packers',      'Green Bay',        'NFC', 'North', '#203731', '#FFB612'),
      ('MIN', 'Minnesota Vikings',      'Minnesota',        'NFC', 'North', '#4F2683', '#FFC62F'),
      -- NFC South
      ('ATL', 'Atlanta Falcons',        'Atlanta',          'NFC', 'South', '#A71930', '#000000'),
      ('CAR', 'Carolina Panthers',      'Carolina',         'NFC', 'South', '#0085CA', '#101820'),
      ('NO',  'New Orleans Saints',     'New Orleans',      'NFC', 'South', '#D3BC8D', '#101820'),
      ('TB',  'Tampa Bay Buccaneers',   'Tampa Bay',        'NFC', 'South', '#D50A0A', '#FF7900'),
      -- NFC West
      ('ARI', 'Arizona Cardinals',      'Arizona',          'NFC', 'West',  '#97233F', '#000000'),
      ('LAR', 'Los Angeles Rams',       'Los Angeles',      'NFC', 'West',  '#003594', '#FFA300'),
      ('SEA', 'Seattle Seahawks',       'Seattle',          'NFC', 'West',  '#002244', '#69BE28'),
      ('SF',  'San Francisco 49ers',    'San Francisco',    'NFC', 'West',  '#AA0000', '#B3995D')
    ON CONFLICT ("abbreviation") DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS "public"."nfl_teams";`);
};
