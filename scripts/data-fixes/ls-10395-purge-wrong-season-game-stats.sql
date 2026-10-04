-- LS-10395: purge game_batting / game_pitching rows cached under the wrong season.
--
-- Root cause: the BBRef scraper (lib/bref-client CareerStats.getAllGame*Stats)
-- stamps every row with the season it REQUESTED, but takes game_identifier from
-- the game log BBRef actually SERVED. For seasons BBRef has no log for, it served
-- another year's log, so e.g. dalyto01's 1898 games were cached under every
-- season 1884-1898. lib/game-stats-provider now drops such rows before insert.
--
-- game_identifier is TTTYYYYMMDDG, so substring(gid, 4, 4) is the game's year.
--
-- Sized 2026-10-01 (read-only db_query):
--   game_batting  47,557 rows  game_pitching 5,356 rows  game_fielding 0
--   583 (player_id, season) pairs, seasons 1884-1900, gid years 1898-1901.
-- matchup_player_games references (scores join on player_id + game_identifier):
--   7,324 still resolve after the purge (a correct-season copy exists).
--   587 refs (118 completed matchups, 10 players) lose their only stats rows;
--   588 on 2026-10-02: daily game selection keeps assigning matchup 103035
--   (player 9948) one more wrong-season game each day at 05:00 UTC.
--   The human owner chose to purge those too (LS-10395, 2026-10-02).
--
-- Guarded single transaction: aborts unless every count still matches the
-- sizing above. Re-measure and update the expected values if it aborts.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>

BEGIN;

DO $$
DECLARE
  bad_batting  bigint;
  bad_pitching bigint;
  orphan_refs  bigint;
BEGIN
  SELECT count(*) INTO bad_batting FROM game_batting
    WHERE substring(game_identifier, 4, 4)::int <> season;
  SELECT count(*) INTO bad_pitching FROM game_pitching
    WHERE substring(game_identifier, 4, 4)::int <> season;

  -- References whose game has no correct-season batting/pitching row.
  SELECT count(*) INTO orphan_refs
  FROM matchup_player_games mpg
  JOIN matchup_players mp ON mp.id = mpg.matchup_player_id
  WHERE (
      EXISTS (SELECT 1 FROM game_batting b WHERE b.player_id = mp.player_id
              AND b.game_identifier = mpg.game_identifier
              AND substring(b.game_identifier, 4, 4)::int <> b.season)
   OR EXISTS (SELECT 1 FROM game_pitching p WHERE p.player_id = mp.player_id
              AND p.game_identifier = mpg.game_identifier
              AND substring(p.game_identifier, 4, 4)::int <> p.season))
  AND NOT EXISTS (SELECT 1 FROM game_batting b WHERE b.player_id = mp.player_id
              AND b.game_identifier = mpg.game_identifier
              AND substring(b.game_identifier, 4, 4)::int = b.season)
  AND NOT EXISTS (SELECT 1 FROM game_pitching p WHERE p.player_id = mp.player_id
              AND p.game_identifier = mpg.game_identifier
              AND substring(p.game_identifier, 4, 4)::int = p.season);

  IF bad_batting <> 47557 OR bad_pitching <> 5356 OR orphan_refs <> 588 THEN
    RAISE EXCEPTION 'LS-10395 guard: counts drifted (batting %, pitching %, orphan refs %); expected 47557 / 5356 / 588',
      bad_batting, bad_pitching, orphan_refs;
  END IF;
END $$;

DELETE FROM game_batting  WHERE substring(game_identifier, 4, 4)::int <> season;
DELETE FROM game_pitching WHERE substring(game_identifier, 4, 4)::int <> season;

COMMIT;
