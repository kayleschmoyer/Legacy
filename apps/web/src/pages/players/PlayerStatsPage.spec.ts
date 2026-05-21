import { buildStatsSearchParams } from './PlayerStatsPage';

describe('buildStatsSearchParams', () => {
  it('emits view + pageSize for a bare snapshot', () => {
    const out = buildStatsSearchParams({
      viewMode: 'combined',
      pageSize: 25,
      filters: {},
    });
    expect(out.get('view')).toBe('combined');
    expect(out.get('pageSize')).toBe('25');
    expect(out.get('searchTerm')).toBeNull();
    expect(out.get('minHomeRuns')).toBeNull();
    expect(out.get('maxERA')).toBeNull();
  });

  it('includes string filters when present', () => {
    const out = buildStatsSearchParams({
      viewMode: 'hitters',
      pageSize: 50,
      filters: {
        searchTerm: 'trout',
        position: 'OF',
        team: 'LAA',
        playerType: 'hitter',
      },
    });
    expect(out.get('view')).toBe('hitters');
    expect(out.get('pageSize')).toBe('50');
    expect(out.get('searchTerm')).toBe('trout');
    expect(out.get('position')).toBe('OF');
    expect(out.get('team')).toBe('LAA');
    expect(out.get('playerType')).toBe('hitter');
  });

  it('formats numeric filters per the URL contract', () => {
    // AVG → 3 decimals, ERA → 2 decimals, HR → integer string
    const out = buildStatsSearchParams({
      viewMode: 'combined',
      pageSize: 100,
      filters: {
        minHomeRuns: 30,
        minBattingAvg: 0.3,
        maxERA: 3.5,
      },
    });
    expect(out.get('minHomeRuns')).toBe('30');
    expect(out.get('minBattingAvg')).toBe('0.300');
    expect(out.get('maxERA')).toBe('3.50');
  });

  it('omits zero/empty filter fields', () => {
    // searchTerm: '' is falsy and should NOT appear; minHomeRuns: 0 IS defined
    // (consumer intent: "≥ 0") so it round-trips by design.
    const out = buildStatsSearchParams({
      viewMode: 'pitchers',
      pageSize: 10,
      filters: {
        searchTerm: '',
        minHomeRuns: 0,
      },
    });
    expect(out.has('searchTerm')).toBe(false);
    expect(out.get('minHomeRuns')).toBe('0');
  });

  it('produces a stable query string that round-trips through URLSearchParams', () => {
    const out = buildStatsSearchParams({
      viewMode: 'hitters',
      pageSize: 25,
      filters: { searchTerm: 'judge', maxERA: 4.25 },
    });
    const roundTripped = new URLSearchParams(out.toString());
    expect(roundTripped.get('view')).toBe('hitters');
    expect(roundTripped.get('searchTerm')).toBe('judge');
    expect(roundTripped.get('maxERA')).toBe('4.25');
  });
});
