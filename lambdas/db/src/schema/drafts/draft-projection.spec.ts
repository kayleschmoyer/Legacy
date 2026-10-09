/**
 * Unit tests for the shared projected-matchup-points expression (LS-10595).
 *
 * DraftPlayer.projectedMatchupPoints and DraftPick.projectedMatchupPoints both
 * render this fragment, so a drafted player keeps exactly the number the board
 * showed while they were available.
 */

const loadDraftRules = jest.fn();
jest.mock('./draft-rules', () => ({ loadDraftRules }));
jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    withPoolTimeoutRetry: async (queryFn: () => Promise<unknown>) => queryFn(),
  }),
);

import { PgDialect } from 'drizzle-orm/pg-core';
import {
  buildProjectedMatchupPointsExpr,
  loadDraftedPlayerProjections,
} from './draft-projection';

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

describe('loadDraftedPlayerProjections (LS-10485)', () => {
  const run = (rows: unknown[]) => {
    const execute = jest.fn().mockResolvedValue({ rows });
    return {
      execute,
      result: loadDraftedPlayerProjections({ execute } as never, 7),
    };
  };

  beforeEach(() => {
    loadDraftRules.mockResolvedValue({
      sport: 'baseball',
      gamesPerMatchup: 6,
      pitcherStartsPerMatchup: 2,
    });
  });

  it('maps each drafted player to the projection the query computed', async () => {
    const { result } = run([
      { player_id: 1, projected_matchup_pts: '14.5' },
      { player_id: 2, projected_matchup_pts: 6.25 },
    ]);
    expect(await result).toEqual(
      new Map([
        [1, 14.5],
        [2, 6.25],
      ]),
    );
  });

  it('omits players with no scoring-cache row instead of reporting 0', async () => {
    const { result } = run([
      { player_id: 1, projected_matchup_pts: 14.5 },
      { player_id: 2, projected_matchup_pts: null },
    ]);
    expect((await result).has(2)).toBe(false);
  });

  it('keeps a real 0 projection', async () => {
    const { result } = run([{ player_id: 3, projected_matchup_pts: 0 }]);
    expect((await result).get(3)).toBe(0);
  });

  it('returns an empty map for football without querying', async () => {
    loadDraftRules.mockResolvedValue({ sport: 'football' });
    const { execute, result } = run([]);
    expect((await result).size).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });
});
