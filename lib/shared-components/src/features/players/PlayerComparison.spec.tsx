/**
 * Unit tests for the Player Comparison stat helpers (LS-7804). The comparison
 * UI is exercised end-to-end by apps/web-e2e/player-comparison.spec.ts; here we
 * verify the pure formatting/leader-detection logic that drives the "best"
 * highlighting and value rendering — the extract-and-test pattern used across
 * the players feature (see PlayersStatsTable.spec.tsx).
 */
import { bestIndex, fmt, fmtAvg, fmtCount } from './PlayerComparison';

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
