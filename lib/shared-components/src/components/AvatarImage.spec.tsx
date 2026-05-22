import {
  deriveInitials,
  resolveSize,
  SIZE_MAP,
  usernameToHue,
} from './avatar-image-utils';

describe('resolveSize', () => {
  it('returns the SIZE_MAP entry for each token', () => {
    for (const token of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
      expect(resolveSize(token)).toEqual(SIZE_MAP[token]);
    }
  });

  it('derives px/font/icon from a numeric size', () => {
    expect(resolveSize(40)).toEqual({ px: 40, font: 16, icon: 18 });
    expect(resolveSize(100)).toEqual({ px: 100, font: 40, icon: 45 });
  });

  it('floors font/icon at 10 for tiny numeric sizes', () => {
    const tiny = resolveSize(8);
    expect(tiny.px).toBe(8);
    expect(tiny.font).toBe(10);
    expect(tiny.icon).toBe(10);
  });

  it('SIZE_MAP exposes the design-spec pixel scale', () => {
    expect(SIZE_MAP.xs.px).toBe(24);
    expect(SIZE_MAP.sm.px).toBe(32);
    expect(SIZE_MAP.md.px).toBe(44);
    expect(SIZE_MAP.lg.px).toBe(64);
    expect(SIZE_MAP.xl.px).toBe(88);
  });
});

describe('deriveInitials', () => {
  it('returns "" for null/undefined/empty', () => {
    expect(deriveInitials(null)).toBe('');
    expect(deriveInitials(undefined)).toBe('');
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
  });

  it('returns a single initial for one-word names', () => {
    expect(deriveInitials('brad')).toBe('B');
    expect(deriveInitials('Alice')).toBe('A');
  });

  it('returns first + last initials for multi-word names', () => {
    expect(deriveInitials('Brad Krupa')).toBe('BK');
    expect(deriveInitials('jane doe')).toBe('JD');
    expect(deriveInitials('Mary Jane Watson')).toBe('MW');
  });

  it('collapses internal whitespace', () => {
    expect(deriveInitials('  Brad   Krupa  ')).toBe('BK');
  });
});

describe('usernameToHue', () => {
  it('is deterministic for the same input', () => {
    expect(usernameToHue('brad')).toBe(usernameToHue('brad'));
  });

  it('returns a value in [0, 360)', () => {
    for (const name of ['', 'a', 'Brad Krupa', '🙂', 'long-name-here']) {
      const hue = usernameToHue(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});
