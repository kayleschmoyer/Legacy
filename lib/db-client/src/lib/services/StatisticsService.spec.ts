import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { DbOptions } from '@legacy-sports/utils/node';
import {
  CAREER_BATTING_SORT_FIELDS,
  CAREER_PITCHING_SORT_FIELDS,
} from '@legacy-sports/utils';
import {
  getCareerBattingFantasyScoreSql,
  getCareerPitchingFantasyScoreSql,
  getCareerPitchingOrderByClause,
  getGameBattingFantasyScoreSql,
  getGamePitchingFantasyScoreSql,
  StatisticsService,
} from './StatisticsService';
import { getCareerBattingOrderByClause } from '../query-builders/TypeSafeQueryBuilder';

jest.mock('../client/Helpers', () => ({
  runWithPublicClient: jest.fn(),
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

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

  describe('IP / WHIP / K/9 / Player — LS-10690 regression', () => {
    it.each([
      [
        'outsRecorded',
        /"career_pitching"\."outs_recorded" (ASC|DESC) NULLS LAST/,
      ],
      [
        'whip',
        /\(\(COALESCE\("career_pitching"\."h", 0\) \+ COALESCE\("career_pitching"\."bb", 0\)\)::numeric \/ NULLIF\("career_pitching"\."outs_recorded" \/ 3\.0, 0\)\) (ASC|DESC) NULLS LAST/,
      ],
      [
        'strikeoutsPerNine',
        /\(COALESCE\("career_pitching"\."so", 0\) \* 27\.0 \/ NULLIF\("career_pitching"\."outs_recorded", 0\)\) (ASC|DESC) NULLS LAST/,
      ],
      [
        'lastName',
        /"players"\."last_name" (ASC|DESC) NULLS LAST, "players"\."first_name" (ASC|DESC) NULLS LAST/,
      ],
    ])('%s honours both directions', (orderBy, pattern) => {
      const descSql = renderOrderBy(orderBy, 'desc');
      const ascSql = renderOrderBy(orderBy, 'asc');
      expect(descSql).toMatch(pattern);
      expect(ascSql).toMatch(pattern);
      expect(descSql).toContain('DESC');
      expect(ascSql).toContain('ASC');
      expect(ascSql).not.toContain('DESC');
      expect(descSql).not.toMatch(/"career_pitching"\."w"/);
    });
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

/**
 * Mapping-coverage guard (LS-10690). The stats grids type their column → sort
 * field maps against CAREER_*_SORT_FIELDS, so every field they can send is in
 * these lists. Each must have an explicit ORDER BY case: one that falls through
 * to the default renders identically to an unmatchable key in both directions.
 * (`wins` DESC equals the pitching default byte-for-byte, but `wins` ASC does
 * not — hence comparing both directions.)
 */
describe('sort-field contract has explicit ORDER BY cases — LS-10690', () => {
  const UNMATCHABLE = '__no_such_sort_field__';
  const DIRECTIONS = ['asc', 'desc'] as const;
  const renderBatting = (orderBy: string, dir: 'asc' | 'desc') =>
    dialect.sqlToQuery(
      getCareerBattingOrderByClause({ orderBy, orderDirection: dir }),
    ).sql;
  const isHandled = (
    render: (orderBy: string, dir: 'asc' | 'desc') => string,
    field: string,
  ) =>
    DIRECTIONS.some((dir) => render(field, dir) !== render(UNMATCHABLE, dir));

  it.each([...CAREER_PITCHING_SORT_FIELDS])(
    'pitching field "%s" has an explicit case',
    (field) => {
      expect(isHandled(renderOrderBy, field)).toBe(true);
    },
  );

  it.each([...CAREER_BATTING_SORT_FIELDS])(
    'batting field "%s" has an explicit case',
    (field) => {
      expect(isHandled(renderBatting, field)).toBe(true);
    },
  );

  it('detects a field with no case (guards the guard)', () => {
    expect(isHandled(renderOrderBy, 'notAField')).toBe(false);
    expect(isHandled(renderBatting, 'notAField')).toBe(false);
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

describe('getCareerBattingFantasyScoreSql — LS-9145', () => {
  function render(): string {
    return dialect.sqlToQuery(getCareerBattingFantasyScoreSql()).sql;
  }

  it('combines every DEFAULT_BATTING_SCORING column against career_batting', () => {
    const sql = render();

    expect(sql).toMatch(/"career_batting"\."hr"/);
    expect(sql).toMatch(/"career_batting"\."triples"/);
    expect(sql).toMatch(/"career_batting"\."doubles"/);
    expect(sql).toMatch(/"career_batting"\."h"/);
    expect(sql).toMatch(/"career_batting"\."rbi"/);
    expect(sql).toMatch(/"career_batting"\."r"/);
    expect(sql).toMatch(/"career_batting"\."hbp"/);
    expect(sql).toMatch(/"career_batting"\."sb"/);
    expect(sql).toMatch(/"career_batting"\."cs"/);
    expect(sql).toMatch(/"career_batting"\."so"/);
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

describe('getCareerPitchingFantasyScoreSql — LS-9145', () => {
  function render(): string {
    return dialect.sqlToQuery(getCareerPitchingFantasyScoreSql()).sql;
  }

  it('combines every DEFAULT_PITCHING_SCORING column against career_pitching', () => {
    const sql = render();

    expect(sql).toMatch(/"career_pitching"\."w"/);
    expect(sql).toMatch(/"career_pitching"\."sv"/);
    expect(sql).toMatch(/"career_pitching"\."so"/);
    expect(sql).toMatch(/"career_pitching"\."outs_recorded"/);
    expect(sql).toMatch(/"career_pitching"\."bb"/);
    expect(sql).toMatch(/"career_pitching"\."h"/);
    expect(sql).toMatch(/"career_pitching"\."er"/);
    expect(sql).toMatch(/"career_pitching"\."l"/);
  });

  it('applies the DEFAULT_PITCHING_SCORING weights', () => {
    const sql = render();

    expect(sql).toMatch(/\* 5/); // w & sv
    expect(sql).toMatch(/\* -2/); // er & l
    expect(sql).toMatch(/\* -1/); // bb & h
  });
});

describe('career batting maximum filters reach SQL — LS-10808', () => {
  /**
   * Minimal Drizzle-shaped fake: every builder method chains, `where` records
   * its condition, and `execute` resolves an empty result set. Lets the test
   * render exactly the WHERE clause each rows/count variant would send.
   */
  function useRecordingDb(): { whereClauses: SQL[] } {
    const whereClauses: SQL[] = [];
    const chain: Record<string, unknown> = {};
    for (const method of [
      'select',
      'from',
      'innerJoin',
      'orderBy',
      'limit',
      'offset',
    ]) {
      chain[method] = () => chain;
    }
    chain.where = (condition: SQL) => {
      whereClauses.push(condition);
      return chain;
    };
    chain.execute = () => Promise.resolve([]);
    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      (handler as (db: unknown) => Promise<unknown>)(chain),
    );
    return { whereClauses };
  }

  const maxima = { maxHomeRuns: 240, maxRBI: 500, maxBattingAvg: 0.27 };

  it.each([
    ['no join', {}],
    ['player-name search', { searchTerm: 'ruth' }],
    ['position', { position: 'OF' }],
    ['search + position', { searchTerm: 'ruth', position: 'OF' }],
  ])(
    'applies Max HR/RBI/AVG to rows and totalCount (%s)',
    async (_variant, extraFilters) => {
      const { whereClauses } = useRecordingDb();
      const service = new StatisticsService({} as DbOptions);
      const queryOptions = {
        filters: { ...maxima, ...extraFilters },
        limit: 25,
      };

      await service.getCareerBattingStats(queryOptions);
      await service.getCareerBattingStatsCount(queryOptions);

      expect(whereClauses).toHaveLength(2);
      for (const clause of whereClauses) {
        const { sql, params } = dialect.sqlToQuery(clause);
        expect(sql).toMatch(/"career_batting"\."hr" <= \$\d+/);
        expect(sql).toMatch(/"career_batting"\."rbi" <= \$\d+/);
        expect(sql).toMatch(/::numeric\) <= \$\d+/);
        expect(params).toEqual(expect.arrayContaining([240, 500, 0.27]));
      }
    },
  );
});
