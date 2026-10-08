/**
 * LS-10649 — `new Date(y, m, d)` maps years 0–99 to 1900–1999, so the
 * scoreboard heading rendered "0001-01-01" as January 1, 1901. The helpers
 * must keep the typed year as-is.
 */
import { formatDisplayDate, offsetDate } from './dateUtils';

describe('scoreboard dateUtils', () => {
  it('formats a year below 100 without remapping it to the 1900s', () => {
    const display = formatDisplayDate('0001-01-01');
    expect(display).not.toContain('1901');
    expect(display).toMatch(/\b1\b/);
    expect(display).toContain('January');
  });

  it('formats a regular date', () => {
    expect(formatDisplayDate('2026-04-01')).toContain('2026');
  });

  it('round-trips and shifts years below 100 as zero-padded strings', () => {
    expect(offsetDate('0001-01-01', 0)).toBe('0001-01-01');
    expect(offsetDate('0001-01-01', 1)).toBe('0001-01-02');
    expect(offsetDate('0100-01-01', -1)).toBe('0099-12-31');
  });

  it('shifts regular dates across month and year boundaries', () => {
    expect(offsetDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(offsetDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});
