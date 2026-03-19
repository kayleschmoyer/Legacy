import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// ── Environment setup (before module-level guards) ──────────────────────────

process.env['CONNECTIONS_TABLE_NAME'] = 'test-connections';
process.env['JWT_SECRET_NAME'] = 'test/jwt-secret';
process.env['CORS_ALLOWED_ORIGINS'] =
  'https://legacy-fantasy.com,https://localhost:3000';

// ── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  captureWarning: jest.fn(),
  getRollbarConfigFromEnv: jest.fn(() => null),
  initRollbar: jest.fn(),
  withRollbar: jest.fn((fn: unknown) => fn),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  formatVersionInfo: jest.fn(() => ''),
  getVersionInfo: jest.fn(() => ({})),
  getDbOptions: jest.fn(() => ({})),
}));

const mockRetrieveSecretParameterValue = jest.fn();
jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: (...args: unknown[]): unknown =>
    mockRetrieveSecretParameterValue(...args),
}));

const mockRunWithPublicClient = jest.fn();
jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  PublicSchema: {
    leagueMembers: { leagueId: 'leagueId', userId: 'userId' },
    matchups: { id: 'id', leagueId: 'leagueId' },
  },
}));

const mockDynamoSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDynamoSend })),
  DeleteItemCommand: jest.fn((params: unknown) => ({
    _type: 'DeleteItem',
    ...(params as object),
  })),
  GetItemCommand: jest.fn((params: unknown) => ({
    _type: 'GetItem',
    ...(params as object),
  })),
  PutItemCommand: jest.fn((params: unknown) => ({
    _type: 'PutItem',
    ...(params as object),
  })),
  QueryCommand: jest.fn((params: unknown) => ({
    _type: 'Query',
    ...(params as object),
  })),
  ScanCommand: jest.fn((params: unknown) => ({
    _type: 'Scan',
    ...(params as object),
  })),
  UpdateItemCommand: jest.fn((params: unknown) => ({
    _type: 'UpdateItem',
    ...(params as object),
  })),
}));

const mockApiGatewaySend = jest.fn();
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn(() => ({
    send: mockApiGatewaySend,
  })),
  PostToConnectionCommand: jest.fn((params: unknown) => ({
    _type: 'PostToConnection',
    ...(params as object),
  })),
}));

const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  verify: (...args: unknown[]): unknown => mockVerify(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { __resetCachedJwtSecret, handler } from './index';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeWebSocketEvent(
  routeKey: string,
  overrides: Record<string, unknown> = {},
): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      routeKey,
      connectionId: 'conn-123',
      domainName: 'ws.example.com',
      stage: 'dev',
      messageId: 'msg-1',
      eventType:
        routeKey === '$connect'
          ? 'CONNECT'
          : routeKey === '$disconnect'
            ? 'DISCONNECT'
            : 'MESSAGE',
      connectedAt: Date.now(),
      requestTimeEpoch: Date.now(),
      requestId: 'req-1',
      apiId: 'api-1',
    },
    headers: {},
    isBase64Encoded: false,
    body: null,
    ...overrides,
  } as unknown as APIGatewayProxyWebsocketEventV2;
}

function setupValidJwt(userId = 1, username = 'testuser') {
  mockRetrieveSecretParameterValue.mockResolvedValue('jwt-secret-value');
  mockVerify.mockReturnValue({
    id: userId,
    username,
    email: 'test@example.com',
    accessLevel: 'user',
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('websocket handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    __resetCachedJwtSecret();
    mockDynamoSend.mockResolvedValue({});
    mockApiGatewaySend.mockResolvedValue({});
  });

  // ── Route dispatch ────────────────────────────────────────────────────

  describe('route dispatch', () => {
    it('routes $connect to handleConnect', async () => {
      setupValidJwt();
      const event = makeWebSocketEvent('$connect', {
        queryStringParameters: { token: 'valid-jwt' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('routes $disconnect to handleDisconnect', async () => {
      // GetItem returns connection data for presence broadcast
      mockDynamoSend.mockResolvedValue({ Item: undefined });

      const event = makeWebSocketEvent('$disconnect');
      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('routes $default to handleDefault', async () => {
      const event = makeWebSocketEvent('$default', {
        body: JSON.stringify({ type: 'unknown' }),
      });
      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('returns 400 for unknown route keys', async () => {
      const event = makeWebSocketEvent('$unknown');
      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(400);
    });
  });

  // ── $connect ──────────────────────────────────────────────────────────

  describe('$connect', () => {
    it('rejects connections without a valid JWT', async () => {
      const event = makeWebSocketEvent('$connect');
      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(401);
    });

    it('accepts connections with JWT in query string', async () => {
      setupValidJwt();
      const event = makeWebSocketEvent('$connect', {
        queryStringParameters: { token: 'valid-jwt' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
      // Should store connection in DynamoDB
      expect(mockDynamoSend).toHaveBeenCalled();
    });

    it('accepts connections with JWT in Authorization header', async () => {
      setupValidJwt();
      const event = makeWebSocketEvent('$connect', {
        headers: { authorization: 'Bearer valid-jwt' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('accepts connections with JWT in cookie', async () => {
      setupValidJwt();
      const event = makeWebSocketEvent('$connect', {
        headers: {
          cookie: 'other=value; ls_jwt=valid-jwt; another=foo',
          Origin: 'https://legacy-fantasy.com',
        },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('rejects connections with invalid Origin', async () => {
      setupValidJwt();
      const event = makeWebSocketEvent('$connect', {
        headers: { Origin: 'https://evil-site.com' },
        queryStringParameters: { token: 'valid-jwt' },
      });

      const result = (await handler(event)) as {
        statusCode: number;
        body: string;
      };

      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('Invalid origin');
    });

    it('allows connections with valid Origin', async () => {
      setupValidJwt();
      const event = makeWebSocketEvent('$connect', {
        headers: { Origin: 'https://localhost:3000' },
        queryStringParameters: { token: 'valid-jwt' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('validates league access when leagueId is provided', async () => {
      setupValidJwt();
      // Mock league membership check — user IS a member
      mockRunWithPublicClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
          const mockDb = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([{ id: 1 }]),
          };
          return cb(mockDb);
        },
      );

      const event = makeWebSocketEvent('$connect', {
        queryStringParameters: { token: 'valid-jwt', leagueId: '5' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('rejects when user lacks league access', async () => {
      setupValidJwt();
      mockRunWithPublicClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
          const mockDb = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue([]),
          };
          return cb(mockDb);
        },
      );

      const event = makeWebSocketEvent('$connect', {
        queryStringParameters: { token: 'valid-jwt', leagueId: '5' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(403);
    });

    it('rejects invalid leagueId parameter', async () => {
      setupValidJwt();
      const event = makeWebSocketEvent('$connect', {
        queryStringParameters: { token: 'valid-jwt', leagueId: 'not-a-number' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(400);
    });

    it('rejects expired JWT', async () => {
      mockRetrieveSecretParameterValue.mockResolvedValue('jwt-secret-value');
      mockVerify.mockImplementation(() => {
        throw Object.assign(new Error('jwt expired'), {
          name: 'TokenExpiredError',
        });
      });

      const event = makeWebSocketEvent('$connect', {
        queryStringParameters: { token: 'expired-jwt' },
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(401);
    });
  });

  // ── $disconnect ───────────────────────────────────────────────────────

  describe('$disconnect', () => {
    it('deletes connection from DynamoDB', async () => {
      mockDynamoSend.mockResolvedValue({ Item: undefined });

      const event = makeWebSocketEvent('$disconnect');
      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
      expect(mockDynamoSend).toHaveBeenCalled();
    });
  });

  // ── $default ──────────────────────────────────────────────────────────

  describe('$default', () => {
    it('responds to ping with pong', async () => {
      const event = makeWebSocketEvent('$default', {
        body: JSON.stringify({ type: 'ping' }),
      });

      const result = (await handler(event)) as {
        statusCode: number;
        body: string;
      };

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('Pong sent');
    });

    it('handles updateContext action', async () => {
      // updateContext requires fetching connection for userId
      mockDynamoSend.mockResolvedValue({
        Item: {
          connectionId: { S: 'conn-123' },
          userId: { N: '1' },
        },
      });

      const event = makeWebSocketEvent('$default', {
        body: JSON.stringify({
          action: 'updateContext',
          data: { viewContext: 'matchup' },
        }),
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('handles unparseable message body gracefully', async () => {
      const event = makeWebSocketEvent('$default', {
        body: 'not-json',
      });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });

    it('handles empty body gracefully', async () => {
      const event = makeWebSocketEvent('$default', { body: '' });

      const result = (await handler(event)) as { statusCode: number };

      expect(result.statusCode).toBe(200);
    });
  });
});
