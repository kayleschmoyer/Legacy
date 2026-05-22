import { randomBytes } from 'crypto';

jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn().mockResolvedValue(randomBytes(32).toString('base64')),
}));

import { encryptCookies } from './cookie';

describe('encryptCookies', () => {
  it('returns one well-formed Set-Cookie string per cookie entry', async () => {
    const cookies = await encryptCookies({
      GOOGLE_JWT: 'id-token-value',
      'legacy-sports-internal-jwt': 'internal-jwt-value',
      GOOGLE_REFRESH_TOKEN: 'refresh-token-value',
    });

    expect(cookies).toHaveLength(3);

    // Each string must carry exactly one cookie name=value followed by attributes —
    // not multiple name=value pairs joined by `;` (RFC 6265 violation that silently
    // drops every cookie after the first).
    expect(cookies[0]).toMatch(
      /^GOOGLE_JWT=.+; HttpOnly; Secure; SameSite=Strict; Path=\/$/,
    );
    expect(cookies[1]).toMatch(
      /^legacy-sports-internal-jwt=.+; HttpOnly; Secure; SameSite=Strict; Path=\/$/,
    );
    expect(cookies[2]).toMatch(
      /^GOOGLE_REFRESH_TOKEN=.+; HttpOnly; Secure; SameSite=Strict; Path=\/$/,
    );

    for (const cookie of cookies) {
      const [head] = cookie.split(';');
      const value = head.substring(head.indexOf('=') + 1);
      // Cookie values must not embed `;` — that would terminate the value and turn
      // anything that follows into a (malformed) attribute.
      expect(value).not.toContain(';');
    }
  });

  it('emits an empty value for null / undefined entries (no encryption)', async () => {
    const cookies = await encryptCookies({
      GOOGLE_REFRESH_TOKEN: '',
      MISSING: null,
      ALSO_MISSING: undefined,
    });

    expect(cookies).toEqual([
      'GOOGLE_REFRESH_TOKEN=""; HttpOnly; Secure; SameSite=Strict; Path=/',
      'MISSING=""; HttpOnly; Secure; SameSite=Strict; Path=/',
      'ALSO_MISSING=""; HttpOnly; Secure; SameSite=Strict; Path=/',
    ]);
  });
});
