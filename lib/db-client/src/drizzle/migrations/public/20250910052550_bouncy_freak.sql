-- Drop our custom views to let Drizzle manage them properly
DROP VIEW IF EXISTS career_batting CASCADE;
DROP VIEW IF EXISTS career_pitching CASCADE;
DROP VIEW IF EXISTS career_fielding_by_position CASCADE;
DROP VIEW IF EXISTS player_eligible_positions CASCADE;
DROP VIEW IF EXISTS users CASCADE;