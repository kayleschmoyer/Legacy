import { PgDialect } from 'drizzle-orm/pg-core';
import {
  battingPlayerTypeFilter,
  buildCareerBattingConditions,
  buildPlayerNameSearch,
  getCareerBattingOrderByClause,
  positionEligibilityFilter,
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

// The Hitters tab must exclude pure pitchers from the batting grid while keeping
// two-way players visible (LS-7145). The filter restricts career_batting rows via
// the player_eligible_positions materialized view, where pitchers are stored as
// 'SP'/'RP' rows.
describe('battingPlayerTypeFilter (LS-7145)', () => {
  function render(playerType: string): string | undefined {
    const condition = battingPlayerTypeFilter(playerType);
    return condition ? dialect.sqlToQuery(condition).sql : undefined;
  }

  it("excludes pitching positions for 'hitter' so pure pitchers drop out", () => {
    const sql = render('hitter');
    // Keeps any player with a non-pitching eligible position (two-way players
    // such as Ohtani retain their DH/field rows and stay visible).
    expect(sql).toMatch(/"career_batting"\."player_id" IN \(/);
    expect(sql).toMatch(/player_eligible_positions/);
    expect(sql).toMatch(/position NOT IN \('SP', 'RP', 'P'\)/);
  });

  it("keeps only pitching positions for 'pitcher'", () => {
    const sql = render('pitcher');
    expect(sql).toMatch(/player_eligible_positions/);
    expect(sql).toMatch(/position IN \('SP', 'RP', 'P'\)/);
    expect(sql).not.toMatch(/NOT IN/);
  });

  it('returns undefined for unrecognized player types (no condition added)', () => {
    expect(battingPlayerTypeFilter('combined')).toBeUndefined();
    expect(battingPlayerTypeFilter('')).toBeUndefined();
  });
});

// Players tab position chips (LS-8835 regression): the filter must go against
// player_eligible_positions, not career_fielding_by_position — the latter is
// fielding-only and has no SP/RP rows (pitching roles, not fielding
// positions), so those two chips previously inner-joined to zero rows.
describe('positionEligibilityFilter (LS-8835)', () => {
  function render(position: string): string {
    return dialect.sqlToQuery(positionEligibilityFilter(position)).sql;
  }

  it('filters career_batting.player_id via player_eligible_positions', () => {
    const sql = render('2B');
    expect(sql).toMatch(/"career_batting"\."player_id" IN \(/);
    expect(sql).toMatch(/player_eligible_positions/);
    expect(sql).toMatch(/position ILIKE/);
  });

  it.each(['SP', 'RP', 'DH'])(
    "renders a filter for the pitching-role/DH chip '%s' (no career_fielding_by_position join, which lacks these values)",
    (position) => {
      const sql = render(position);
      expect(sql).not.toMatch(/career_fielding_by_position/);
      expect(sql).toMatch(/player_eligible_positions/);
    },
  );
});

describe('buildPlayerNameSearch (shared by career batting + pitching search)', () => {
  it('matches first name, last name, or the lowercased full name', () => {
    const condition = buildPlayerNameSearch('Babe Ruth');
    if (!condition) throw new Error('expected a name-search condition');
    const query = dialect.sqlToQuery(condition);
    expect(query.sql).toMatch(/"players"\."first_name" ilike \$1/);
    expect(query.sql).toMatch(/"players"\."last_name" ilike \$2/);
    expect(query.sql).toMatch(
      /lower\("players"\."first_name" \|\| ' ' \|\| "players"\."last_name"\) ilike \$3/,
    );
    expect(query.params).toEqual(['%Babe Ruth%', '%Babe Ruth%', '%babe ruth%']);
  });
});

describe('buildCareerBattingConditions (LS-10808)', () => {
  function render(
    filters: Parameters<typeof buildCareerBattingConditions>[0],
  ): { sql: string; params: unknown[] }[] {
    return buildCareerBattingConditions(filters).map((condition) =>
      dialect.sqlToQuery(condition),
    );
  }

  it('returns no conditions when no filters are set', () => {
    expect(render({})).toEqual([]);
  });

  it('caps career home runs with maxHomeRuns', () => {
    const [condition] = render({ maxHomeRuns: 240 });
    expect(condition.sql).toMatch(/"career_batting"\."hr" <= \$1/);
    expect(condition.params).toEqual([240]);
  });

  it('caps career RBI with maxRBI', () => {
    const [condition] = render({ maxRBI: 500 });
    expect(condition.sql).toMatch(/"career_batting"\."rbi" <= \$1/);
    expect(condition.params).toEqual([500]);
  });

  it('caps career batting average with maxBattingAvg, guarding zero at-bats', () => {
    const [condition] = render({ maxBattingAvg: 0.27 });
    expect(condition.sql).toMatch(/"career_batting"\."ab" > 0/);
    expect(condition.sql).toMatch(
      /\("career_batting"\."h"::numeric \/ "career_batting"\."ab"::numeric\) <= \$1/,
    );
    expect(condition.params).toEqual([0.27]);
  });

  it('combines minimums and maximums into a closed range', () => {
    const rendered = render({
      minHomeRuns: 100,
      maxHomeRuns: 240,
      minRBI: 200,
      maxRBI: 500,
      minBattingAvg: 0.25,
      maxBattingAvg: 0.27,
    });
    const sql = rendered.map((condition) => condition.sql).join(' AND ');
    expect(sql).toMatch(/"career_batting"\."hr" >= /);
    expect(sql).toMatch(/"career_batting"\."hr" <= /);
    expect(sql).toMatch(/"career_batting"\."rbi" >= /);
    expect(sql).toMatch(/"career_batting"\."rbi" <= /);
    expect(sql).toMatch(/::numeric\) >= /);
    expect(sql).toMatch(/::numeric\) <= /);
    expect(rendered.flatMap((condition) => condition.params)).toEqual([
      100, 240, 200, 500, 0.25, 0.27,
    ]);
  });
});
