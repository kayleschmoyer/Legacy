jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn(),
}));

import { MLB_CHANNEL_ID, parseIsoDurationSeconds } from './youtube-api';

describe('MLB_CHANNEL_ID', () => {
  // A malformed id makes search.list silently return zero hits, so every
  // player resolves to the graphic fallback with no error (LS-10637).
  it('is a well-formed YouTube channel id (UC + 22 id chars)', () => {
    expect(MLB_CHANNEL_ID).toMatch(/^UC[A-Za-z0-9_-]{22}$/);
  });

  it("is MLB's official channel (youtube.com/@MLB)", () => {
    expect(MLB_CHANNEL_ID).toBe('UCoLrcjPV5PbUrUyXq5mjc_A');
  });
});

describe('parseIsoDurationSeconds', () => {
  it.each([
    ['PT32S', 32],
    ['PT1M5S', 65],
    ['PT2M', 120],
    ['PT1H2M3S', 3723],
    ['P1DT2H', 93600],
  ])('parses %s to %i seconds', (input, expected) => {
    expect(parseIsoDurationSeconds(input)).toBe(expected);
  });

  it.each([[undefined], [''], ['P0D'], ['PT'], ['32 seconds']])(
    'returns null for %p (missing, live, or unparseable)',
    (input) => {
      expect(parseIsoDurationSeconds(input)).toBeNull();
    },
  );
});
