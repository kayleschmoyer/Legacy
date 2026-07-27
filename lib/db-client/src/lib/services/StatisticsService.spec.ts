import { PgDialect } from 'drizzle-orm/pg-core';
import {
  getCareerPitchingOrderByClause,
  getGameBattingFantasyScoreSql,
  getGamePitchingFantasyScoreSql,
} from './StatisticsService';

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

describe('getGameBattingFantasyScoreSql — LS-8670', () => {
  function render(): string {
    return dialect.sqlToQuery(getGameBattingFantasyScoreSql()).sql;
  }

  it('combines every DEFAULT_BATTING_SCORING column into a single expression', () => {
    const sql = render();

    expect(sql).toMatch(/"game_batting"\."hr"/);
    expect(sql).toMatch(/"game_batting"\."triples"/);
    expect(sql).toMatch(/"game_batting"\."doubles"/);
    expect(sql).toMatch(/"game_batting"\."h"/);
    expect(sql).toMatch(/"game_batting"\."rbi"/);
    expect(sql).toMatch(/"game_batting"\."r"/);
    expect(sql).toMatch(/"game_batting"\."hbp"/);
    expect(sql).toMatch(/"game_batting"\."sb"/);
    expect(sql).toMatch(/"game_batting"\."cs"/);
    expect(sql).toMatch(/"game_batting"\."so"/);
  });

  it('applies the DEFAULT_BATTING_SCORING weights', () => {
    const sql = render();

    expect(sql).toMatch(/\* 4/); // hr
    expect(sql).toMatch(/\* 3/); // triples
    expect(sql).toMatch(/\* 2/); // doubles & sb
    expect(sql).toMatch(/\* -1/); // cs
    expect(sql).toMatch(/\* -0\.5/); // so
  });
});

describe('getGamePitchingFantasyScoreSql — LS-8670', () => {
  function render(): string {
    return dialect.sqlToQuery(getGamePitchingFantasyScoreSql()).sql;
  }

  it('combines every DEFAULT_PITCHING_SCORING column into a single expression', () => {
    const sql = render();

    expect(sql).toMatch(/"game_pitching"\."w"/);
    expect(sql).toMatch(/"game_pitching"\."sv"/);
    expect(sql).toMatch(/"game_pitching"\."so"/);
    expect(sql).toMatch(/"game_pitching"\."outs_recorded"/);
    expect(sql).toMatch(/"game_pitching"\."bb"/);
    expect(sql).toMatch(/"game_pitching"\."h"/);
    expect(sql).toMatch(/"game_pitching"\."er"/);
    expect(sql).toMatch(/"game_pitching"\."l"/);
  });

  it('applies the DEFAULT_PITCHING_SCORING weights', () => {
    const sql = render();

    expect(sql).toMatch(/\* 5/); // w & sv
    expect(sql).toMatch(/\* -2/); // er & l
    expect(sql).toMatch(/\* -1/); // bb & h
  });
});
