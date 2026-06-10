import { APIGatewayEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { setInitialAvatarUrl } from '@legacy-sports/db-client';
import {
  checkDiscordRedirectUriConfig,
  handleDiscordAuth,
  handleDiscordAuthorize,
  handleDiscordLink,
  handleDiscordUnlink,
} from './Discord';
import { resolveOrCreateUser } from './resolveOrCreateUser';
import { linkProviderIdentity, unlinkProviderIdentity } from './IdentityLink';
import { verifyOauthState } from '../util/oauth-state';
import {
  getAuthenticatedUserId,
  requireCsrf,
} from '../util/authenticated-request';
import { notifyNewUserSignup } from '../util/discord';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn().mockResolvedValue('test-client-secret'),
}));

// The shared resolver and the provider-agnostic link core are unit-tested in
// their own specs; here we mock them so the handler tests focus on token
// exchange, OAuth-state handling, cookies, and result mapping.
jest.mock('@legacy-sports/db-client', () => ({
  setInitialAvatarUrl: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./resolveOrCreateUser', () => ({
  resolveOrCreateUser: jest.fn(),
}));

jest.mock('./IdentityLink', () => ({
  linkProviderIdentity: jest.fn(),
  unlinkProviderIdentity: jest.fn(),
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn((cb: (db: unknown) => Promise<unknown>) => cb({})),
}));

jest.mock('../util/jwt', () => ({
  createJwt: jest.fn().mockResolvedValue('mock-jwt'),
  JWT_COOKIE_NAME: 'legacy-sports-internal-jwt',
}));

jest.mock('../util/cookie', () => ({
  encryptCookies: jest.fn().mockResolvedValue(['encrypted-cookie']),
}));

jest.mock('../util/jwt-cookie', () => ({
  buildAuthCookies: jest.fn().mockReturnValue(['auth-cookie']),
  generateCsrfToken: jest.fn().mockReturnValue('csrf-token'),
}));

jest.mock('../util/authenticated-request', () => ({
  getAuthenticatedUserId: jest.fn().mockResolvedValue(42),
  requireCsrf: jest.fn().mockReturnValue(null),
}));

jest.mock('../util/oauth-state', () => ({
  buildOauthStateCookie: jest.fn(
    (_token: string, name = 'ls_oauth_state') => `${name}=stub`,
  ),
  buildClearOauthStateCookie: jest.fn(
    (name = 'ls_oauth_state') => `${name}=; Max-Age=0`,
  ),
  generateOauthState: jest.fn().mockReturnValue('mock-state-token'),
  verifyOauthState: jest.fn(),
  OAUTH_STATE_COOKIE_LOGIN: 'ls_oauth_state_login',
  OAUTH_STATE_COOKIE_LINK: 'ls_oauth_state_link',
}));

jest.mock('../util/discord', () => ({
  notifyNewUserSignup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../util', () => ({
  DiscordEnv: {
    DISCORD_CLIENT_ID: 'DISCORD_CLIENT_ID',
    DISCORD_REDIRECT_URI: 'DISCORD_REDIRECT_URI',
    DISCORD_NATIVE_REDIRECT_URIS: 'DISCORD_NATIVE_REDIRECT_URIS',
    DISCORD_REDIRECT_URI_ALLOWED_ORIGINS:
      'DISCORD_REDIRECT_URI_ALLOWED_ORIGINS',
  },
  Secret: {
    DISCORD_CLIENT_SECRET: 'DISCORD_CLIENT_SECRET',
    JWT_SECRET: 'JWT_SECRET',
  },
  SECRET_CONFIG: {
    DISCORD_CLIENT_SECRET: { name: 'discord-client-secret' },
    JWT_SECRET: { name: 'jwt-secret' },
  },
}));

const mockVerifyOauthState = verifyOauthState as jest.MockedFunction<
  typeof verifyOauthState
>;
const mockResolveOrCreateUser = resolveOrCreateUser as jest.MockedFunction<
  typeof resolveOrCreateUser
>;
const mockLinkProviderIdentity = linkProviderIdentity as jest.MockedFunction<
  typeof linkProviderIdentity
>;
const mockUnlinkProviderIdentity =
  unlinkProviderIdentity as jest.MockedFunction<typeof unlinkProviderIdentity>;
const mockSetInitialAvatarUrl = setInitialAvatarUrl as jest.MockedFunction<
  typeof setInitialAvatarUrl
>;
const mockNotifyNewUserSignup = notifyNewUserSignup as jest.MockedFunction<
  typeof notifyNewUserSignup
>;
const mockGetAuthenticatedUserId =
  getAuthenticatedUserId as jest.MockedFunction<typeof getAuthenticatedUserId>;
const mockRequireCsrf = requireCsrf as jest.MockedFunction<typeof requireCsrf>;

const mockUser = {
  id: 99,
  email: 'discord@example.com',
  username: 'discorduser',
  accessLevel: 'none' as const,
  passwordHash: null,
  avatarUrl: null,
  privacyPolicyAcceptedAt: null,
  subscriptionTier: 'free' as const,
  discordId: 'discord-123',
  discordUsername: 'DiscordUser',
  discordAvatar: null,
  themePreference: null,
  lastLoginAt: null,
  mfaEnabled: false,
  canonicalEmailSource: 'discord' as const,
  passwordResetToken: null,
  passwordResetExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function resolvedOk(
  outcome: 'returning_identity' | 'auto_linked' | 'new_user',
): Awaited<ReturnType<typeof resolveOrCreateUser>> {
  return { status: 'ok', user: mockUser, outcome };
}

function makeDiscordTokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'mock-access-token' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeDiscordUserResponse(
  overrides: Partial<{ email: string; verified: boolean }> = {},
): Response {
  return new Response(
    JSON.stringify({
      id: 'discord-123',
      username: 'DiscordUser',
      email: overrides.email ?? 'discord@example.com',
      avatar: null,
      verified: overrides.verified ?? true,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeEvent(body: unknown): APIGatewayEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/oauth/discord',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      stage: 'dev',
      domainName: 'localhost',
    } as APIGatewayEvent['requestContext'],
    resource: '',
  };
}

describe('handleDiscordAuth', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
    process.env['DISCORD_REDIRECT_URI'] = 'https://example.com/callback';
    mockSetInitialAvatarUrl.mockResolvedValue(undefined);
    mockVerifyOauthState.mockReturnValue(true);
    mockResolveOrCreateUser.mockResolvedValue(resolvedOk('returning_identity'));

    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeDiscordTokenResponse())
      .mockResolvedValueOnce(makeDiscordUserResponse());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns 400 when authorization code is missing', async () => {
    const result = await handleDiscordAuth(makeEvent({}));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body) as { error: string }).toMatchObject({
      error: 'Missing authorization code',
    });
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
  });

  it('routes the verified Discord profile through the shared resolver', async () => {
    await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(mockResolveOrCreateUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: 'discord',
        providerAccountId: 'discord-123',
        providerEmail: 'discord@example.com',
        emailVerified: true,
      }),
    );
  });

  it('sends Discord notification for a brand-new user', async () => {
    mockResolveOrCreateUser.mockResolvedValue(resolvedOk('new_user'));

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockNotifyNewUserSignup).toHaveBeenCalledTimes(1);
    expect(mockNotifyNewUserSignup).toHaveBeenCalledWith(
      'discord@example.com',
      99,
      'discord',
    );
  });

  it('does not send a notification for a returning user', async () => {
    mockResolveOrCreateUser.mockResolvedValue(resolvedOk('returning_identity'));

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
  });

  it('signs in without notifying on the auto_linked outcome', async () => {
    // auto_linked is a returning historical email-only user being backfilled —
    // it must sign in (200) but is not a brand-new signup, so no notification.
    mockResolveOrCreateUser.mockResolvedValue(resolvedOk('auto_linked'));

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
  });

  it('returns 409 when the resolver reports a takeover conflict (LS-6695)', async () => {
    mockResolveOrCreateUser.mockResolvedValue({ status: 'conflict' });

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body) as { error: string }).toMatchObject({
      error:
        'An account with this email already exists. Sign in with your password, then link Discord from your account settings.',
    });
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
  });

  it('rejects a Discord profile without an email (400)', async () => {
    fetchSpy.mockReset();
    fetchSpy
      .mockResolvedValueOnce(makeDiscordTokenResponse())
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'discord-123',
            username: 'DiscordUser',
            email: null,
            avatar: null,
            verified: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(400);
    expect(mockResolveOrCreateUser).not.toHaveBeenCalled();
  });

  it('returns 400 when the OAuth state does not match the cookie', async () => {
    mockVerifyOauthState.mockReturnValue(false);

    const result = await handleDiscordAuth(
      makeEvent({ code: 'auth-code', state: 'bad-state' }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body) as { error: string }).toMatchObject({
      error: 'Invalid OAuth state — please retry sign-in',
    });
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
  });

  it('clears the OAuth state cookie on success (single-use)', async () => {
    const result = await handleDiscordAuth(
      makeEvent({ code: 'auth-code', state: 'good-state' }),
    );

    expect(result.statusCode).toBe(200);
    const setCookies = result.multiValueHeaders?.['Set-Cookie'] ?? [];
    expect(setCookies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ls_oauth_state_login='),
      ]),
    );
    expect((setCookies as string[]).some((c) => c.includes('Max-Age=0'))).toBe(
      true,
    );
  });

  it('verifies and clears only the login-flow state cookie (LS-6661)', async () => {
    const event = makeEvent({ code: 'auth-code', state: 'tok-from-discord' });
    event.headers = { Cookie: 'ls_oauth_state_login=tok-from-discord' };

    await handleDiscordAuth(event);

    expect(mockVerifyOauthState).toHaveBeenCalledWith(
      'tok-from-discord',
      'ls_oauth_state_login=tok-from-discord',
      'ls_oauth_state_login',
    );
  });
});

describe('handleDiscordAuth — native PKCE path (LS-7765)', () => {
  const NATIVE_REDIRECT = 'legacysports://discord-callback';
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
    process.env['DISCORD_REDIRECT_URI'] = 'https://example.com/callback';
    process.env['DISCORD_NATIVE_REDIRECT_URIS'] = NATIVE_REDIRECT;
    mockSetInitialAvatarUrl.mockResolvedValue(undefined);
    mockResolveOrCreateUser.mockResolvedValue(resolvedOk('returning_identity'));
    // If the native path ever consulted the cookie state it would fail here.
    mockVerifyOauthState.mockReturnValue(false);

    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeDiscordTokenResponse())
      .mockResolvedValueOnce(makeDiscordUserResponse());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('exchanges with PKCE code_verifier + the native redirect_uri and returns a JWT (no state cookie required)', async () => {
    const result = await handleDiscordAuth(
      makeEvent({
        code: 'native-auth-code',
        code_verifier: 'pkce-verifier-123',
        redirect_uri: NATIVE_REDIRECT,
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body) as { jwt: string }).toMatchObject({
      jwt: 'mock-jwt',
    });
    expect(mockVerifyOauthState).not.toHaveBeenCalled();

    const calls = fetchSpy.mock.calls as [string, RequestInit][];
    const tokenBody = calls[0][1].body as URLSearchParams;
    expect(tokenBody.get('code_verifier')).toBe('pkce-verifier-123');
    expect(tokenBody.get('redirect_uri')).toBe(NATIVE_REDIRECT);
    expect(tokenBody.get('grant_type')).toBe('authorization_code');
  });

  it('rejects a redirect_uri that is not on the allow-list with 400', async () => {
    const result = await handleDiscordAuth(
      makeEvent({
        code: 'native-auth-code',
        code_verifier: 'pkce-verifier-123',
        redirect_uri: 'evil://attacker-callback',
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body) as { error: string }).toMatchObject({
      error: 'Invalid redirect_uri',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
  });

  it('rejects a missing redirect_uri with 400', async () => {
    const result = await handleDiscordAuth(
      makeEvent({ code: 'native-auth-code', code_verifier: 'pkce-verifier' }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body) as { error: string }).toMatchObject({
      error: 'Invalid redirect_uri',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 400 when the authorization code is missing on the native path', async () => {
    const result = await handleDiscordAuth(
      makeEvent({
        code_verifier: 'pkce-verifier',
        redirect_uri: NATIVE_REDIRECT,
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body) as { error: string }).toMatchObject({
      error: 'Missing authorization code',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves the web cookie-state path unchanged (no code_verifier → verifyOauthState is used, no PKCE sent)', async () => {
    mockVerifyOauthState.mockReturnValue(true);

    const result = await handleDiscordAuth(
      makeEvent({ code: 'web-auth-code', state: 'good-state' }),
    );

    expect(result.statusCode).toBe(200);
    expect(mockVerifyOauthState).toHaveBeenCalledTimes(1);
    const calls = fetchSpy.mock.calls as [string, RequestInit][];
    const tokenBody = calls[0][1].body as URLSearchParams;
    expect(tokenBody.get('code_verifier')).toBeNull();
    expect(tokenBody.get('redirect_uri')).toBe('https://example.com/callback');
  });
});

describe('handleDiscordAuthorize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
    process.env['DISCORD_REDIRECT_URI'] = 'https://example.com/callback';
  });

  it('302s to Discord with the generated state and sets the login-flow state cookie by default', () => {
    const event = makeEvent({});

    const result = handleDiscordAuthorize(event);

    expect(result.statusCode).toBe(302);
    const location = (result.headers?.['Location'] as string | undefined) ?? '';
    expect(location).toMatch(
      /^https:\/\/discord\.com\/api\/oauth2\/authorize\?/,
    );
    expect(location).toContain('state=mock-state-token');
    expect(location).toContain('client_id=test-client-id');
    expect(location).toContain(
      'redirect_uri=https%3A%2F%2Fexample.com%2Fcallback',
    );
    expect(location).toContain('scope=identify+email');
    expect(location).not.toContain('prompt=');

    const setCookies = result.multiValueHeaders?.['Set-Cookie'] ?? [];
    expect(setCookies).toEqual(
      expect.arrayContaining(['ls_oauth_state_login=stub']),
    );
  });

  it('sets the link-flow state cookie when link=1 is present (LS-6661)', () => {
    const event = makeEvent({});
    event.queryStringParameters = { link: '1' };

    const result = handleDiscordAuthorize(event);

    expect(result.statusCode).toBe(302);
    const setCookies = result.multiValueHeaders?.['Set-Cookie'] ?? [];
    expect(setCookies).toEqual(
      expect.arrayContaining(['ls_oauth_state_link=stub']),
    );
    expect(setCookies).not.toEqual(
      expect.arrayContaining(['ls_oauth_state_login=stub']),
    );
  });
});

describe('handleDiscordLink (LS-2549 — no Discord account enumeration)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
    process.env['DISCORD_REDIRECT_URI'] = 'https://example.com/callback';
    mockGetAuthenticatedUserId.mockResolvedValue(42);
    mockRequireCsrf.mockReturnValue(null);
    mockVerifyOauthState.mockReturnValue(true);

    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeDiscordTokenResponse())
      .mockResolvedValueOnce(makeDiscordUserResponse());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the generic conflict from the link core without confirming the link exists', async () => {
    mockLinkProviderIdentity.mockResolvedValue({
      ok: false,
      statusCode: 409,
      message: 'Could not link discord account',
    });

    const result = await handleDiscordLink(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(409);
    const parsed = JSON.parse(result.body) as { error: string };
    expect(parsed.error).not.toMatch(/another user/i);
    expect(parsed.error).toBe('Could not link discord account');
  });

  it('links the calling user’s own Discord account and returns its profile', async () => {
    mockLinkProviderIdentity.mockResolvedValue({ ok: true });

    const result = await handleDiscordLink(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockLinkProviderIdentity).toHaveBeenCalledWith(
      expect.anything(),
      42,
      expect.objectContaining({
        provider: 'discord',
        providerAccountId: 'discord-123',
      }),
    );
    expect(JSON.parse(result.body) as { discordId: string }).toMatchObject({
      discordId: 'discord-123',
    });
  });

  it('requires authentication (401) when no user id resolves', async () => {
    mockGetAuthenticatedUserId.mockResolvedValue(null);

    const result = await handleDiscordLink(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(401);
    expect(mockLinkProviderIdentity).not.toHaveBeenCalled();
  });

  it('verifies and clears only the link-flow state cookie (LS-6661)', async () => {
    mockLinkProviderIdentity.mockResolvedValue({ ok: true });

    const event = makeEvent({ code: 'auth-code', state: 'link-tok' });
    event.headers = {
      Cookie: 'ls_oauth_state_link=link-tok',
      'x-csrf-token': 'csrf',
    };

    const result = await handleDiscordLink(event);

    expect(result.statusCode).toBe(200);
    expect(mockVerifyOauthState).toHaveBeenCalledWith(
      'link-tok',
      'ls_oauth_state_link=link-tok',
      'ls_oauth_state_link',
    );
    const setCookies = result.multiValueHeaders?.['Set-Cookie'] ?? [];
    expect(setCookies).toEqual(
      expect.arrayContaining([expect.stringContaining('ls_oauth_state_link=')]),
    );
  });
});

describe('handleDiscordUnlink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthenticatedUserId.mockResolvedValue(42);
    mockRequireCsrf.mockReturnValue(null);
  });

  it('unlinks via the provider-agnostic core and returns success', async () => {
    mockUnlinkProviderIdentity.mockResolvedValue({ ok: true });

    const result = await handleDiscordUnlink(makeEvent({}));

    expect(result.statusCode).toBe(200);
    expect(mockUnlinkProviderIdentity).toHaveBeenCalledWith(
      expect.anything(),
      42,
      'discord',
    );
  });

  it('maps a NOT_LINKED result to 400', async () => {
    mockUnlinkProviderIdentity.mockResolvedValue({
      ok: false,
      statusCode: 400,
      message: 'No discord account linked',
    });

    const result = await handleDiscordUnlink(makeEvent({}));

    expect(result.statusCode).toBe(400);
  });

  it('maps the last-identity guard to 409', async () => {
    mockUnlinkProviderIdentity.mockResolvedValue({
      ok: false,
      statusCode: 409,
      message: 'Cannot unlink your only sign-in method',
    });

    const result = await handleDiscordUnlink(makeEvent({}));

    expect(result.statusCode).toBe(409);
  });
});

describe('DISCORD_REDIRECT_URI allow-list self-check (LGN-015 / LS-6670)', () => {
  const mockLogger = LOGGER as unknown as {
    error: jest.Mock<void, [string, unknown]>;
    warn: jest.Mock<void, [string]>;
  };
  const ALLOWED_ORIGIN = 'https://legacy-fantasy.com';

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['DISCORD_REDIRECT_URI'];
    delete process.env['DISCORD_REDIRECT_URI_ALLOWED_ORIGINS'];
  });

  afterEach(() => {
    delete process.env['DISCORD_REDIRECT_URI'];
    delete process.env['DISCORD_REDIRECT_URI_ALLOWED_ORIGINS'];
  });

  describe('checkDiscordRedirectUriConfig', () => {
    it('logs nothing when DISCORD_REDIRECT_URI is unset (Discord login disabled)', () => {
      checkDiscordRedirectUriConfig();

      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('logs an error when DISCORD_REDIRECT_URI is not a valid URL', () => {
      process.env['DISCORD_REDIRECT_URI'] = 'not a url';

      checkDiscordRedirectUriConfig();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const loggedError = mockLogger.error.mock.calls[0][1] as Error;
      expect(loggedError.message).toMatch(/not a valid URL/);
    });

    it('logs an error when DISCORD_REDIRECT_URI is not https', () => {
      process.env['DISCORD_REDIRECT_URI'] =
        'http://legacy-fantasy.com/callback';

      checkDiscordRedirectUriConfig();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const loggedError = mockLogger.error.mock.calls[0][1] as Error;
      expect(loggedError.message).toMatch(/https/);
    });

    it('logs an error when the redirect URI origin is not allow-listed', () => {
      process.env['DISCORD_REDIRECT_URI'] = 'https://evil.example.com/callback';
      process.env['DISCORD_REDIRECT_URI_ALLOWED_ORIGINS'] = ALLOWED_ORIGIN;

      checkDiscordRedirectUriConfig();

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const loggedError = mockLogger.error.mock.calls[0][1] as Error;
      expect(loggedError.message).toMatch(/not allow-listed/);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('passes silently when the origin is on the allow-list', () => {
      process.env['DISCORD_REDIRECT_URI'] =
        'https://legacy-fantasy.com/auth/discord/callback';
      process.env['DISCORD_REDIRECT_URI_ALLOWED_ORIGINS'] = ALLOWED_ORIGIN;

      checkDiscordRedirectUriConfig();

      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('warns (but does not error) when no allow-list is configured', () => {
      process.env['DISCORD_REDIRECT_URI'] =
        'https://legacy-fantasy.com/auth/discord/callback';

      checkDiscordRedirectUriConfig();

      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn.mock.calls[0][0]).toMatch(
        /DISCORD_REDIRECT_URI_ALLOWED_ORIGINS/,
      );
    });
  });

  describe('request-path enforcement (getDiscordRedirectUri)', () => {
    beforeEach(() => {
      process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
    });

    it('handleDiscordAuthorize throws a specific error on a non-https redirect URI', () => {
      process.env['DISCORD_REDIRECT_URI'] =
        'http://legacy-fantasy.com/callback';

      expect(() => handleDiscordAuthorize(makeEvent({}))).toThrow(/https/);
    });

    it('the web exchange fails (401) with a specific logged error when the origin is not allow-listed', async () => {
      process.env['DISCORD_REDIRECT_URI'] = 'https://evil.example.com/callback';
      process.env['DISCORD_REDIRECT_URI_ALLOWED_ORIGINS'] = ALLOWED_ORIGIN;
      mockVerifyOauthState.mockReturnValue(true);

      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      const result = await handleDiscordAuth(
        makeEvent({ code: 'auth-code', state: 'good-state' }),
      );

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body) as { error: string }).toMatchObject({
        error: 'Discord authentication failed',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });
});
