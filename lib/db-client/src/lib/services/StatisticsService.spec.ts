import { PgDialect } from 'drizzle-orm/pg-core';
import { getCareerPitchingOrderByClause } from './StatisticsService';

const dialect = new PgDialect();

function renderOrderBy(
  orderBy: string | undefined,
  orderDirection: 'asc' | 'desc' = 'desc',
): string {
  return dialect.sqlToQuery(
    getCareerPitchingOrderByClause(orderBy, orderDirection),
  ).sql;
}

describe('getCareerPitchingOrderByClause', () => {
  it('sorts by career_pitching.w when orderBy is "wins"', () => {
    expect(renderOrderBy('wins')).toMatch(
      /"career_pitching"\."w" DESC NULLS LAST/,
    );
  });

  it('falls back to wins DESC for unrecognised orderBy values', () => {
    expect(renderOrderBy('mystery')).toMatch(
      /"career_pitching"\."w" DESC NULLS LAST/,
    );
  });

  describe('pitchingWAR — LS-4005 regression', () => {
    it('maps to career_pitching.pitching_war (not the wins fallback)', () => {
      const sql = renderOrderBy('pitchingWAR');
      expect(sql).toMatch(/"career_pitching"\."pitching_war" DESC NULLS LAST/);
      // Guard against fallthrough to the default branch.
      expect(sql).not.toMatch(/"career_pitching"\."w" DESC NULLS LAST/);
    });

    it('honours ascending direction', () => {
      expect(renderOrderBy('pitchingWAR', 'asc')).toMatch(
        /"career_pitching"\."pitching_war" ASC NULLS LAST/,
      );
    });
  });

  it.each([
    ['losses', 'l'],
    ['strikeouts', 'so'],
    ['era', 'era'],
    ['games', 'g'],
    ['gamesStarted', 'gs'],
    ['completeGames', 'cg'],
    ['shutouts', 'sho'],
    ['saves', 'sv'],
    ['baseOnBalls', 'bb'],
    ['hits', 'h'],
    ['earnedRuns', 'er'],
    ['homeRuns', 'hr'],
  ])('maps orderBy=%s to career_pitching.%s', (orderBy, column) => {
    expect(renderOrderBy(orderBy)).toMatch(
      new RegExp(`"career_pitching"\\."${column}" DESC NULLS LAST`),
    );
  });

  describe('fantasyPoints (FPTS) — LS-8569', () => {
    it('emits the DEFAULT_PITCHING_SCORING weighted sum, not just wins', () => {
      const sql = renderOrderBy('fantasyPoints');

      // Must combine multiple pitching columns — proving we don't hit the
      // wins-DESC default fallthrough.
      expect(sql).toMatch(/"career_pitching"\."w"/);
      expect(sql).toMatch(/"career_pitching"\."sv"/);
      expect(sql).toMatch(/"career_pitching"\."so"/);
      expect(sql).toMatch(/"career_pitching"\."outs_recorded"/);
      expect(sql).toMatch(/"career_pitching"\."bb"/);
      expect(sql).toMatch(/"career_pitching"\."h"/);
      expect(sql).toMatch(/"career_pitching"\."er"/);
      expect(sql).toMatch(/"career_pitching"\."l"/);

      // Weights from DEFAULT_PITCHING_SCORING
      expect(sql).toMatch(/\* 5/); // w & sv
      expect(sql).toMatch(/\* -2/); // er & l penalties
      expect(sql).toMatch(/\* -1/); // bb & h penalties

      expect(sql).toMatch(/DESC NULLS LAST$/);
    });

    it('honours ascending direction', () => {
      expect(renderOrderBy('fantasyPoints', 'asc')).toMatch(/ASC NULLS LAST$/);
    });
  });

  describe('fantasyPointsPerGame (FPTS/G) — LS-8569', () => {
    it('divides the weighted sum by career_pitching.g', () => {
      const sql = renderOrderBy('fantasyPointsPerGame');

      expect(sql).toMatch(/NULLIF\("career_pitching"\."g", 0\)/);
      expect(sql).toMatch(/\* 5/); // w/sv weight still present in numerator
      expect(sql).toMatch(/DESC NULLS LAST$/);
    });
  });
});
