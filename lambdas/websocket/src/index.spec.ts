import type {
  APIGatewayProxyStructuredResultV2,
  APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda';

// ── Mocks (must be declared before importing the module under test) ──

const mockDynamoSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest
    .fn()
    .mockImplementation(() => ({ send: mockDynamoSend })),
  PutItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Put', input })),
  GetItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Get', input })),
  DeleteItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Delete', input })),
  QueryCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Query', input })),
  ScanCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Scan', input })),
  UpdateItemCommand: jest
    .fn()
    .mockImplementation((input) => ({ _type: 'Update', input })),
}));

const mockApiGatewaySend = jest.fn();
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({
    send: mockApiGatewaySend,
  })),
  PostToConnectionCommand: jest.fn().mockImplementation((input) => ({
    _type: 'PostToConnection',
    input,
  })),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn().mockResolvedValue('test-jwt-secret'),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  getRollbarConfigFromEnv: jest.fn().mockReturnValue(null),
  initRollbar: jest.fn(),
  withRollbar: jest.fn((fn) => fn),
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  captureWarning: jest.fn(),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getVersionInfo: jest.fn().mockReturnValue({}),
  formatVersionInfo: jest.fn().mockReturnValue('v0.0.0'),
  getDbOptions: jest.fn().mockReturnValue({}),
}));

const mockRunWithPublicClient = jest.fn();
jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]) => mockRunWithPublicClient(...args),
  PublicSchema: {
    leagueMembers: { leagueId: 'leagueId', userId: 'userId' },
    matchups: { id: 'id', leagueId: 'leagueId' },
  },
}));

jest.mock('drizzle-orm', () => ({
  and: jest.fn((...args: unknown[]) => args),
  eq: jest.fn((a: unknown, b: unknown) => [a, b]),
}));

// Set required env vars before import
process.env['CONNECTIONS_TABLE_NAME'] = 'test-connections';
process.env['JWT_SECRET_NAME'] = 'test-jwt-secret-name';

import { verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import {
  __resetCachedJwtSecret,
  broadcastMessage,
  handler,
  sendMessageToConnection,
} from './index';

const mockLogger = LOGGER as { error: jest.Mock };

const mockVerify = verify as jest.MockedFunction<typeof verify>;

// ── Helpers ──

interface EventOverrides {
  routeKey: string;
  connectionId?: string;
  headers?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: string | null;
}

function makeEvent(overrides: EventOverrides): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      routeKey: overrides.routeKey,
      connectionId: overrides.connectionId ?? 'test-conn-id',
      domainName: 'ws.example.com',
      stage: 'prod',
      messageId: 'msg-1',
      eventType: 'MESSAGE',
      extendedRequestId: 'ext-1',
      requestTime: '01/Jan/2026:00:00:00 +0000',
      messageDirection: 'IN',
      connectedAt: Date.now(),
      requestTimeEpoch: Date.now(),
      requestId: 'req-1',
      apiId: 'api-1',
    },
    headers: overrides.headers ?? {},
    queryStringParameters: overrides.queryStringParameters ?? undefined,
    body: overrides.body ?? null,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyWebsocketEventV2;
}

function asResult(result: unknown): APIGatewayProxyStructuredResultV2 {
  return result as APIGatewayProxyStructuredResultV2;
}

function mockValidJwt(
  payload = { id: 42, username: 'testuser', accessLevel: 'user' },
) {
  mockVerify.mockReturnValue(payload as never);
}

// ── Tests ──

describe('WebSocket Lambda Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetCachedJwtSecret();
    mockDynamoSend.mockResolvedValue({});
    mockApiGatewaySend.mockResolvedValue({});
  });

  describe('$connect', () => {
    it('returns 401 when no token is provided', async () => {
      const event = makeEvent({ routeKey: '$connect' });
      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(401);
    });

    it('returns 401 when JWT verification fails', async () => {
      mockVerify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'bad-token' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(401);
    });

    it('rejects expired JWT', async () => {
      mockVerify.mockImplementation(() => {
        throw Object.assign(new Error('jwt expired'), {
          name: 'TokenExpiredError',
        });
      });

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'expired-jwt' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(401);
    });

    it('connects successfully with query string token', async () => {
      mockValidJwt();
      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('Connected');
    });

    it('connects successfully with Authorization header token', async () => {
      mockValidJwt();

      const event = makeEvent({
        routeKey: '$connect',
        headers: { authorization: 'Bearer valid-jwt' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
    });

    it('connects successfully with HttpOnly cookie token', async () => {
      mockValidJwt();

      const event = makeEvent({
        routeKey: '$connect',
        headers: { cookie: 'other=val; ls_jwt=valid-jwt; another=x' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
    });

    it('stores connection in DynamoDB with correct attributes', async () => {
      mockValidJwt({ id: 7, username: 'alice', accessLevel: 'admin' });

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt' },
        connectionId: 'conn-abc',
      });

      await handler(event);

      expect(mockDynamoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-connections',
            Item: expect.objectContaining({
              connectionId: { S: 'conn-abc' },
              userId: { N: '7' },
              username: { S: 'alice' },
            }),
          }),
        }),
      );
    });

    it('returns 403 when origin is not allowed', async () => {
      mockValidJwt();
      process.env['CORS_ALLOWED_ORIGINS'] = 'https://allowed.com';

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt' },
        headers: { origin: 'https://evil.com' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(403);
      expect(result.body).toContain('Forbidden');

      delete process.env['CORS_ALLOWED_ORIGINS'];
    });

    it('allows connection when origin matches CORS_ALLOWED_ORIGINS', async () => {
      mockValidJwt();
      process.env['CORS_ALLOWED_ORIGINS'] =
        'https://allowed.com,https://other.com';

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt' },
        headers: { origin: 'https://other.com' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);

      delete process.env['CORS_ALLOWED_ORIGINS'];
    });

    it('validates league access when leagueId is provided', async () => {
      mockValidJwt();
      // Mock league access check - user is member
      mockRunWithPublicClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => [{ leagueId: 5, userId: 42 }],
                }),
              }),
            }),
          };
          return cb(mockDb);
        },
      );

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt', leagueId: '5' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
    });

    it('returns 403 when user has no league access', async () => {
      mockValidJwt();
      mockRunWithPublicClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => [],
                }),
              }),
            }),
          };
          return cb(mockDb);
        },
      );

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt', leagueId: '5' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(403);
    });

    it('returns 400 for invalid leagueId', async () => {
      mockValidJwt();

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt', leagueId: 'not-a-number' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(400);
    });

    it('calls LOGGER.error with a direct Error argument when DB access check fails', async () => {
      mockValidJwt();
      const dbError = new Error('DB connection failed');
      mockRunWithPublicClient.mockRejectedValue(dbError);

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt', leagueId: '5' },
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(500);

      // LOGGER.error must receive the Error as a direct argument, not wrapped in
      // an object like { error }, so RollbarOutputDestination can find it.
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Error),
        expect.anything(),
      );
    });

    it('broadcasts USER_JOINED and sends USER_LIST when leagueId is present', async () => {
      mockValidJwt({ id: 42, username: 'testuser', accessLevel: 'user' });

      // Mock league access check
      mockRunWithPublicClient.mockImplementation(
        async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
          const mockDb = {
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => [{ leagueId: 10, userId: 42 }],
                }),
              }),
            }),
          };
          return cb(mockDb);
        },
      );

      // Mock DynamoDB:
      // 1st call: PutItem (store connection)
      // 2nd call: Query (getLeagueConnections for presence)
      mockDynamoSend
        .mockResolvedValueOnce({}) // PutItem
        .mockResolvedValueOnce({
          // Query for league connections
          Items: [
            {
              connectionId: { S: 'peer-1' },
              userId: { N: '99' },
              username: { S: 'peer' },
            },
          ],
        });

      const event = makeEvent({
        routeKey: '$connect',
        queryStringParameters: { token: 'valid-jwt', leagueId: '10' },
        connectionId: 'new-conn',
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);

      // Should have sent messages via API Gateway (USER_JOINED to peer, USER_LIST to new conn)
      expect(mockApiGatewaySend).toHaveBeenCalled();
    });
  });

  describe('$disconnect', () => {
    it('removes connection from DynamoDB and returns 200', async () => {
      // Mock GetItem (read before delete) returns no league data
      mockDynamoSend
        .mockResolvedValueOnce({ Item: { userId: { N: '42' } } }) // GetItem
        .mockResolvedValueOnce({}); // DeleteItem

      const event = makeEvent({
        routeKey: '$disconnect',
        connectionId: 'conn-to-remove',
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('Disconnected');
    });

    it('broadcasts USER_LEFT when disconnecting user had a leagueId', async () => {
      mockDynamoSend
        .mockResolvedValueOnce({
          Item: {
            userId: { N: '42' },
            leagueId: { N: '10' },
          },
        }) // GetItem
        .mockResolvedValueOnce({}) // DeleteItem
        .mockResolvedValueOnce({
          // Query for remaining peers
          Items: [
            {
              connectionId: { S: 'peer-2' },
              userId: { N: '99' },
              username: { S: 'other' },
            },
          ],
        });

      const event = makeEvent({
        routeKey: '$disconnect',
        connectionId: 'leaving-conn',
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
      expect(mockApiGatewaySend).toHaveBeenCalled();
    });

    it('handles graceful failure when reading connection data fails', async () => {
      mockDynamoSend
        .mockRejectedValueOnce(new Error('DynamoDB read error')) // GetItem fails
        .mockResolvedValueOnce({}); // DeleteItem still succeeds

      const event = makeEvent({
        routeKey: '$disconnect',
        connectionId: 'error-conn',
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
    });
  });

  describe('$default (message routing)', () => {
    it('responds with pong for ping messages', async () => {
      const event = makeEvent({
        routeKey: '$default',
        body: JSON.stringify({ type: 'ping' }),
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('Pong sent');
    });

    it('handles malformed JSON body gracefully', async () => {
      const event = makeEvent({
        routeKey: '$default',
        body: 'not-json{{{',
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('Message received');
    });

    it('routes updateContext messages', async () => {
      // Mock GetItem for existing connection
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          connectionId: { S: 'test-conn-id' },
          userId: { N: '42' },
        },
      });

      const event = makeEvent({
        routeKey: '$default',
        body: JSON.stringify({
          type: 'updateContext',
          data: { viewContext: 'draft' },
        }),
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
    });

    it('returns 200 for unknown message types', async () => {
      const event = makeEvent({
        routeKey: '$default',
        body: JSON.stringify({ type: 'unknown-type' }),
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe('Message received');
    });

    it('handles empty body', async () => {
      const event = makeEvent({
        routeKey: '$default',
        body: '',
      });

      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(200);
    });
  });

  describe('unknown route', () => {
    it('returns 400 for unrecognized route keys', async () => {
      const event = makeEvent({ routeKey: '$unknown' });
      const result = asResult(await handler(event));
      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Unknown route');
    });
  });
});

describe('sendMessageToConnection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGatewaySend.mockResolvedValue({});
    mockDynamoSend.mockResolvedValue({});
  });

  it('sends a message via API Gateway Management API', async () => {
    await sendMessageToConnection('https://ws.example.com/prod', 'conn-1', {
      type: 'test',
      data: 'hello',
    });

    expect(mockApiGatewaySend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          ConnectionId: 'conn-1',
        }),
      }),
    );
  });

  it('removes stale connections on 410 GoneException (old connection)', async () => {
    const goneError = new Error('Gone') as Error & {
      $metadata: { httpStatusCode: number };
    };
    goneError.$metadata = { httpStatusCode: 410 };
    mockApiGatewaySend.mockRejectedValueOnce(goneError);
    // DeleteItem conditional succeeds
    mockDynamoSend.mockResolvedValueOnce({});

    await sendMessageToConnection('https://ws.example.com/prod', 'stale-conn', {
      type: 'test',
    });

    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'test-connections',
          Key: { connectionId: { S: 'stale-conn' } },
          ConditionExpression:
            'attribute_not_exists(connectedAt) OR connectedAt < :threshold',
        }),
      }),
    );
  });

  it('skips removal for connections within grace period', async () => {
    const goneError = new Error('Gone') as Error & {
      $metadata: { httpStatusCode: number };
    };
    goneError.$metadata = { httpStatusCode: 410 };
    mockApiGatewaySend.mockRejectedValueOnce(goneError);

    // Conditional delete fails (within grace period)
    const condError = new Error('Condition not met') as Error & {
      name: string;
    };
    condError.name = 'ConditionalCheckFailedException';
    mockDynamoSend.mockRejectedValueOnce(condError);

    // Should not throw
    await sendMessageToConnection('https://ws.example.com/prod', 'young-conn', {
      type: 'test',
    });
  });

  it('re-throws non-410 errors', async () => {
    const error = new Error('Network error');
    mockApiGatewaySend.mockRejectedValueOnce(error);

    await expect(
      sendMessageToConnection('https://ws.example.com/prod', 'conn-1', {
        type: 'test',
      }),
    ).rejects.toThrow('Network error');
  });
});

describe('broadcastMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDynamoSend.mockResolvedValue({});
    mockApiGatewaySend.mockResolvedValue({});
  });

  it('queries LeagueIdIndex when filtering by leagueId', async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { connectionId: { S: 'conn-a' } },
        { connectionId: { S: 'conn-b' } },
      ],
    });

    await broadcastMessage(
      'https://ws.example.com/prod',
      { type: 'update' },
      5,
    );

    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          IndexName: 'LeagueIdIndex',
          KeyConditionExpression: 'leagueId = :leagueId',
        }),
      }),
    );
    expect(mockApiGatewaySend).toHaveBeenCalledTimes(2);
  });

  it('scans all connections when no leagueId filter', async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ connectionId: { S: 'conn-x' } }],
    });

    await broadcastMessage('https://ws.example.com/prod', { type: 'global' });

    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: 'test-connections',
          ProjectionExpression: 'connectionId',
        }),
      }),
    );
  });

  it('handles empty connection list gracefully', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    await broadcastMessage('https://ws.example.com/prod', { type: 'empty' });
    expect(mockApiGatewaySend).not.toHaveBeenCalled();
  });
});
