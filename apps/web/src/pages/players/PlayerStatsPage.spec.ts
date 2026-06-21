import { LOGGER } from '@legacy-sports/logging';
import {
  applyParamRenames,
  buildExportPayload,
  buildStatsSearchParams,
  MAX_EXPORT_BYTES,
  migrateStatsSearchParams,
  parseClampedInt,
  parsePageSize,
  parseStatsSearchParams,
  readStatsFormat,
  sanitizeSearchParam,
  URL_SCHEMA_VERSION,
  utf8ByteLength,
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

  // PST-040 / LS-7120: the serializer used to write only minHomeRuns,
  // minBattingAvg, and maxERA, dropping every other filter the parser reads.
  // It must now write every filter key so deep links survive an edit.
  it('writes all hitter min/max filters the parser reads (PST-040)', () => {
    const out = buildStatsSearchParams({
      viewMode: 'hitters',
      pageSize: 25,
      filters: {
        minHomeRuns: 5,
        maxHomeRuns: 50,
        minRBI: 10,
        maxRBI: 120,
        minBattingAvg: 0.25,
        maxBattingAvg: 0.35,
      },
    });
    expect(out.get('minHomeRuns')).toBe('5');
    expect(out.get('maxHomeRuns')).toBe('50');
    expect(out.get('minRBI')).toBe('10');
    expect(out.get('maxRBI')).toBe('120');
    expect(out.get('minBattingAvg')).toBe('0.250');
    expect(out.get('maxBattingAvg')).toBe('0.350');
  });

  it('writes all pitcher min/max filters the parser reads (PST-040)', () => {
    const out = buildStatsSearchParams({
      viewMode: 'pitchers',
      pageSize: 25,
      filters: {
        minERA: 2.5,
        maxERA: 4,
        minWins: 5,
        maxWins: 25,
        minStrikeouts: 100,
        maxStrikeouts: 300,
      },
    });
    expect(out.get('minERA')).toBe('2.50');
    expect(out.get('maxERA')).toBe('4.00');
    expect(out.get('minWins')).toBe('5');
    expect(out.get('maxWins')).toBe('25');
    expect(out.get('minStrikeouts')).toBe('100');
    expect(out.get('maxStrikeouts')).toBe('300');
  });
});

describe('parseStatsSearchParams ↔ buildStatsSearchParams roundtrip', () => {
  // PST-040 / LS-7120: parser(serializer(state)) === state. Before the fix the
  // serializer dropped 9 of the 12 numeric filters, so any deep-linked filter
  // was silently lost the moment another control fired onFiltersChange.
  it('losslessly round-trips every filter the page supports', () => {
    const state = {
      viewMode: 'pitchers' as const,
      pageSize: 50,
      filters: {
        // Hitter filters — AVG values chosen to survive 3-decimal formatting.
        minHomeRuns: 5,
        maxHomeRuns: 50,
        minRBI: 10,
        maxRBI: 120,
        minBattingAvg: 0.25,
        maxBattingAvg: 0.35,
        // Pitcher filters — the keys PST-040 reported lost; ERA values chosen to
        // survive 2-decimal formatting.
        minERA: 2.5,
        maxERA: 4,
        minWins: 5,
        maxWins: 25,
        minStrikeouts: 100,
        maxStrikeouts: 300,
        // Player-info string filters.
        position: 'OF',
        team: 'NYY',
        playerType: 'pitcher',
        searchTerm: 'cole',
      },
    };

    const parsed = parseStatsSearchParams(buildStatsSearchParams(state));

    expect(parsed.viewMode).toBe(state.viewMode);
    expect(parsed.pageSize).toBe(state.pageSize);
    expect(parsed.filters).toEqual(state.filters);
  });

  it('round-trips a pitcher-only deep link without dropping filters (PST-040 repro)', () => {
    // The exact repro from the ticket: ?view=pitchers&minWins=20&maxERA=3.5 must
    // survive being re-serialized after a filter is touched.
    const initial = parseStatsSearchParams(
      new URLSearchParams('view=pitchers&minWins=20&maxERA=3.5'),
    );
    expect(initial.filters.minWins).toBe(20);
    expect(initial.filters.maxERA).toBe(3.5);

    // Re-serialize the parsed state (what handleFiltersChange does on any change)
    // and confirm minWins is still present.
    const reserialized = buildStatsSearchParams({
      viewMode: initial.viewMode,
      pageSize: initial.pageSize,
      filters: initial.filters,
    });
    expect(reserialized.get('minWins')).toBe('20');
    expect(reserialized.get('maxERA')).toBe('3.50');
  });
});

describe('utf8ByteLength', () => {
  it('counts ASCII as one byte per char', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('')).toBe(0);
  });

  it('counts 2-byte characters (e.g. é)', () => {
    expect(utf8ByteLength('é')).toBe(2);
  });

  it('counts 3-byte characters (e.g. €)', () => {
    expect(utf8ByteLength('€')).toBe(3);
  });

  it('counts 4-byte surrogate-pair characters once (e.g. 😀)', () => {
    // '😀' is two UTF-16 code units (a surrogate pair) but a single 4-byte
    // UTF-8 sequence — it must not be double-counted.
    expect('😀'.length).toBe(2);
    expect(utf8ByteLength('😀')).toBe(4);
  });

  it('sums mixed-width content', () => {
    expect(utf8ByteLength('a€😀')).toBe(1 + 3 + 4);
  });
});

describe('buildExportPayload', () => {
  const FIXED_TS = '2026-06-21T00:00:00.000Z';

  // AC3: within-cap exports serialize correctly and round-trip.
  it('serializes the export payload with filters, viewMode and metadata', () => {
    const { ok, json, bytes } = buildExportPayload(
      { searchTerm: 'trout', position: 'OF' },
      'hitters',
      FIXED_TS,
    );
    expect(ok).toBe(true);
    expect(bytes).toBeGreaterThan(0);
    const parsed = JSON.parse(json) as {
      viewMode: string;
      filters: Record<string, unknown>;
      exportedAt: string;
      totalFilters: number;
    };
    expect(parsed.viewMode).toBe('hitters');
    expect(parsed.filters).toEqual({ searchTerm: 'trout', position: 'OF' });
    expect(parsed.exportedAt).toBe(FIXED_TS);
    expect(parsed.totalFilters).toBe(2);
  });

  // AC1/AC3: a realistic filtered export is comfortably within the cap.
  it('reports ok for a realistic small payload', () => {
    const { ok } = buildExportPayload({}, 'combined', FIXED_TS);
    expect(ok).toBe(true);
  });

  // AC1/AC2: an oversized payload is flagged as not ok so the caller can refuse.
  it('flags a payload that exceeds MAX_EXPORT_BYTES as not ok (PST-012)', () => {
    // Inflate the payload past the cap via an oversized filter value.
    const huge = 'x'.repeat(MAX_EXPORT_BYTES + 1);
    const { ok, bytes } = buildExportPayload(
      { searchTerm: huge },
      'combined',
      FIXED_TS,
    );
    expect(bytes).toBeGreaterThan(MAX_EXPORT_BYTES);
    expect(ok).toBe(false);
  });

  // Byte length (not string length) is used so multi-byte chars are counted.
  it('measures size in UTF-8 bytes, not string length', () => {
    // '😀' is 1 string code point but 4 UTF-8 bytes; a 2-char surrogate pair.
    const { bytes } = buildExportPayload(
      { searchTerm: '😀' },
      'combined',
      FIXED_TS,
    );
    const charLength = JSON.stringify(
      {
        viewMode: 'combined',
        filters: { searchTerm: '😀' },
        exportedAt: FIXED_TS,
        totalFilters: 1,
      },
      null,
      2,
    ).length;
    // UTF-8 byte count exceeds the JS string length for multi-byte content.
    expect(bytes).toBeGreaterThan(charLength);
  });

  it('defaults exportedAt to an ISO timestamp when omitted', () => {
    const { json } = buildExportPayload({}, 'combined');
    const parsed = JSON.parse(json) as { exportedAt: string };
    expect(parsed.exportedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
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
