/**
 * Unit tests for the Player Comparison stat helpers (LS-7804). The comparison
 * UI is exercised end-to-end by apps/web-e2e/player-comparison.spec.ts; here we
 * verify the pure formatting/leader-detection logic that drives the "best"
 * highlighting and value rendering — the extract-and-test pattern used across
 * the players feature (see PlayersStatsTable.spec.tsx).
 */
import {
  bestIndex,
  fmt,
  fmtAvg,
  fmtCount,
  fmtScoreRow,
  tiedIndices,
} from './PlayerComparison';

describe('fmt', () => {
  it('renders an em dash for nullish values', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
  });

  it('formats integers with thousands separators by default', () => {
    expect(fmt(1234567)).toBe('1,234,567');
    expect(fmt(0)).toBe('0');
  });

  it('honors a fixed decimal count when requested', () => {
    expect(fmt(2.5, 1)).toBe('2.5');
    expect(fmt(3, 2)).toBe('3.00');
  });
});

describe('fmtAvg', () => {
  it('renders an em dash for nullish values', () => {
    expect(fmtAvg(null)).toBe('—');
    expect(fmtAvg(undefined)).toBe('—');
  });

  it('drops the leading zero for sub-1.000 rate stats', () => {
    expect(fmtAvg(0.282)).toBe('.282');
    expect(fmtAvg(0.3)).toBe('.300');
  });

  it('formats values >= 1 as 3-decimal strings (no silent integer truncation)', () => {
    expect(fmtAvg(1)).toBe('1.000');
    expect(fmtAvg(1.012)).toBe('1.012');
  });
});

describe('fmtCount', () => {
  it('renders an em dash for nullish values (true absence of data)', () => {
    expect(fmtCount(null)).toBe('—');
    expect(fmtCount(undefined)).toBe('—');
  });

  it('renders "0" for a confirmed zero count — not a dash', () => {
    expect(fmtCount(0)).toBe('0');
  });

  it('renders positive integer counts as strings', () => {
    expect(fmtCount(3)).toBe('3');
    expect(fmtCount(14)).toBe('14');
  });
});

describe('fmtScoreRow', () => {
  it('uses 1 decimal place when any value is ≥ 1', () => {
    expect(fmtScoreRow([12.5, 8.3])).toEqual(['12.5', '8.3']);
  });

  it('uses 2 decimal places when all non-null values are < 1 — distinguishes micro-differences', () => {
    expect(fmtScoreRow([0.04, 0.0])).toEqual(['0.04', '0.00']);
  });

  it('renders "—" for null/undefined entries regardless of precision tier', () => {
    expect(fmtScoreRow([null, 0.5, undefined])).toEqual(['—', '0.50', '—']);
  });

  it('defaults to 1 decimal when all values are null (no non-null max to compare)', () => {
    // All nulls → all dashes; decimals choice is irrelevant but must not throw.
    expect(fmtScoreRow([null, null])).toEqual(['—', '—']);
  });

  it('uses 2 decimals when the mix of null and sub-1 values — null does not pollute max', () => {
    expect(fmtScoreRow([null, 0.04, 0.08])).toEqual(['—', '0.04', '0.08']);
  });

  it('uses 1 decimal when values span both sides of 1 (mixed precision not needed)', () => {
    expect(fmtScoreRow([0.04, 1.5])).toEqual(['0.0', '1.5']);
  });
});

describe('bestIndex', () => {
  it('returns null when no valid values are present', () => {
    expect(bestIndex([])).toBeNull();
    expect(bestIndex([null, undefined])).toBeNull();
  });

  it('returns the index of the sole valid value when only one player has data', () => {
    expect(bestIndex([5, null, undefined])).toBe(0);
    expect(bestIndex([null, 40, undefined])).toBe(1);
  });

  it('returns the index of the highest value by default', () => {
    expect(bestIndex([10, 25, 18])).toBe(1);
  });

  it('returns the index of the lowest value when lowerIsBetter', () => {
    expect(bestIndex([3.2, 2.9, 4.1], true)).toBe(1);
  });

  it('returns null on a tie (no single leader)', () => {
    expect(bestIndex([20, 20, 5])).toBeNull();
  });

  it('ignores nullish values when picking the leader', () => {
    expect(bestIndex([null, 40, 12, undefined])).toBe(1);
  });

  it('treats 0 as a valid value, not as absent data', () => {
    expect(bestIndex([0, 3, 1])).toBe(1);
    expect(bestIndex([0, 0])).toBeNull();
  });
});

describe('tiedIndices', () => {
  it('returns empty array when fewer than two valid values are present', () => {
    expect(tiedIndices([5, null, undefined])).toEqual([]);
    expect(tiedIndices([])).toEqual([]);
  });

  it('returns empty array when there is a unique leader', () => {
    expect(tiedIndices([10, 25, 18])).toEqual([]);
    expect(tiedIndices([3.2, 2.9, 4.1], true)).toEqual([]);
  });

  it('returns indices of all players tied for best', () => {
    expect(tiedIndices([50, 50, 10])).toEqual([0, 1]);
  });

  it('handles a 3-way tie', () => {
    expect(tiedIndices([20, 20, 20])).toEqual([0, 1, 2]);
  });

  it('handles ties when lowerIsBetter', () => {
    expect(tiedIndices([2.5, 2.5, 4.1], true)).toEqual([0, 1]);
  });

  it('ignores nullish values when detecting ties', () => {
    expect(tiedIndices([null, 40, 40, undefined])).toEqual([1, 2]);
  });
});
