import {
  formatPoints,
  formatScore,
  formatWinPercentage,
  getLeadingTeam,
  getScoreDeltaColor,
} from './scoreFormatting';

describe('formatPoints', () => {
  it('formats a typical point total with comma separator and one decimal', () => {
    expect(formatPoints(1548.2)).toBe('1,548.2');
  });

  it('formats a sub-thousand value', () => {
    expect(formatPoints(842.5)).toBe('842.5');
  });

  it('rounds to one decimal place', () => {
    expect(formatPoints(1234.0)).toBe('1,234.0');
    expect(formatPoints(1234.56)).toBe('1,234.6');
  });

  it('formats values under 100', () => {
    expect(formatPoints(87.3)).toBe('87.3');
  });

  it('returns placeholder for null', () => {
    expect(formatPoints(null)).toBe('—');
  });

  it('returns placeholder for undefined', () => {
    expect(formatPoints(undefined)).toBe('—');
  });

  it('returns placeholder for non-finite values', () => {
    expect(formatPoints(Infinity)).toBe('—');
    expect(formatPoints(NaN)).toBe('—');
  });

  it('accepts a custom placeholder', () => {
    expect(formatPoints(null, 'N/A')).toBe('N/A');
  });

  it('handles zero', () => {
    expect(formatPoints(0)).toBe('0.0');
  });
});

describe('formatScore', () => {
  it('formats a score to two decimal places', () => {
    expect(formatScore(127.5)).toBe('127.50');
  });

  it('returns placeholder for null', () => {
    expect(formatScore(null)).toBe('—');
  });

  it('returns placeholder for undefined', () => {
    expect(formatScore(undefined)).toBe('—');
  });
});

describe('formatWinPercentage', () => {
  it('formats a win percentage without leading zero', () => {
    expect(formatWinPercentage(0.667)).toBe('.667');
    expect(formatWinPercentage(0.833)).toBe('.833');
  });

  it('returns placeholder for null', () => {
    expect(formatWinPercentage(null)).toBe('—');
  });
});

describe('getScoreDeltaColor', () => {
  it('returns green for positive delta', () => {
    expect(getScoreDeltaColor(5)).toBe('$green10');
  });

  it('returns red for negative delta', () => {
    expect(getScoreDeltaColor(-3)).toBe('$red10');
  });

  it('returns gray for zero', () => {
    expect(getScoreDeltaColor(0)).toBe('$gray10');
  });
});

describe('getLeadingTeam', () => {
  it('returns 1 when team1 leads', () => {
    expect(getLeadingTeam(120, 100)).toBe(1);
  });

  it('returns 2 when team2 leads', () => {
    expect(getLeadingTeam(90, 110)).toBe(2);
  });

  it('returns 0 when tied', () => {
    expect(getLeadingTeam(100, 100)).toBe(0);
  });

  it('handles null/undefined as 0', () => {
    expect(getLeadingTeam(null, null)).toBe(0);
    expect(getLeadingTeam(5, undefined)).toBe(1);
  });
});
