/**
 * Unit tests for the shared projected-matchup-points expression (LS-10595).
 *
 * DraftPlayer.projectedMatchupPoints and DraftPick.projectedMatchupPoints both
 * render this fragment, so a drafted player keeps exactly the number the board
 * showed while they were available.
 */

import { PgDialect } from 'drizzle-orm/pg-core';
import { buildProjectedMatchupPointsExpr } from './draft-projection';

const dialect = new PgDialect();

const render = (
  rules: Parameters<typeof buildProjectedMatchupPointsExpr>[0],
): string => dialect.sqlToQuery(buildProjectedMatchupPointsExpr(rules)).sql;

describe('buildProjectedMatchupPointsExpr', () => {
  it("weights hitter and pitcher rates by the league's matchup schedule", () => {
    expect(render({ gamesPerMatchup: 6, pitcherStartsPerMatchup: 2 })).toBe(
      'COALESCE(cs.hitter_avg_ppg, 0) * 6 + COALESCE(cs.pitching_avg_ppg, 0) * 2',
    );
  });

  it('falls back to 5 games and 1 start when the schedule is unset', () => {
    expect(
      render({ gamesPerMatchup: null, pitcherStartsPerMatchup: null }),
    ).toBe(
      'COALESCE(cs.hitter_avg_ppg, 0) * 5 + COALESCE(cs.pitching_avg_ppg, 0) * 1',
    );
  });
});
