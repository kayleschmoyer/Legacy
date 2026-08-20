import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Migration: Backfill players.nfl_team for football players (LS-9477)
 *
 * Purpose: `players.nfl_team` was NULL for all 20,052 football players, and
 * nothing in the codebase ever wrote it. `buildEligibilityConditions`
 * (lib/db-client/src/lib/DraftUtils.ts) implements the AFC/NFC player pool as
 *
 *   EXISTS (SELECT 1 FROM nfl_teams nt
 *           WHERE nt.abbreviation = p.nfl_team AND nt.conference = $conference)
 *
 * so that predicate could never match. An AFC- or NFC-scoped league therefore
 * showed an empty draft board, and — because the same helper backs
 * `findFailedEligibilityRule` for makeDraftPick / commissioner-pick — every
 * pick was also rejected with "Player is not on an AFC team". This affects
 * real football leagues and mock drafts identically; a mock draft is a league
 * row with is_mock_draft = true running the same shared code path.
 *
 * Source of truth: the per-season stat tables each carry a `team` column. We
 * take each player's most recent season row and map it onto the modern
 * franchise abbreviation used by public.nfl_teams.
 *
 * Two families of code need translating:
 *
 *  - Style differences for currently-active franchises. The stat feed uses
 *    Pro-Football-Reference three-letter codes (NOR, SFO, GNB, KAN, NWE, TAM,
 *    LVR) where nfl_teams uses the shorter official ones (NO, SF, GB, KC, NE,
 *    TB, LV). These cover ~5,500 players including essentially every active
 *    one, so skipping them would gut the pool.
 *  - Franchise moves and renames, mapped to the successor club: OAK/RAI → LV,
 *    SDG → LAC, STL/RAM → LAR, PHO → ARI, BOS → NE (Boston Patriots),
 *    NYT → NYJ (New York Titans), DTX → KC (Dallas Texans).
 *
 * Coverage: 15,353 of 20,052 football players have a team on some season row,
 * and with the mapping above all 15,353 resolve to a live nfl_teams row. The
 * remaining ~4,700 have no team on any season stat row at all and stay NULL —
 * they are pre-merger and short-career players who were already invisible to
 * every conference-scoped query, so this migration strictly widens the pool.
 *
 * Changes:
 * - Sets players.nfl_team from the player's latest season stat row.
 */

const NFL_TEAM_BACKFILL = `
  WITH stat_teams AS (
    SELECT player_id, team, season FROM public.football_season_passing     WHERE team IS NOT NULL
    UNION ALL
    SELECT player_id, team, season FROM public.football_season_rushing     WHERE team IS NOT NULL
    UNION ALL
    SELECT player_id, team, season FROM public.football_season_receiving   WHERE team IS NOT NULL
    UNION ALL
    SELECT player_id, team, season FROM public.football_season_kicking     WHERE team IS NOT NULL
    UNION ALL
    SELECT player_id, team, season FROM public.football_season_defense     WHERE team IS NOT NULL
    UNION ALL
    SELECT player_id, team, season FROM public.football_season_defense_idp WHERE team IS NOT NULL
  ),
  latest AS (
    SELECT DISTINCT ON (player_id) player_id, team
    FROM stat_teams
    ORDER BY player_id, season DESC, team
  ),
  mapped AS (
    SELECT
      l.player_id,
      CASE l.team
        WHEN 'NOR' THEN 'NO'
        WHEN 'SFO' THEN 'SF'
        WHEN 'GNB' THEN 'GB'
        WHEN 'KAN' THEN 'KC'
        WHEN 'NWE' THEN 'NE'
        WHEN 'TAM' THEN 'TB'
        WHEN 'LVR' THEN 'LV'
        WHEN 'OAK' THEN 'LV'
        WHEN 'RAI' THEN 'LV'
        WHEN 'SDG' THEN 'LAC'
        WHEN 'STL' THEN 'LAR'
        WHEN 'RAM' THEN 'LAR'
        WHEN 'PHO' THEN 'ARI'
        WHEN 'BOS' THEN 'NE'
        WHEN 'NYT' THEN 'NYJ'
        WHEN 'DTX' THEN 'KC'
        ELSE l.team
      END AS abbreviation
    FROM latest l
  )
  UPDATE public.players p
  SET nfl_team = m.abbreviation
  FROM mapped m
  JOIN public.nfl_teams t ON t.abbreviation = m.abbreviation
  WHERE p.id = m.player_id
    AND p.sport = 'football'
    AND p.nfl_team IS DISTINCT FROM m.abbreviation;
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const up = async ({ db }: { db: PgDatabase<any> }) => {
  await db.execute(NFL_TEAM_BACKFILL);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PgDatabase generic is untyped across the runner/lambda sandbox boundary
export const down = async ({ db }: { db: PgDatabase<any> }) => {
  // Every football player's nfl_team was NULL before this migration, so
  // clearing the sport's column is an exact inverse. Baseball rows are
  // untouched here exactly as they were untouched by `up`.
  await db.execute(`
    UPDATE public.players
    SET nfl_team = NULL
    WHERE sport = 'football' AND nfl_team IS NOT NULL;
  `);
};
