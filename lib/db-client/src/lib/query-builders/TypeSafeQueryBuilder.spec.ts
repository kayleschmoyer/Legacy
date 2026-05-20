import { PgDialect } from 'drizzle-orm/pg-core';
import {
  getCareerBattingOrderByClause,
  type QueryOptions,
} from './TypeSafeQueryBuilder';

const dialect = new PgDialect();

function renderOrderBy(options: QueryOptions): string {
  return dialect.sqlToQuery(getCareerBattingOrderByClause(options)).sql;
}

describe('getCareerBattingOrderByClause', () => {
  it('sorts by the career_batting.hr column when orderBy is "homeRuns"', () => {
    const sql = renderOrderBy({ orderBy: 'homeRuns', orderDirection: 'desc' });
    expect(sql).toMatch(/"career_batting"\."hr" DESC NULLS LAST/);
  });

  it('falls back to home runs DESC for unrecognised orderBy values', () => {
    // Cast around the literal union to simulate an unknown value reaching
    // the resolver from the wire — this is the codepath the bug used to
    // exercise for FPTS before the totalScore case existed.
    const sql = renderOrderBy({
      orderBy: 'mystery' as unknown as QueryOptions['orderBy'],
      orderDirection: 'desc',
    });
    expect(sql).toMatch(/"career_batting"\."hr" DESC NULLS LAST/);
  });

  describe('FPTS (totalScore) — LS-4005 regression', () => {
    it('emits the DEFAULT_BATTING_SCORING weighted sum, not just hr', () => {
      const sql = renderOrderBy({
        orderBy: 'totalScore',
        orderDirection: 'desc',
      });

      // Must combine multiple batting columns — proving we no longer hit the
      // default-hr fallthrough that put Barry Bonds on top.
      expect(sql).toMatch(/"career_batting"\."h"/);
      expect(sql).toMatch(/"career_batting"\."doubles"/);
      expect(sql).toMatch(/"career_batting"\."triples"/);
      expect(sql).toMatch(/"career_batting"\."hr"/);
      expect(sql).toMatch(/"career_batting"\."rbi"/);
      expect(sql).toMatch(/"career_batting"\."sb"/);
      expect(sql).toMatch(/"career_batting"\."cs"/);
      expect(sql).toMatch(/"career_batting"\."so"/);

      // Weights from DEFAULT_BATTING_SCORING
      expect(sql).toMatch(/\* 4/); // hr
      expect(sql).toMatch(/\* 3/); // triples
      expect(sql).toMatch(/\* 2/); // doubles & sb
      expect(sql).toMatch(/-0\.5/); // strikeouts penalty
      expect(sql).toMatch(/-1/); // caught stealing penalty

      expect(sql).toMatch(/DESC NULLS LAST$/);
    });

    it('honours ascending direction', () => {
      const sql = renderOrderBy({
        orderBy: 'totalScore',
        orderDirection: 'asc',
      });
      expect(sql).toMatch(/ASC NULLS LAST$/);
    });
  });

  describe('FPTS per game (avgPointsPerGame)', () => {
    it('divides the weighted sum by career_batting.g', () => {
      const sql = renderOrderBy({
        orderBy: 'avgPointsPerGame',
        orderDirection: 'desc',
      });

      expect(sql).toMatch(/NULLIF\("career_batting"\."g", 0\)/);
      expect(sql).toMatch(/\* 4/); // hr weight still present in numerator
      expect(sql).toMatch(/DESC NULLS LAST$/);
    });
  });
});
