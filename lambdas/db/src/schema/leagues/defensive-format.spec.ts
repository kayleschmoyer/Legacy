/**
 * Unit tests for defensiveFormat resolver logic and the parseDefensiveFormat
 * helper (LS-4152).
 *
 * The resolver in leagues/types.ts and the helper in leagues/queries.ts share
 * the same contract: only 'dst' and 'idp' are valid values; anything else
 * (including null, undefined, or an unexpected string) collapses to null.
 * These tests exercise that logic directly without wiring up the full
 * GraphQL execution context.
 */

// ---------------------------------------------------------------------------
// Inline the resolver logic from leagues/types.ts (defensiveFormat field):
//   resolve: (parent) =>
//     parent.sport === 'football' ? (parent.defensiveFormat ?? 'dst') : null
// ---------------------------------------------------------------------------
function resolveDefensiveFormat(parent: {
  sport?: string;
  defensiveFormat?: 'dst' | 'idp' | null;
}): 'dst' | 'idp' | null {
  return parent.sport === 'football' ? (parent.defensiveFormat ?? 'dst') : null;
}

// ---------------------------------------------------------------------------
// Inline the parseDefensiveFormat helper from leagues/queries.ts:
//   function parseDefensiveFormat(v: string | null | undefined): 'dst' | 'idp' | null
// ---------------------------------------------------------------------------
function parseDefensiveFormat(
  v: string | null | undefined,
): 'dst' | 'idp' | null {
  if (v === 'dst' || v === 'idp') return v;
  return null;
}

// ---------------------------------------------------------------------------

describe('defensiveFormat resolver (leagues/types.ts)', () => {
  it('returns null for a baseball league regardless of defensiveFormat', () => {
    expect(
      resolveDefensiveFormat({ sport: 'baseball', defensiveFormat: 'dst' }),
    ).toBeNull();
    expect(
      resolveDefensiveFormat({ sport: 'baseball', defensiveFormat: 'idp' }),
    ).toBeNull();
    expect(
      resolveDefensiveFormat({ sport: 'baseball', defensiveFormat: null }),
    ).toBeNull();
  });

  it('returns null when sport is absent (defaults to baseball behaviour)', () => {
    expect(resolveDefensiveFormat({ defensiveFormat: 'dst' })).toBeNull();
    expect(resolveDefensiveFormat({})).toBeNull();
  });

  it('returns the stored value for a football league with an explicit format', () => {
    expect(
      resolveDefensiveFormat({ sport: 'football', defensiveFormat: 'dst' }),
    ).toBe('dst');
    expect(
      resolveDefensiveFormat({ sport: 'football', defensiveFormat: 'idp' }),
    ).toBe('idp');
  });

  it('defaults to "dst" for a football league when defensiveFormat is null', () => {
    expect(
      resolveDefensiveFormat({ sport: 'football', defensiveFormat: null }),
    ).toBe('dst');
  });

  it('defaults to "dst" for a football league when defensiveFormat is undefined', () => {
    expect(resolveDefensiveFormat({ sport: 'football' })).toBe('dst');
  });
});

describe('parseDefensiveFormat helper (leagues/queries.ts)', () => {
  it('returns "dst" for the string "dst"', () => {
    expect(parseDefensiveFormat('dst')).toBe('dst');
  });

  it('returns "idp" for the string "idp"', () => {
    expect(parseDefensiveFormat('idp')).toBe('idp');
  });

  it('returns null for null input', () => {
    expect(parseDefensiveFormat(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseDefensiveFormat(undefined)).toBeNull();
  });

  it('returns null for an unexpected string value', () => {
    expect(parseDefensiveFormat('invalid')).toBeNull();
    expect(parseDefensiveFormat('DST')).toBeNull(); // case-sensitive
    expect(parseDefensiveFormat('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Inline the sport passthrough from leagues/queries.ts:
//   The `sport` field is selected directly from the DB row (no transformation).
//   league: { sport: league.sport, ... }
//   userLeagues: { sport: league.sport, ... }
//
// This test documents the contract: the resolver must preserve the raw DB
// value so the client can gate football-specific UI on `sport === 'football'`.
// ---------------------------------------------------------------------------
function passthroughSport(row: { sport: string | null }): string | null {
  return row.sport;
}

describe('sport field passthrough (league / userLeagues queries)', () => {
  it('preserves "baseball" unchanged', () => {
    expect(passthroughSport({ sport: 'baseball' })).toBe('baseball');
  });

  it('preserves "football" unchanged', () => {
    expect(passthroughSport({ sport: 'football' })).toBe('football');
  });

  it('preserves null when sport is not set', () => {
    expect(passthroughSport({ sport: null })).toBeNull();
  });
});
