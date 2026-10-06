import { parseDefaultSport } from './defaultSport';

describe('parseDefaultSport', () => {
  it("returns 'football' when stored", () => {
    expect(
      parseDefaultSport(JSON.stringify({ defaultSport: 'football' })),
    ).toBe('football');
  });

  it("returns 'both' when stored (LS-7100)", () => {
    expect(parseDefaultSport(JSON.stringify({ defaultSport: 'both' }))).toBe(
      'both',
    );
  });

  it("returns 'baseball' when stored", () => {
    expect(
      parseDefaultSport(JSON.stringify({ defaultSport: 'baseball' })),
    ).toBe('baseball');
  });

  it.each([null, undefined, ''])("falls back to 'baseball' for %p", (raw) => {
    expect(parseDefaultSport(raw)).toBe('baseball');
  });

  it.each([
    '{not valid json',
    'null',
    '[]',
    JSON.stringify({ theme: 'dark' }),
    JSON.stringify({ defaultSport: 'hockey' }),
    JSON.stringify({ defaultSport: 42 }),
  ])("falls back to 'baseball' for %s", (raw) => {
    expect(parseDefaultSport(raw)).toBe('baseball');
  });
});
