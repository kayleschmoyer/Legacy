/**
 * Draft domain — projected fantasy points per matchup, shared by the board's
 * two consumers (LS-10595).
 *
 *  - `getAvailableDraftPlayers` reports it for *undrafted* players
 *    (`DraftPlayer.projectedMatchupPoints`); and
 *  - `DraftPick.projectedMatchupPoints` reports it for *drafted* ones.
 *
 * Before LS-10595 only the first existed. A player drops out of the
 * available-player list the moment he is drafted, so the client could only
 * show a drafted player's projection if it happened to have seen him while he
 * was still available in the current session (LS-10473's client-side cache).
 * Anyone drafted before the app was opened rendered with no projection on the
 * Team tab and was left out of the recap's PROJ PTS total.
 *
 * Both consumers build the value from {@link buildProjectedMatchupPointsExpr}
 * so the number on a pick can never disagree with the number the board showed
 * while the manager was choosing.
 */

import { withPoolTimeoutRetry } from '@legacy-sports/db-client';
import type { PublicDb } from '@legacy-sports/db-client';
import { type SQL, sql } from 'drizzle-orm';
import { loadDraftRules } from './draft-rules';

/**
 * `hitter_avg_ppg * gamesPerMatchup + pitching_avg_ppg * pitcherStartsPerMatchup`
 * over a `player_scoring_cache` row aliased `cs`.
 *
 * `sql.raw` is safe: both multipliers are integers sourced from our own DB
 * (league / mock-draft settings), never user input.
 */
export function buildProjectedMatchupPointsExpr(rules: {
  gamesPerMatchup?: number | null;
  pitcherStartsPerMatchup?: number | null;
}): SQL {
  const gpm = Math.trunc(Number(rules.gamesPerMatchup ?? 5));
  const spm = Math.trunc(Number(rules.pitcherStartsPerMatchup ?? 1));
  return sql.raw(
    `COALESCE(cs.hitter_avg_ppg, 0) * ${gpm} + COALESCE(cs.pitching_avg_ppg, 0) * ${spm}`,
  );
}

/**
 * Projected matchup points for every player drafted in `draftId`, keyed by
 * player id.
 *
 * Football drafts resolve to an empty map: `player_scoring_cache` is computed
 * from baseball career stats only, and the available-player query likewise
 * never joins it for football (it sorts those boards alphabetically with no
 * projection column), so a drafted football player has no projection on
 * either side.
 *
 * A player with no default scoring-cache row is omitted (resolves to null),
 * not given the board's COALESCE'd 0 — a fabricated 0 would read as a real
 * projection (LS-10485).
 */
export async function loadDraftedPlayerProjections(
  db: PublicDb,
  draftId: number,
): Promise<Map<number, number>> {
  const rules = await loadDraftRules(db, draftId);
  if (rules.sport === 'football') return new Map();

  const result = await withPoolTimeoutRetry(() =>
    db.execute(sql`
      SELECT dp.player_id,
        CASE WHEN cs.player_id IS NULL THEN NULL
          ELSE ${buildProjectedMatchupPointsExpr(rules)} END AS projected_matchup_pts
      FROM public.draft_picks dp
      LEFT JOIN public.player_scoring_cache cs
        ON cs.player_id = dp.player_id AND cs.league_id IS NULL
      WHERE dp.draft_id = ${draftId}
    `),
  );

  const projections = new Map<number, number>();
  for (const row of result.rows as unknown as Array<{
    player_id: number | string;
    projected_matchup_pts: number | string | null;
  }>) {
    if (row.projected_matchup_pts == null) continue;
    projections.set(Number(row.player_id), Number(row.projected_matchup_pts));
  }
  return projections;
}
