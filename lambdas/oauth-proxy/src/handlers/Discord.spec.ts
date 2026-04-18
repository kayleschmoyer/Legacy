import { APIGatewayEvent } from 'aws-lambda';
import {
  createUser,
  getUserByDiscordId,
  getUserByEmail,
  linkDiscordAccount,
  setInitialAvatarUrl,
} from '@legacy-sports/db-client';
import { handleDiscordAuth } from './Discord';
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
  encryptCookies: jest.fn().mockResolvedValue('encrypted-cookie'),
}));

jest.mock('../util/jwt-cookie', () => ({
  buildAuthCookies: jest.fn().mockReturnValue(['auth-cookie']),
  generateCsrfToken: jest.fn().mockReturnValue('csrf-token'),
  parseJwtFromCookies: jest.fn().mockReturnValue(null),
  validateCsrf: jest.fn().mockReturnValue(true),
  CSRF_HEADER: 'x-csrf-token',
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
});
