import { LOGGER } from '@legacy-sports/logging';
import {
  applyParamRenames,
  buildStatsSearchParams,
  migrateStatsSearchParams,
  parseClampedInt,
  parsePageSize,
  readStatsFormat,
  sanitizeSearchParam,
  URL_SCHEMA_VERSION,
} from './PlayerStatsPage';

const MAX_GRAPHQL_INT = 2147483647;
const PREFS_STORAGE_KEY = 'ls_user_preferences';

describe('parseClampedInt', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(LOGGER, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns in-range values unchanged without warning', () => {
    expect(parseClampedInt('30', 'minHomeRuns')).toBe(30);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns MAX_GRAPHQL_INT exactly without warning (boundary)', () => {
    expect(parseClampedInt(String(MAX_GRAPHQL_INT), 'minHomeRuns')).toBe(
      MAX_GRAPHQL_INT,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('clamps an overflowing value to MAX_GRAPHQL_INT', () => {
    // PST-102 repro: ?minHomeRuns=99999999999 was silently truncated to ~2B
    expect(parseClampedInt('99999999999', 'minHomeRuns')).toBe(MAX_GRAPHQL_INT);
  });

  it('warns when the clamp triggers (PST-102 / LS-7142)', () => {
    parseClampedInt('99999999999', 'minHomeRuns');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('minHomeRuns'),
      expect.objectContaining({
        paramName: 'minHomeRuns',
        requested: 99999999999,
        clampedTo: MAX_GRAPHQL_INT,
      }),
    );
  });

  it('passes NaN through unchanged without warning (no digits)', () => {
    expect(Number.isNaN(parseClampedInt('not-a-number', 'minHomeRuns'))).toBe(
      true,
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('readStatsFormat', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    localStorage.clear();
    warnSpy = jest.spyOn(LOGGER, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    localStorage.clear();
  });

  it('returns the stored preference when valid', () => {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ statsFormat: 'expanded' }),
    );
    expect(readStatsFormat()).toBe('expanded');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('defaults to standard when nothing is stored', () => {
    expect(readStatsFormat()).toBe('standard');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('defaults to standard for an unrecognized stored value without warning', () => {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({ statsFormat: 'bogus' }),
    );
    expect(readStatsFormat()).toBe('standard');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs a warning and falls back to standard when stored JSON is corrupted', () => {
    localStorage.setItem(PREFS_STORAGE_KEY, '{ not valid json');
    expect(readStatsFormat()).toBe('standard');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'readStatsFormat parse failed',
      expect.any(Error),
      expect.objectContaining({
        storageKey: PREFS_STORAGE_KEY,
      }),
    );
  });
});

describe('parsePageSize', () => {
  // AC3: valid allow-list values pass through unchanged.
  it('passes allow-list values through unchanged', () => {
    expect(parsePageSize('10')).toBe(10);
    expect(parsePageSize('25')).toBe(25);
    expect(parsePageSize('50')).toBe(50);
    expect(parsePageSize('100')).toBe(100);
  });

  // AC3: an absent param defaults to 25.
  it('defaults to 25 when the param is absent', () => {
    expect(parsePageSize(null)).toBe(25);
  });

  // AC1: out-of-allow-list numeric values fall back to 25.
  it('falls back to 25 for an out-of-allow-list value (PST-031: 99999)', () => {
    expect(parsePageSize('99999')).toBe(25);
  });

  it('falls back to 25 for a small out-of-allow-list value (PST-031: 7)', () => {
    expect(parsePageSize('7')).toBe(25);
  });

  // AC2: non-numeric input (parseInt → NaN) falls back to 25.
  it('falls back to 25 for non-numeric input (PST-031: abc → NaN)', () => {
    expect(parsePageSize('abc')).toBe(25);
  });

  it('falls back to 25 for an empty string', () => {
    expect(parsePageSize('')).toBe(25);
  });

  it('falls back to 25 for a numeric prefix that parseInt would coerce (e.g. "30abc")', () => {
    // parseInt('30abc') === 30 which is NOT in the allow-list, so it falls back.
    // (A prefix that parses to an allowed value, e.g. "25abc" → 25, would pass.)
    expect(parsePageSize('30abc')).toBe(25);
  });

  it('falls back to 25 for negative or zero values', () => {
    expect(parsePageSize('-25')).toBe(25);
    expect(parsePageSize('0')).toBe(25);
  });
});

describe('sanitizeSearchParam', () => {
  it('returns null for null input', () => {
    expect(sanitizeSearchParam(null)).toBeNull();
  });

  it('returns null for a string that is only control characters', () => {
    expect(sanitizeSearchParam('\x00\x01\x1f')).toBeNull();
  });

  it('passes through a clean alphanumeric string unchanged', () => {
    expect(sanitizeSearchParam('trout')).toBe('trout');
  });

  it('strips ASCII control characters (0x00–0x1f)', () => {
    expect(sanitizeSearchParam('abc\x00def\x1f')).toBe('abcdef');
  });

  it('strips DEL and C1 control characters (0x7f–0x9f)', () => {
    expect(sanitizeSearchParam('abc\x7fdef\x9f')).toBe('abcdef');
  });

  it('caps the result at 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeSearchParam(long)).toBe('a'.repeat(64));
  });

  it('strips control chars before capping length', () => {
    // 50 real chars + 20 control chars = 70 chars total; after stripping 20 controls, 50 remain < 64
    const value = 'a'.repeat(50) + '\x00'.repeat(20);
    expect(sanitizeSearchParam(value)).toBe('a'.repeat(50));
  });

  it('preserves printable special characters', () => {
    expect(sanitizeSearchParam('Mike Trout (OF)')).toBe('Mike Trout (OF)');
  });
});

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

  it('includes sport in URL when provided', () => {
    const mlb = buildStatsSearchParams({
      viewMode: 'combined',
      pageSize: 25,
      filters: {},
      sport: 'mlb',
    });
    expect(mlb.get('sport')).toBe('mlb');

    const nfl = buildStatsSearchParams({
      viewMode: 'combined',
      pageSize: 25,
      filters: {},
      sport: 'nfl',
    });
    expect(nfl.get('sport')).toBe('nfl');
  });

  it('omits sport from URL when not provided', () => {
    const out = buildStatsSearchParams({
      viewMode: 'combined',
      pageSize: 25,
      filters: {},
    });
    expect(out.has('sport')).toBe(false);
  });

  it('serializes keys in deterministic alphabetical order (PST-104)', () => {
    const out = buildStatsSearchParams({
      viewMode: 'combined',
      pageSize: 25,
      filters: {
        searchTerm: 'trout',
        position: 'OF',
        team: 'LAA',
        minHomeRuns: 30,
      },
      sport: 'mlb',
    });
    // Keys must be emitted alphabetically, not in insertion order. The schema
    // version flag `v` (URL_SCHEMA_VERSION) is part of every written URL and
    // sorts between `team` and `view`.
    expect(out.toString()).toBe(
      'minHomeRuns=30&pageSize=25&position=OF&searchTerm=trout&sport=mlb&team=LAA&v=1&view=combined',
    );
    expect([...out.keys()]).toEqual([
      'minHomeRuns',
      'pageSize',
      'position',
      'searchTerm',
      'sport',
      'team',
      'v',
      'view',
    ]);
  });

  it('produces identical query strings for equivalent filter states (PST-104)', () => {
    // Same logical state expressed with filters built in different orders must
    // serialize to the byte-identical URL so CDN caching / dedup works.
    const a = buildStatsSearchParams({
      viewMode: 'hitters',
      pageSize: 50,
      filters: { team: 'LAA', position: 'OF', searchTerm: 'trout' },
    });
    const b = buildStatsSearchParams({
      viewMode: 'hitters',
      pageSize: 50,
      filters: { searchTerm: 'trout', team: 'LAA', position: 'OF' },
    });
    expect(a.toString()).toBe(b.toString());
  });

  it('stamps the current URL schema version (v) on every written URL', () => {
    const out = buildStatsSearchParams({
      viewMode: 'combined',
      pageSize: 25,
      filters: {},
    });
    expect(out.get('v')).toBe(String(URL_SCHEMA_VERSION));
  });
});

describe('applyParamRenames', () => {
  it('relabels matching keys and preserves their values', () => {
    const out = applyParamRenames(
      new URLSearchParams('minHomeRuns=30&view=hitters'),
      { minHomeRuns: 'minHR' },
    );
    expect(out.get('minHR')).toBe('30');
    expect(out.has('minHomeRuns')).toBe(false);
    // Unmapped keys pass through untouched.
    expect(out.get('view')).toBe('hitters');
  });

  it('is a no-op when the rename map is empty', () => {
    const out = applyParamRenames(
      new URLSearchParams('minERA=3.5&team=NYY'),
      {},
    );
    expect(out.get('minERA')).toBe('3.5');
    expect(out.get('team')).toBe('NYY');
  });

  it('preserves repeated keys', () => {
    const out = applyParamRenames(new URLSearchParams('team=NYY&team=BOS'), {});
    expect(out.getAll('team')).toEqual(['NYY', 'BOS']);
  });
});

describe('migrateStatsSearchParams', () => {
  it('stamps v on an unversioned (legacy) URL and preserves filter values', () => {
    const out = migrateStatsSearchParams(
      new URLSearchParams('view=hitters&minHomeRuns=30&team=NYY'),
    );
    expect(out.get('v')).toBe(String(URL_SCHEMA_VERSION));
    // v1 renames nothing, so legacy keys/values round-trip unchanged.
    expect(out.get('view')).toBe('hitters');
    expect(out.get('minHomeRuns')).toBe('30');
    expect(out.get('team')).toBe('NYY');
  });

  it('passes a current-version URL through unchanged', () => {
    const out = migrateStatsSearchParams(
      new URLSearchParams(`v=${URL_SCHEMA_VERSION}&view=pitchers&maxERA=3.50`),
    );
    expect(out.get('v')).toBe(String(URL_SCHEMA_VERSION));
    expect(out.get('view')).toBe('pitchers');
    expect(out.get('maxERA')).toBe('3.50');
  });

  it('treats a garbage version flag as legacy', () => {
    const out = migrateStatsSearchParams(
      new URLSearchParams('v=not-a-number&minBattingAvg=0.300'),
    );
    expect(out.get('v')).toBe(String(URL_SCHEMA_VERSION));
    expect(out.get('minBattingAvg')).toBe('0.300');
  });

  it('does not downgrade a newer version written by a future client', () => {
    const future = URL_SCHEMA_VERSION + 5;
    const out = migrateStatsSearchParams(
      new URLSearchParams(`v=${future}&someFutureKey=1`),
    );
    expect(out.get('v')).toBe(String(future));
    expect(out.get('someFutureKey')).toBe('1');
  });

  it('returns a new instance without mutating the input', () => {
    const input = new URLSearchParams('view=combined');
    const out = migrateStatsSearchParams(input);
    expect(out).not.toBe(input);
    expect(input.has('v')).toBe(false);
  });
});
