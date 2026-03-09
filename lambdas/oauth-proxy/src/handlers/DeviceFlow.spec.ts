import { APIGatewayEvent } from 'aws-lambda';
import { getUserByEmail } from '@legacy-sports/db-client';
import {
  cleanupIntervalHandle,
  handleDeviceAuthorize,
  handleDeviceCompleteLocal,
  handleDeviceToken,
} from './DeviceFlow';
import { testPassword } from '../Users';
import { createJwt } from '../util/jwt';

// Mock dependencies
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/db-client', () => ({
  getUserByEmail: jest.fn(),
}));

jest.mock('../Users', () => ({
  testPassword: jest.fn(),
}));

jest.mock('../util/jwt', () => ({
  createJwt: jest.fn(),
  JWT_COOKIE_NAME: 'legacy-sports-internal-jwt',
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn((cb: (db: unknown) => Promise<unknown>) => cb({})),
}));

interface DeviceAuthorizeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

interface TokenResponse {
  jwt: string;
  user: { id: number; email: string; username: string; accessLevel: string };
}

function parseBody<T>(body: string): T {
  return JSON.parse(body) as T;
}

const mockGetUserByEmail = getUserByEmail as jest.MockedFunction<
  typeof getUserByEmail
>;
const mockTestPassword = testPassword as jest.MockedFunction<
  typeof testPassword
>;
const mockCreateJwt = createJwt as jest.MockedFunction<typeof createJwt>;

function makeEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/oauth/device/authorize',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      stage: 'dev',
      domainName: 'localhost',
    } as APIGatewayEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

describe('DeviceFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    clearInterval(cleanupIntervalHandle);
  });

  describe('handleDeviceAuthorize', () => {
    it('rejects non-cli client types', async () => {
      const event = makeEvent({
        body: JSON.stringify({ client_type: 'web' }),
      });
      const result = await handleDeviceAuthorize(event);
      expect(result.statusCode).toBe(400);
      expect(parseBody<ErrorResponse>(result.body).error).toBe(
        'invalid_client',
      );
    });

    it('returns device code and user code for cli client', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          client_type: 'cli',
          device_name: 'test-device',
        }),
      });
      const result = await handleDeviceAuthorize(event);
      expect(result.statusCode).toBe(200);
      const body = parseBody<DeviceAuthorizeResponse>(result.body);
      expect(body.device_code).toBeDefined();
      expect(body.user_code).toBeDefined();
      expect(body.user_code).toHaveLength(6);
      expect(body.verification_uri).toContain('/oauth/device/verify');
      expect(body.expires_in).toBe(600);
      expect(body.interval).toBe(5);
    });
  });

  describe('handleDeviceCompleteLocal', () => {
    it('rejects requests with missing fields', async () => {
      const event = makeEvent({
        body: JSON.stringify({ user_code: 'ABC123' }),
        path: '/oauth/device/complete-local',
      });
      const result = await handleDeviceCompleteLocal(event);
      expect(result.statusCode).toBe(400);
      expect(parseBody<ErrorResponse>(result.body).error).toBe(
        'invalid_request',
      );
    });

    it('rejects invalid user codes', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          user_code: 'ZZZZZZ',
          email: 'test@example.com',
          password: 'pass123',
        }),
        path: '/oauth/device/complete-local',
      });
      const result = await handleDeviceCompleteLocal(event);
      expect(result.statusCode).toBe(400);
      expect(parseBody<ErrorResponse>(result.body).error).toBe('invalid_code');
    });

    it('completes device flow with valid local credentials', async () => {
      // First create a device flow
      const authorizeEvent = makeEvent({
        body: JSON.stringify({
          client_type: 'cli',
          device_name: 'test',
        }),
      });
      const authorizeResult = await handleDeviceAuthorize(authorizeEvent);
      const { device_code, user_code } = parseBody<DeviceAuthorizeResponse>(
        authorizeResult.body,
      );

      // Mock DB user lookup and password check
      const mockUser = {
        id: 42,
        email: 'test@example.com',
        username: 'testuser',
        accessLevel: 'none' as const,
        passwordHash: 'hashed_password',
        avatarUrl: null,
        privacyPolicyAcceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockGetUserByEmail.mockResolvedValue(mockUser);
      mockTestPassword.mockResolvedValue(true);
      mockCreateJwt.mockResolvedValue('mock-jwt-token');

      // Complete device flow with local auth
      const completeEvent = makeEvent({
        body: JSON.stringify({
          user_code,
          email: 'test@example.com',
          password: 'password123',
        }),
        path: '/oauth/device/complete-local',
      });
      const completeResult = await handleDeviceCompleteLocal(completeEvent);
      expect(completeResult.statusCode).toBe(200);
      expect(completeResult.body).toContain('Authentication Successful');

      // Verify the token is now available via polling
      const tokenEvent = makeEvent({
        body: JSON.stringify({ device_code }),
        path: '/oauth/device/token',
      });
      const tokenResult = await handleDeviceToken(tokenEvent);
      expect(tokenResult.statusCode).toBe(200);
      const tokenBody = parseBody<TokenResponse>(tokenResult.body);
      expect(tokenBody.jwt).toBe('mock-jwt-token');
      expect(tokenBody.user.email).toBe('test@example.com');
    });

    it('rejects wrong password', async () => {
      // Create a device flow
      const authorizeEvent = makeEvent({
        body: JSON.stringify({
          client_type: 'cli',
          device_name: 'test',
        }),
      });
      const authorizeResult = await handleDeviceAuthorize(authorizeEvent);
      const { user_code } = parseBody<DeviceAuthorizeResponse>(
        authorizeResult.body,
      );

      const mockUser = {
        id: 42,
        email: 'test@example.com',
        username: 'testuser',
        accessLevel: 'none' as const,
        passwordHash: 'hashed_password',
        avatarUrl: null,
        privacyPolicyAcceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockGetUserByEmail.mockResolvedValue(mockUser);
      mockTestPassword.mockResolvedValue(false);

      const completeEvent = makeEvent({
        body: JSON.stringify({
          user_code,
          email: 'test@example.com',
          password: 'wrong-password',
        }),
        path: '/oauth/device/complete-local',
      });
      const result = await handleDeviceCompleteLocal(completeEvent);
      expect(result.statusCode).toBe(401);
      expect(parseBody<ErrorResponse>(result.body).error).toBe(
        'invalid_credentials',
      );
    });

    it('rejects user without password hash', async () => {
      // Create a device flow
      const authorizeEvent = makeEvent({
        body: JSON.stringify({
          client_type: 'cli',
          device_name: 'test',
        }),
      });
      const authorizeResult = await handleDeviceAuthorize(authorizeEvent);
      const { user_code } = parseBody<DeviceAuthorizeResponse>(
        authorizeResult.body,
      );

      mockGetUserByEmail.mockResolvedValue({
        id: 42,
        email: 'test@example.com',
        username: 'testuser',
        accessLevel: 'none' as const,
        passwordHash: null,
        avatarUrl: null,
        privacyPolicyAcceptedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const completeEvent = makeEvent({
        body: JSON.stringify({
          user_code,
          email: 'test@example.com',
          password: 'password123',
        }),
        path: '/oauth/device/complete-local',
      });
      const result = await handleDeviceCompleteLocal(completeEvent);
      expect(result.statusCode).toBe(401);
      expect(parseBody<ErrorResponse>(result.body).error).toBe(
        'invalid_credentials',
      );
    });
  });
});
