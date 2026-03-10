import { APIGatewayEvent } from 'aws-lambda';
import { handleGoogleAuth } from './Google';

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
  getUserFromGoogleJwt: jest.fn(),
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

// Mock google-auth-library with a chainable OAuth2Client
jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn().mockResolvedValue({
    getPayload: jest
      .fn()
      .mockReturnValue({ sub: '123', email: 'test@example.com' }),
  });
  const MockOAuth2Client = jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
    getToken: jest.fn().mockResolvedValue({
      tokens: { id_token: 'mock-google-id-token' },
    }),
  }));
  return { OAuth2Client: MockOAuth2Client, UserRefreshClient: jest.fn() };
});

// Mock jwt-decode
jest.mock('jwt-decode', () => ({
  jwtDecode: jest.fn().mockReturnValue({
    sub: '12345',
    email: 'test@example.com',
    name: 'Test User',
    picture: 'https://example.com/photo.jpg',
  }),
}));

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
