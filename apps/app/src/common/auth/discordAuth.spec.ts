import {
  DISCORD_REDIRECT_URI,
  DISCORD_SIGN_IN_CANCELLED,
  signInWithDiscord,
} from './discordAuth';

// ── Mocks (jest.mock calls are hoisted above the imports) ───────────────────

const mockGetRandomBytesAsync = jest.fn();
const mockDigestStringAsync = jest.fn();
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: (...args: unknown[]): unknown =>
    mockGetRandomBytesAsync(...args),
  digestStringAsync: (...args: unknown[]): unknown =>
    mockDigestStringAsync(...args),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
}));

const mockOpenAuthSessionAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (...args: unknown[]): unknown =>
    mockOpenAuthSessionAsync(...args),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Test constants ──────────────────────────────────────────────────────────

const CLIENT_ID = 'discord-client-id';
// Deterministic random bytes: verifier from 32 × 0x01, state from 16 × 0xab.
const VERIFIER_HEX = '01'.repeat(32);
const STATE_HEX = 'ab'.repeat(16);

function fill(byteCount: number, value: number): Uint8Array {
  return new Uint8Array(byteCount).fill(value);
}

function successUrl(params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${DISCORD_REDIRECT_URI}?${query}`;
}

describe('signInWithDiscord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRandomBytesAsync.mockImplementation((count: number) =>
      Promise.resolve(count === 32 ? fill(32, 0x01) : fill(16, 0xab)),
    );
    // Standard base64 with +,/,= so we can assert URL-safe conversion.
    mockDigestStringAsync.mockResolvedValue('ab+/cd==');
  });

  it('opens the system browser with a PKCE S256 authorize URL and returns the code + verifier', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: successUrl({ code: 'disc-code', state: STATE_HEX }),
    });

    const result = await signInWithDiscord(CLIENT_ID);

    expect(result).toEqual({
      code: 'disc-code',
      codeVerifier: VERIFIER_HEX,
      redirectUri: DISCORD_REDIRECT_URI,
    });

    // The challenge is SHA-256 of the verifier, base64url-encoded (no +,/,=).
    expect(mockDigestStringAsync).toHaveBeenCalledWith(
      'SHA-256',
      VERIFIER_HEX,
      {
        encoding: 'base64',
      },
    );

    const [authUrl, redirectUri] = mockOpenAuthSessionAsync.mock.calls[0] as [
      string,
      string,
    ];
    expect(redirectUri).toBe(DISCORD_REDIRECT_URI);
    expect(authUrl).toContain('https://discord.com/api/oauth2/authorize?');
    expect(authUrl).toContain(`client_id=${CLIENT_ID}`);
    expect(authUrl).toContain('code_challenge=ab-_cd');
    expect(authUrl).toContain('code_challenge_method=S256');
    expect(authUrl).toContain('scope=identify%20email');
    expect(authUrl).toContain(
      `redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}`,
    );
    expect(authUrl).toContain(`state=${STATE_HEX}`);
  });

  it('throws a cancellation error when the user dismisses the browser', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(signInWithDiscord(CLIENT_ID)).rejects.toMatchObject({
      code: DISCORD_SIGN_IN_CANCELLED,
    });
  });

  it('throws a denial error when Discord returns an error parameter', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: successUrl({ error: 'access_denied', state: STATE_HEX }),
    });

    await expect(signInWithDiscord(CLIENT_ID)).rejects.toMatchObject({
      code: 'DISCORD_SIGN_IN_DENIED',
    });
  });

  it('throws when no authorization code is returned', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: successUrl({ state: STATE_HEX }),
    });

    await expect(signInWithDiscord(CLIENT_ID)).rejects.toMatchObject({
      code: 'DISCORD_SIGN_IN_FAILED',
    });
  });

  it('throws on a state mismatch (stale/replayed redirect)', async () => {
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: successUrl({ code: 'disc-code', state: 'not-the-state' }),
    });

    await expect(signInWithDiscord(CLIENT_ID)).rejects.toMatchObject({
      code: 'DISCORD_SIGN_IN_STATE_MISMATCH',
    });
  });
});
