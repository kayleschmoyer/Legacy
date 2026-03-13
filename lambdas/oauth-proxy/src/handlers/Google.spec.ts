import { APIGatewayEvent } from 'aws-lambda';
import { handleGoogleAuth, handleGoogleRefresh } from './Google';

// Mock dependencies
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/env-utilities', () => ({
  getEnvVarRequired: jest.fn().mockReturnValue('test-client-id'),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  readSecret: jest.fn().mockResolvedValue('test-client-secret'),
  DraftSqsService: jest.fn().mockImplementation(() => ({})),
  SqsService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@legacy-sports/db-client', () => ({
  runWithInternalClient: jest.fn(),
  getUserByEmail: jest.fn(),
  InternalUser: {},
}));

jest.mock('./UserManager', () => ({
  getOrCreateUser: jest.fn().mockResolvedValue({
    id: 42,
    email: 'test@example.com',
    username: 'testuser',
    accessLevel: 'player',
    subscriptionTier: 'free',
  }),
}));

jest.mock('../util/users', () => ({
  getUserFromGoogleEmail: jest.fn(),
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn(),
}));

jest.mock('../util/jwt', () => ({
  createJwt: jest.fn().mockResolvedValue('mock-internal-jwt'),
  JWT_COOKIE_NAME: 'legacy-sports-internal-jwt',
}));

jest.mock('../util/cookie', () => ({
  encryptCookies: jest.fn().mockResolvedValue('encrypted-cookies'),
  decryptCookies: jest.fn(),
}));

jest.mock('../util/lambda', () => ({
  parseEventBody: jest.fn(
    (event: APIGatewayEvent): Record<string, unknown> =>
      JSON.parse(event.body ?? '{}') as Record<string, unknown>,
  ),
}));

jest.mock('./DeviceFlow', () => ({
  completeDeviceFlow: jest.fn(),
}));

// Mock google-auth-library with a chainable OAuth2Client.
// Expose mock functions via getters so tests can reconfigure them without
// running into jest.mock hoisting / TDZ issues with outer let declarations.
jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn().mockResolvedValue({
    getPayload: jest
      .fn()
      .mockReturnValue({ sub: '123', email: 'test@example.com' }),
  });
  const mockRefreshAccessToken = jest.fn().mockResolvedValue({
    credentials: { id_token: 'mock-refreshed-id-token' },
  });
  const MockUserRefreshClient = jest.fn().mockImplementation(() => ({
    refreshAccessToken: mockRefreshAccessToken,
  }));
  const MockOAuth2Client = jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
    getToken: jest.fn().mockResolvedValue({
      tokens: { id_token: 'mock-google-id-token' },
    }),
  }));
  return {
    OAuth2Client: MockOAuth2Client,
    UserRefreshClient: MockUserRefreshClient,
    // Getters let tests reconfigure these mocks without outer-scope TDZ issues
    getMockVerifyIdToken: () => mockVerifyIdToken,
    getMockRefreshAccessToken: () => mockRefreshAccessToken,
  };
});

jest.mock('memoize-one', () => (fn: unknown) => fn);

import { withDbClient } from '../util/db';

const mockWithDbClient = withDbClient as jest.MockedFunction<
  typeof withDbClient
>;

function makeEvent(body: Record<string, unknown>): APIGatewayEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/oauth/google',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '',
      apiId: '',
      authorizer: {},
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: '/oauth/google',
      stage: 'dev',
      requestId: 'test-request-id',
      requestTimeEpoch: 0,
      resourceId: '',
      resourcePath: '',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
    },
    resource: '',
  };
}

describe('handleGoogleAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('database unavailability', () => {
    it('returns 503 when the database is unreachable (credential/One Tap flow)', async () => {
      mockWithDbClient.mockRejectedValue(new Error('ECONNREFUSED'));

      const event = makeEvent({ credential: 'mock-google-id-token' });
      const result = await handleGoogleAuth(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toBe('Service unavailable');
    });

    it('does NOT issue a JWT when the database is unreachable', async () => {
      const { createJwt } = await import('../util/jwt');
      mockWithDbClient.mockRejectedValue(new Error('Connection timeout'));

      const event = makeEvent({ credential: 'mock-google-id-token' });
      await handleGoogleAuth(event);

      // createJwt must never be called — no JWT for fake users
      expect(createJwt).not.toHaveBeenCalled();
    });

    it('returns 503 when the database is unreachable (authorization code flow)', async () => {
      mockWithDbClient.mockRejectedValue(new Error('DB connection failed'));

      const event = makeEvent({ code: 'auth-code-123' });
      const result = await handleGoogleAuth(event);

      expect(result.statusCode).toBe(503);
      const body = JSON.parse(result.body) as { error: string };
      expect(body.error).toBe('Service unavailable');
    });
  });
});

function makeRefreshEvent(cookieHeader = ''): APIGatewayEvent {
  return { ...makeEvent({}), headers: { Cookie: cookieHeader } };
}

describe('handleGoogleRefresh', () => {
  // Typed accessors for mock functions shared inside the jest.mock factory
  const googleMock = jest.requireMock<{
    getMockVerifyIdToken: () => jest.Mock;
    getMockRefreshAccessToken: () => jest.Mock;
  }>('google-auth-library');
  const cookieMock = jest.requireMock<{
    decryptCookies: jest.Mock;
  }>('../util/cookie');
  const usersMock = jest.requireMock<{
    getUserFromGoogleEmail: jest.Mock;
  }>('../util/users');

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: cookies contain a valid refresh token
    cookieMock.decryptCookies.mockResolvedValue({
      GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
    });

    // Default: refreshAccessToken returns a valid id_token
    googleMock.getMockRefreshAccessToken().mockResolvedValue({
      credentials: { id_token: 'mock-refreshed-id-token' },
    });

    // Default: verifyIdToken returns a payload with sub + email
    googleMock.getMockVerifyIdToken().mockResolvedValue({
      getPayload: jest
        .fn()
        .mockReturnValue({ sub: '123', email: 'test@example.com' }),
    });

    // Default: DB resolves successfully
    mockWithDbClient.mockImplementation((cb) =>
      cb({} as Parameters<typeof cb>[0]),
    );

    // Default: user lookup resolves
    usersMock.getUserFromGoogleEmail.mockResolvedValue({
      id: 42,
      email: 'test@example.com',
    });
  });

  it('returns 200 with JWT on successful refresh', async () => {
    const event = makeRefreshEvent('Cookie=encrypted');
    const result = await handleGoogleRefresh(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { jwt: string };
    expect(body.jwt).toBe('mock-internal-jwt');
  });

  it('throws when no refresh token is present in cookies', async () => {
    cookieMock.decryptCookies.mockResolvedValue({});

    const event = makeRefreshEvent();
    await expect(handleGoogleRefresh(event)).rejects.toThrow(
      'Could not determine refresh token!',
    );
  });

  it('throws when the refreshed credentials contain a null id_token', async () => {
    googleMock.getMockRefreshAccessToken().mockResolvedValue({
      credentials: { id_token: null },
    });

    const event = makeRefreshEvent('Cookie=encrypted');
    await expect(handleGoogleRefresh(event)).rejects.toThrow(
      'Invalid token returned from google!',
    );
  });

  it('throws when verifyIdToken rejects (invalid or expired token)', async () => {
    googleMock
      .getMockVerifyIdToken()
      .mockRejectedValue(new Error('Token has been expired or revoked'));

    const event = makeRefreshEvent('Cookie=encrypted');
    await expect(handleGoogleRefresh(event)).rejects.toThrow(
      'Token has been expired or revoked',
    );
  });

  it('throws when the verified payload is missing the email claim', async () => {
    googleMock.getMockVerifyIdToken().mockResolvedValue({
      getPayload: jest.fn().mockReturnValue({ sub: '123' }), // no email
    });

    const event = makeRefreshEvent('Cookie=encrypted');
    await expect(handleGoogleRefresh(event)).rejects.toThrow(
      'Invalid ID token from Google: missing email',
    );
  });

  it('propagates database errors', async () => {
    mockWithDbClient.mockRejectedValue(new Error('DB connection refused'));

    const event = makeRefreshEvent('Cookie=encrypted');
    await expect(handleGoogleRefresh(event)).rejects.toThrow(
      'DB connection refused',
    );
  });
});
