import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Create mlb_teams reference table + seed 30 franchises (LS-8597)
 *
 * MLB-side counterpart to nfl_teams (LS-4156). Drives display name/colors for
 * the team-affiliation chip on baseball player rows (RosterBoard).
 *
 * The FK from players.mlb_team -> mlb_teams.abbreviation is added by the
 * companion migration 20260727_120100_add_mlb_team_to_players, decoupled the
 * same way nfl_team/nfl_teams was split across two migrations.
 *
 * Seeds are idempotent via ON CONFLICT DO NOTHING.
 *
 * Plain db.execute() string (not Drizzle's insert().values()) is the
 * documented convention for migrations — see
 * .agents/skills/database/references/migrations.md "SQL calls" — since
 * migration SQL is developer-written DDL/seed data with no external input,
 * so parameterization isn't protecting against anything here. Mirrors the
 * nfl_teams seed migration (20260522_180000_create_nfl_teams).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "public"."mlb_teams" (
      "abbreviation"    varchar(3) PRIMARY KEY,
      "full_name"       varchar(60) NOT NULL,
      "city"            varchar(40) NOT NULL,
      "primary_color"   varchar(7),
      "secondary_color" varchar(7),
      "created_at"      timestamptz NOT NULL DEFAULT now(),
      "updated_at"      timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(`
    INSERT INTO "public"."mlb_teams"
      ("abbreviation", "full_name", "city", "primary_color", "secondary_color")
    VALUES
      -- AL East
      ('BAL', 'Baltimore Orioles',      'Baltimore',     '#DF4601', '#000000'),
      ('BOS', 'Boston Red Sox',         'Boston',        '#BD3039', '#0C2340'),
      ('NYY', 'New York Yankees',       'New York',      '#0C2340', '#C4CED3'),
      ('TB',  'Tampa Bay Rays',         'St. Petersburg','#092C5C', '#8FBCE6'),
      ('TOR', 'Toronto Blue Jays',      'Toronto',       '#134A8E', '#1D2D5C'),
      -- AL Central
      ('CWS', 'Chicago White Sox',      'Chicago',       '#27251F', '#C4CED4'),
      ('CLE', 'Cleveland Guardians',    'Cleveland',     '#00385D', '#E50022'),
      ('DET', 'Detroit Tigers',         'Detroit',       '#0C2340', '#FA4616'),
      ('KC',  'Kansas City Royals',     'Kansas City',   '#004687', '#BD9B60'),
      ('MIN', 'Minnesota Twins',        'Minneapolis',   '#002B5C', '#D31145'),
      -- AL West
      ('HOU', 'Houston Astros',         'Houston',       '#002D62', '#EB6E1F'),
      ('LAA', 'Los Angeles Angels',     'Los Angeles',   '#BA0021', '#003263'),
      ('OAK', 'Athletics',              'Oakland',       '#003831', '#EFB21E'),
      ('SEA', 'Seattle Mariners',       'Seattle',       '#0C2C56', '#005C5C'),
      ('TEX', 'Texas Rangers',          'Arlington',     '#003278', '#C0111F'),
      -- NL East
      ('ATL', 'Atlanta Braves',         'Atlanta',       '#CE1141', '#13274F'),
      ('MIA', 'Miami Marlins',          'Miami',         '#00A3E0', '#EF3340'),
      ('NYM', 'New York Mets',          'New York',      '#002D72', '#FF5910'),
      ('PHI', 'Philadelphia Phillies',  'Philadelphia',  '#E81828', '#002D72'),
      ('WSH', 'Washington Nationals',   'Washington',    '#AB0003', '#14225A'),
      -- NL Central
      ('CHC', 'Chicago Cubs',           'Chicago',       '#0E3386', '#CC3433'),
      ('CIN', 'Cincinnati Reds',        'Cincinnati',    '#C6011F', '#000000'),
      ('MIL', 'Milwaukee Brewers',      'Milwaukee',     '#0A2351', '#B6922E'),
      ('PIT', 'Pittsburgh Pirates',     'Pittsburgh',    '#FDB827', '#27251F'),
      ('STL', 'St. Louis Cardinals',    'St. Louis',     '#C41E3A', '#0C2340'),
      -- NL West
      ('ARI', 'Arizona Diamondbacks',   'Arizona',       '#A71930', '#E3D4AD'),
      ('COL', 'Colorado Rockies',       'Denver',        '#33006F', '#C4CED4'),
      ('LAD', 'Los Angeles Dodgers',    'Los Angeles',   '#005A9C', '#EF3E42'),
      ('SD',  'San Diego Padres',       'San Diego',     '#2F241D', '#FFC425'),
      ('SF',  'San Francisco Giants',   'San Francisco', '#FD5A1E', '#27251F')
    ON CONFLICT ("abbreviation") DO NOTHING;
  `);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(`DROP TABLE IF EXISTS "public"."mlb_teams";`);
};
