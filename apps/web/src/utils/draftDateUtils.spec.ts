import {
  formatDateAsUTC,
  formatDraftDate,
  formatUtcOffset,
} from './draftDateUtils';

describe('formatUtcOffset', () => {
  it('formats positive offsets', () => {
    expect(formatUtcOffset(300)).toBe('UTC+05:00');
    expect(formatUtcOffset(330)).toBe('UTC+05:30');
    expect(formatUtcOffset(60)).toBe('UTC+01:00');
  });

  it('formats zero offset', () => {
    expect(formatUtcOffset(0)).toBe('UTC+00:00');
  });

  it('formats negative offsets', () => {
    expect(formatUtcOffset(-300)).toBe('UTC-05:00');
    expect(formatUtcOffset(-330)).toBe('UTC-05:30');
  });
});

describe('formatDraftDate', () => {
  it('returns fallback text when no date given', () => {
    expect(formatDraftDate(undefined)).toBe('whenever you schedule it');
  });

  it('returns a non-empty string for a valid date', () => {
    const d = new Date('2025-10-01T18:00:00');
    expect(formatDraftDate(d).length).toBeGreaterThan(0);
  });
});

describe('formatDateAsUTC', () => {
  it('appends UTC suffix', () => {
    const d = new Date('2025-04-01T15:00:00Z');
    expect(formatDateAsUTC(d)).toMatch(/UTC$/);
  });

  it('formats consistently regardless of local timezone (uses UTC option)', () => {
    const d = new Date('2025-06-15T20:30:00Z');
    const result = formatDateAsUTC(d);
    expect(result).toContain('8:30 PM');
    expect(result).toContain('Jun');
    expect(result).toContain('15');
  });
});
