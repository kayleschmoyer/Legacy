import { APIGatewayEvent } from 'aws-lambda';
import { decode, verify } from 'jsonwebtoken';
import { handleSecureAppleAuth } from './Apple';
import { resolveOrCreateUser } from './resolveOrCreateUser';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual<typeof import('crypto')>('crypto'),
  createPublicKey: jest.fn(() => ({ type: 'public' })),
}));

jest.mock('@legacy-sports/db-client', () => ({}));

// The shared resolver and link core are unit-tested separately; mock them here
// so the Apple handler tests focus on token verification and result mapping.
jest.mock('./resolveOrCreateUser', () => ({
  resolveOrCreateUser: jest.fn().mockResolvedValue({
    status: 'ok',
    outcome: 'new_user',
    user: {
      id: 42,
      canonicalEmail: 'jane@example.com',
      username: 'jane',
      accessLevel: 'none',
    },
  }),
}));

jest.mock('./IdentityLink', () => ({
  linkProviderIdentity: jest.fn(),
  unlinkProviderIdentity: jest.fn(),
}));

jest.mock('../util/authenticated-request', () => ({
  getAuthenticatedUserId: jest.fn().mockResolvedValue(42),
  requireCsrf: jest.fn().mockReturnValue(null),
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn((cb: (db: unknown) => Promise<unknown>) => cb({})),
}));

jest.mock('../util/discord', () => ({
  notifyNewUserSignup: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../util/jwt', () => ({
  createJwt: jest.fn().mockResolvedValue('mock-internal-jwt'),
  JWT_COOKIE_NAME: 'legacy-sports-internal-jwt',
}));

jest.mock('../util/cookie', () => ({
  encryptCookies: jest.fn().mockResolvedValue(['encrypted-cookie']),
}));

jest.mock('../util/jwt-cookie', () => ({
  buildAuthCookies: jest.fn(() => ['auth-cookie']),
  generateCsrfToken: jest.fn(() => 'csrf-token'),
}));

jest.mock('../util/lambda', () => ({
  parseEventBody: jest.fn((event: APIGatewayEvent): unknown =>
    JSON.parse(event.body ?? '{}'),
  ),
}));

const mockDecode = decode as jest.Mock;
const mockVerify = verify as jest.Mock;
const mockResolveOrCreateUser = resolveOrCreateUser as jest.Mock;

function makeEvent(body: unknown): APIGatewayEvent {
  return {
    body: JSON.stringify(body),
    httpMethod: 'POST',
    path: '/oauth/apple',
  } as unknown as APIGatewayEvent;
}

describe('handleSecureAppleAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['APPLE_CLIENT_ID'] = 'com.legacysports.app';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          keys: [{ kid: 'test-kid', kty: 'RSA', alg: 'RS256', n: 'n', e: 'e' }],
        }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env['APPLE_CLIENT_ID'];
  });

  it('verifies the identity token and exchanges it for a Legacy Sports JWT', async () => {
    mockDecode.mockReturnValue({
      header: { kid: 'test-kid', alg: 'RS256' },
      payload: {},
    });
    mockVerify.mockReturnValue({
      email: 'jane@example.com',
      sub: 'apple-user-id',
    });

    const result = await handleSecureAppleAuth(
      makeEvent({ identityToken: 'apple-id-token', fullName: 'Jane Doe' }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      jwt: 'mock-internal-jwt',
      csrfToken: 'csrf-token',
    });
    // Audience must be the configured client id list.
    expect(mockVerify).toHaveBeenCalledWith(
      'apple-id-token',
      expect.anything(),
      expect.objectContaining({
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: ['com.legacysports.app'],
      }),
    );
    // The Apple subject id + email are routed through the shared resolver.
    expect(mockResolveOrCreateUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: 'apple',
        providerAccountId: 'apple-user-id',
        providerEmail: 'jane@example.com',
      }),
    );
    expect(result.multiValueHeaders?.['Set-Cookie']).toEqual([
      'encrypted-cookie',
      'auth-cookie',
    ]);
  });

  it('returns 400 when the identity token is missing', async () => {
    const result = await handleSecureAppleAuth(makeEvent({}));

    expect(result.statusCode).toBe(400);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(mockResolveOrCreateUser).not.toHaveBeenCalled();
  });

  it('returns 400 when the verified token has no email claim', async () => {
    mockDecode.mockReturnValue({
      header: { kid: 'test-kid', alg: 'RS256' },
      payload: {},
    });
    mockVerify.mockReturnValue({ sub: 'apple-user-id' });

    const result = await handleSecureAppleAuth(
      makeEvent({ identityToken: 'apple-id-token' }),
    );

    expect(result.statusCode).toBe(400);
    expect(mockResolveOrCreateUser).not.toHaveBeenCalled();
  });

  it('returns 500 when token verification fails', async () => {
    mockDecode.mockReturnValue({
      header: { kid: 'test-kid', alg: 'RS256' },
      payload: {},
    });
    mockVerify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const result = await handleSecureAppleAuth(
      makeEvent({ identityToken: 'apple-id-token' }),
    );

    expect(result.statusCode).toBe(500);
    expect(mockResolveOrCreateUser).not.toHaveBeenCalled();
  });

  it('returns 409 when the resolver reports a takeover conflict', async () => {
    mockDecode.mockReturnValue({
      header: { kid: 'test-kid', alg: 'RS256' },
      payload: {},
    });
    mockVerify.mockReturnValue({
      email: 'jane@example.com',
      sub: 'apple-user-id',
    });
    mockResolveOrCreateUser.mockResolvedValueOnce({ status: 'conflict' });

    const result = await handleSecureAppleAuth(
      makeEvent({ identityToken: 'apple-id-token' }),
    );

    expect(result.statusCode).toBe(409);
    expect((JSON.parse(result.body) as { error: string }).error).toBe(
      'Account exists',
    );
  });

  it('signs in (200) on the auto_linked outcome', async () => {
    mockDecode.mockReturnValue({
      header: { kid: 'test-kid', alg: 'RS256' },
      payload: {},
    });
    mockVerify.mockReturnValue({
      email: 'jane@example.com',
      sub: 'apple-user-id',
    });
    mockResolveOrCreateUser.mockResolvedValueOnce({
      status: 'ok',
      outcome: 'auto_linked',
      user: {
        id: 42,
        email: 'jane@example.com',
        username: 'jane',
        accessLevel: 'none',
      },
    });

    const result = await handleSecureAppleAuth(
      makeEvent({ identityToken: 'apple-id-token' }),
    );

    expect(result.statusCode).toBe(200);
  });
});
