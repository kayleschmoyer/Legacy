import { APIGatewayEvent } from 'aws-lambda';
import {
  createUser,
  getUserByDiscordId,
  getUserByEmail,
  getUserById,
  linkDiscordAccount,
  setInitialAvatarUrl,
} from '@legacy-sports/db-client';
import {
  handleDiscordAuth,
  handleDiscordAuthorize,
  handleDiscordLink,
} from './Discord';
import { verifyOauthState } from '../util/oauth-state';
import { parseJwtFromCookies } from '../util/jwt-cookie';

const mockVerifyOauthState = verifyOauthState as jest.MockedFunction<
  typeof verifyOauthState
>;
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

jest.mock('@legacy-sports/db-client', () => ({
  createUser: jest.fn(),
  getUserByDiscordId: jest.fn(),
  getUserByEmail: jest.fn(),
  getUserById: jest.fn(),
  linkDiscordAccount: jest.fn(),
  setInitialAvatarUrl: jest.fn().mockResolvedValue(undefined),
  unlinkDiscordAccount: jest.fn(),
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
  parseJwtFromCookies: jest.fn().mockReturnValue(null),
  validateCsrf: jest.fn().mockReturnValue(true),
  CSRF_HEADER: 'x-csrf-token',
}));

jest.mock('../util/oauth-state', () => ({
  buildOauthStateCookie: jest.fn().mockReturnValue('ls_oauth_state=stub'),
  buildClearOauthStateCookie: jest
    .fn()
    .mockReturnValue('ls_oauth_state=; Max-Age=0'),
  generateOauthState: jest.fn().mockReturnValue('mock-state-token'),
  verifyOauthState: jest.fn(),
}));

jest.mock('../util/discord', () => ({
  notifyNewUserSignup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../util', () => ({
  DiscordEnv: {
    DISCORD_CLIENT_ID: 'DISCORD_CLIENT_ID',
    DISCORD_REDIRECT_URI: 'DISCORD_REDIRECT_URI',
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

const mockCreateUser = createUser as jest.MockedFunction<typeof createUser>;
const mockGetUserByDiscordId = getUserByDiscordId as jest.MockedFunction<
  typeof getUserByDiscordId
>;
const mockGetUserByEmail = getUserByEmail as jest.MockedFunction<
  typeof getUserByEmail
>;
const mockLinkDiscordAccount = linkDiscordAccount as jest.MockedFunction<
  typeof linkDiscordAccount
>;
const mockSetInitialAvatarUrl = setInitialAvatarUrl as jest.MockedFunction<
  typeof setInitialAvatarUrl
>;
const mockNotifyNewUserSignup = notifyNewUserSignup as jest.MockedFunction<
  typeof notifyNewUserSignup
>;
const mockParseJwtFromCookies = parseJwtFromCookies as jest.MockedFunction<
  typeof parseJwtFromCookies
>;
const mockGetUserById = getUserById as jest.MockedFunction<typeof getUserById>;

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockReturnValue({ id: 42 }),
}));

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
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
    // Default: state matches — existing flows under test exercise the happy path
    mockVerifyOauthState.mockReturnValue(true);

    // Default: token exchange then user fetch
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

  it('sends Discord notification for a brand-new user', async () => {
    mockGetUserByDiscordId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ ...mockUser, discordId: null });
    mockLinkDiscordAccount.mockResolvedValue(mockUser);

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockNotifyNewUserSignup).toHaveBeenCalledTimes(1);
    expect(mockNotifyNewUserSignup).toHaveBeenCalledWith(
      'discord@example.com',
      99,
      'discord',
    );
  });

  it('does not send Discord notification for an existing user found by Discord ID', async () => {
    mockGetUserByDiscordId.mockResolvedValue(mockUser);
    mockLinkDiscordAccount.mockResolvedValue(mockUser);

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
  });

  it('does not send Discord notification for an existing user found by email', async () => {
    mockGetUserByDiscordId.mockResolvedValue(null);
    mockGetUserByEmail.mockResolvedValue({ ...mockUser, discordId: null });
    mockLinkDiscordAccount.mockResolvedValue(mockUser);

    const result = await handleDiscordAuth(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockNotifyNewUserSignup).not.toHaveBeenCalled();
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
    mockGetUserByDiscordId.mockResolvedValue(mockUser);
    mockLinkDiscordAccount.mockResolvedValue(mockUser);

    const result = await handleDiscordAuth(
      makeEvent({ code: 'auth-code', state: 'good-state' }),
    );

    expect(result.statusCode).toBe(200);
    const setCookies = result.multiValueHeaders?.['Set-Cookie'] ?? [];
    expect(setCookies).toEqual(
      expect.arrayContaining([expect.stringContaining('ls_oauth_state=')]),
    );
    // Specifically the clearing cookie (Max-Age=0)
    expect((setCookies as string[]).some((c) => c.includes('Max-Age=0'))).toBe(
      true,
    );
  });

  it('passes state to verifyOauthState along with the request Cookie header', async () => {
    mockGetUserByDiscordId.mockResolvedValue(mockUser);
    mockLinkDiscordAccount.mockResolvedValue(mockUser);

    const event = makeEvent({ code: 'auth-code', state: 'tok-from-discord' });
    event.headers = { Cookie: 'ls_oauth_state=tok-from-discord' };

    await handleDiscordAuth(event);

    expect(mockVerifyOauthState).toHaveBeenCalledWith(
      'tok-from-discord',
      'ls_oauth_state=tok-from-discord',
    );
  });
});

describe('handleDiscordAuthorize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
    process.env['DISCORD_REDIRECT_URI'] = 'https://example.com/callback';
  });

  it('302s to Discord with the generated state and sets the state cookie', () => {
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

    const setCookies = result.multiValueHeaders?.['Set-Cookie'] ?? [];
    expect(setCookies).toEqual(expect.arrayContaining(['ls_oauth_state=stub']));
  });
});

describe('handleDiscordLink (LS-2549 — no Discord account enumeration)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env['DISCORD_CLIENT_ID'] = 'test-client-id';
    process.env['DISCORD_REDIRECT_URI'] = 'https://example.com/callback';
    // Authenticated request: parse a cookie token; jsonwebtoken.verify is
    // mocked to return { id: 42 } (the calling user).
    mockParseJwtFromCookies.mockReturnValue('mock-jwt');

    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeDiscordTokenResponse())
      .mockResolvedValueOnce(makeDiscordUserResponse());
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns a generic error that does not confirm the Discord account is linked to another user', async () => {
    // Discord ID is already linked to a DIFFERENT user (id 99, not the
    // caller id 42). The previous behavior leaked this via a specific
    // 409 "already linked to another user" message; the fix returns a
    // generic message instead.
    mockGetUserByDiscordId.mockResolvedValue({ ...mockUser, id: 99 });

    const result = await handleDiscordLink(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(409);
    const parsed = JSON.parse(result.body) as { error: string };
    expect(parsed.error).not.toMatch(/another user/i);
    expect(parsed.error).not.toMatch(/already linked/i);
    expect(parsed.error).toBe('Could not link Discord account');
  });

  it('still allows the calling user to link their own Discord account', async () => {
    mockGetUserByDiscordId.mockResolvedValue(null);
    mockGetUserById.mockResolvedValue({
      ...mockUser,
      id: 42,
      discordId: null,
    });
    mockLinkDiscordAccount.mockResolvedValue({ ...mockUser, id: 42 });

    const result = await handleDiscordLink(makeEvent({ code: 'auth-code' }));

    expect(result.statusCode).toBe(200);
    expect(mockLinkDiscordAccount).toHaveBeenCalledTimes(1);
  });
});
