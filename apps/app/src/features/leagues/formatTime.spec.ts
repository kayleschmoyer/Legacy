import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('parses ISO 8601 with Z suffix', () => {
    const result = formatTime('2026-04-07T14:30:00Z');
    expect(result).not.toBe('--:--');
    expect(typeof result).toBe('string');
  });

  it('parses ISO 8601 with positive UTC offset', () => {
    const result = formatTime('2026-04-07T14:30:00+05:00');
    expect(result).not.toBe('--:--');
  });

  it('parses ISO 8601 with negative UTC offset', () => {
    const result = formatTime('2026-04-07T14:30:00-05:00');
    expect(result).not.toBe('--:--');
  });

  it('parses SQL-style timestamp without timezone (assumes UTC)', () => {
    const result = formatTime('2026-04-07 14:30:00');
    expect(result).not.toBe('--:--');
    // Verify it matches the same UTC time as an explicit Z string
    expect(result).toBe(formatTime('2026-04-07T14:30:00Z'));
  });

  it('parses SQL-style timestamp with offset', () => {
    // This was the bug: space before '+' caused the old code to treat it as a
    // plain SQL string and append 'Z', producing 'Invalid Date'.
    const result = formatTime('2026-04-07 14:30:00+05:00');
    expect(result).not.toBe('--:--');
    // Must match the explicit-T equivalent
    expect(result).toBe(formatTime('2026-04-07T14:30:00+05:00'));
  });

  it('parses SQL-style timestamp with negative offset', () => {
    const result = formatTime('2026-04-07 14:30:00-05:00');
    expect(result).not.toBe('--:--');
    expect(result).toBe(formatTime('2026-04-07T14:30:00-05:00'));
  });

  it('returns --:-- for an empty string', () => {
    expect(formatTime('')).toBe('--:--');
  });

  it('returns --:-- for a completely invalid string', () => {
    expect(formatTime('not-a-date')).toBe('--:--');
  });
});
