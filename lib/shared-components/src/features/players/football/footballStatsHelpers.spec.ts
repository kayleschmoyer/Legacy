import {
  buildFootballQueryVars,
  buildFootballStatsQuery,
  DEFAULT_SORT_BY_VIEW,
  FOOTBALL_STAT_SORT_FIELDS,
  FOOTBALL_STATS_VIEWS,
  FOOTBALL_VIEW_TABS,
  isFootballSortField,
  isSortFieldValidForView,
  normalizeFootballView,
  resolveSortForView,
  TEAM_ALL,
} from './footballStatsHelpers';

describe('normalizeFootballView', () => {
  it('passes through every canonical view', () => {
    for (const view of FOOTBALL_STATS_VIEWS) {
      expect(normalizeFootballView(view)).toBe(view);
    }
  });

  it.each([null, undefined, '', 'batting', 'DST', 'Overview'])(
    'defaults %p to overview',
    (raw) => {
      expect(normalizeFootballView(raw)).toBe('overview');
    },
  );
});

describe('FOOTBALL_VIEW_TABS', () => {
  it('covers every view once, in display order', () => {
    expect(FOOTBALL_VIEW_TABS.map((t) => t.key)).toEqual([
      ...FOOTBALL_STATS_VIEWS,
    ]);
  });

  it('labels the IDP view "Defense" and the DST view "DST"', () => {
    expect(FOOTBALL_VIEW_TABS.find((t) => t.key === 'idp')?.label).toBe(
      'Defense',
    );
    expect(FOOTBALL_VIEW_TABS.find((t) => t.key === 'defense')?.label).toBe(
      'DST',
    );
  });
});

describe('isFootballSortField', () => {
  it('accepts the players-table sorts', () => {
    expect(isFootballSortField('name')).toBe(true);
    expect(isFootballSortField('position')).toBe(true);
    expect(isFootballSortField('team')).toBe(true);
  });

  it('accepts every namespaced stat key', () => {
    for (const fields of Object.values(FOOTBALL_STAT_SORT_FIELDS)) {
      for (const field of fields) {
        expect(isFootballSortField(field)).toBe(true);
      }
    }
  });

  it('rejects unknown values', () => {
    expect(isFootballSortField('fpts')).toBe(false);
    expect(isFootballSortField('passing.nope')).toBe(false);
    expect(isFootballSortField('')).toBe(false);
  });
});

describe('isSortFieldValidForView', () => {
  it('allows players-table sorts on every view', () => {
    for (const view of FOOTBALL_STATS_VIEWS) {
      expect(isSortFieldValidForView('name', view)).toBe(true);
    }
  });

  it('allows a stat sort only on its own view', () => {
    expect(isSortFieldValidForView('passing.yds', 'passing')).toBe(true);
    expect(isSortFieldValidForView('passing.yds', 'rushing')).toBe(false);
    expect(isSortFieldValidForView('passing.yds', 'overview')).toBe(false);
    expect(isSortFieldValidForView('defense.sacks', 'defense')).toBe(true);
    expect(isSortFieldValidForView('idp.totalTkl', 'defense')).toBe(false);
  });
});

describe('resolveSortForView', () => {
  it('keeps an explicit valid sort', () => {
    expect(resolveSortForView('passing', 'passing.td', 'asc')).toEqual({
      sortField: 'passing.td',
      sortDir: 'asc',
    });
  });

  it('falls back to the view default when the field is unset', () => {
    expect(resolveSortForView('rushing', undefined, undefined)).toEqual(
      DEFAULT_SORT_BY_VIEW.rushing,
    );
  });

  it('falls back when the field belongs to another view', () => {
    expect(resolveSortForView('kicking', 'passing.yds', 'desc')).toEqual(
      DEFAULT_SORT_BY_VIEW.kicking,
    );
  });

  it('falls back when the field is not a sort field at all', () => {
    expect(resolveSortForView('overview', 'fpts', 'desc')).toEqual(
      DEFAULT_SORT_BY_VIEW.overview,
    );
  });
});

describe('DEFAULT_SORT_BY_VIEW', () => {
  it('defines a sort valid for every view', () => {
    for (const view of FOOTBALL_STATS_VIEWS) {
      const { sortField } = DEFAULT_SORT_BY_VIEW[view];
      expect(isSortFieldValidForView(sortField, view)).toBe(true);
    }
  });
});

describe('buildFootballQueryVars (view/category)', () => {
  const base = {
    positions: [],
    team: TEAM_ALL,
    search: '',
    sortDir: 'asc' as const,
    injuryStatus: null,
  };

  it('omits category on the overview and applies its default sort', () => {
    const vars = buildFootballQueryVars({ ...base, view: 'overview' });
    expect(vars.category).toBeUndefined();
    expect(vars.sortBy).toBe('name');
    expect(vars.sortDir).toBe('asc');
  });

  it('emits the view as category with the default leaders sort', () => {
    const vars = buildFootballQueryVars({ ...base, view: 'passing' });
    expect(vars.category).toBe('passing');
    expect(vars.sortBy).toBe('passing.yds');
    expect(vars.sortDir).toBe('desc');
  });

  it('keeps an explicit sort belonging to the view', () => {
    const vars = buildFootballQueryVars({
      ...base,
      view: 'idp',
      sortField: 'idp.sacks',
      sortDir: 'desc',
    });
    expect(vars.category).toBe('idp');
    expect(vars.sortBy).toBe('idp.sacks');
    expect(vars.sortDir).toBe('desc');
  });

  it('drops a foreign-view sort back to the view default (URL tampering)', () => {
    const vars = buildFootballQueryVars({
      ...base,
      view: 'defense',
      sortField: 'passing.yds',
      sortDir: 'asc',
    });
    expect(vars.category).toBe('defense');
    expect(vars.sortBy).toBe('defense.sacks');
    expect(vars.sortDir).toBe('desc');
  });
});

describe('buildFootballStatsQuery', () => {
  it('always writes sport, view, and pageSize', () => {
    const url = buildFootballStatsQuery({
      view: 'receiving',
      positions: [],
      team: TEAM_ALL,
      search: '',
      pageSize: 25,
      sortDir: 'asc',
      injuryStatus: null,
    });
    expect(url).toBe('/players/stats?sport=nfl&view=receiving&pageSize=25');
  });

  it('serializes an explicit sort', () => {
    const url = buildFootballStatsQuery({
      view: 'passing',
      positions: ['QB'],
      team: TEAM_ALL,
      search: '',
      pageSize: 50,
      sortField: 'passing.td',
      sortDir: 'desc',
      injuryStatus: null,
    });
    expect(url).toContain('view=passing');
    expect(url).toContain('position=QB');
    expect(url).toContain('sortBy=passing.td');
    expect(url).toContain('sortDir=desc');
  });
});
