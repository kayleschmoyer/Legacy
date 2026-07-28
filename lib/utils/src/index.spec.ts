import { formatDraftDate } from './index';

describe('Utils', () => {
  it('works', () => {
    expect(true).toBe(true);
  });
});

describe('formatDraftDate', () => {
  it('returns an empty string for null/undefined/invalid input', () => {
    expect(formatDraftDate(null)).toBe('');
    expect(formatDraftDate(undefined)).toBe('');
    expect(formatDraftDate('not-a-date')).toBe('');
  });

  it('formats a valid ISO timestamp using locale-aware formatting', () => {
    expect(formatDraftDate('2026-04-20T20:00:00.000Z')).toMatch(/Apr 20/);
  });

  it('falls back to a locale-independent format when toLocaleDateString throws', () => {
    // Simulates a Hermes release build without full ICU/Intl data, where
    // toLocaleDateString is undefined and calling it throws (LS-8755).
    const spy = jest
      .spyOn(Date.prototype, 'toLocaleDateString')
      .mockImplementation(() => {
        throw new TypeError('undefined is not a function');
      });
    try {
      expect(formatDraftDate('2026-04-20T20:00:00.000Z')).toBe(
        '2026-04-20 20:00',
      );
    } finally {
      spy.mockRestore();
    }
  });
});

export {};
