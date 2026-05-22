const mockDynamoSend: jest.Mock = jest.fn();
const mockApiGatewaySend: jest.Mock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest
    .fn()
    .mockImplementation(() => ({ send: mockDynamoSend })),
  DeleteItemCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ _type: 'Delete', input })),
  QueryCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ _type: 'Query', input })),
  ScanCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ _type: 'Scan', input })),
}));

jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest
    .fn()
    .mockImplementation(() => ({ send: mockApiGatewaySend })),
  PostToConnectionCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ _type: 'Post', input })),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { WebSocketNotificationService } from './WebSocketNotificationService';

interface QueryCall {
  _type: 'Query' | 'Scan';
  input: {
    IndexName?: string;
    ExclusiveStartKey?: Record<string, unknown>;
    KeyConditionExpression?: string;
  };
}

const makeConnectionItems = (ids: string[]) =>
  ids.map((id) => ({ connectionId: { S: id } }));

describe('WebSocketNotificationService — DynamoDB pagination', () => {
  let service: WebSocketNotificationService;

  beforeEach(() => {
    mockDynamoSend.mockReset();
    mockApiGatewaySend.mockReset().mockResolvedValue({});
    service = new WebSocketNotificationService(
      'connections-table',
      'https://ws.example.com',
    );
  });

  const getDynamoCalls = (): QueryCall[] =>
    mockDynamoSend.mock.calls.map((call: unknown[]) => call[0] as QueryCall);

  describe('getConnections via broadcast(leagueId)', () => {
    it('follows LastEvaluatedKey across all pages of the LeagueIdIndex Query', async () => {
      mockDynamoSend
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['c1', 'c2']),
          LastEvaluatedKey: { connectionId: { S: 'c2' } },
        })
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['c3', 'c4']),
          LastEvaluatedKey: { connectionId: { S: 'c4' } },
        })
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['c5']),
        });

      const result = await service.broadcast(
        { type: 'notification', data: {} },
        42,
      );

      const queryCalls = getDynamoCalls().filter((c) => c._type === 'Query');
      expect(queryCalls).toHaveLength(3);
      expect(queryCalls[0].input.ExclusiveStartKey).toBeUndefined();
      expect(queryCalls[1].input.ExclusiveStartKey).toEqual({
        connectionId: { S: 'c2' },
      });
      expect(queryCalls[2].input.ExclusiveStartKey).toEqual({
        connectionId: { S: 'c4' },
      });
      expect(mockApiGatewaySend).toHaveBeenCalledTimes(5);
      expect(result).toEqual({ sent: 5, failed: 0 });
    });

    it('stops after a single page when LastEvaluatedKey is absent', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Items: makeConnectionItems(['c1']),
      });

      await service.broadcast({ type: 'notification', data: {} }, 42);

      expect(getDynamoCalls()).toHaveLength(1);
      expect(mockApiGatewaySend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getConnections via broadcast() Scan', () => {
    it('follows LastEvaluatedKey across all Scan pages', async () => {
      mockDynamoSend
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['c1']),
          LastEvaluatedKey: { connectionId: { S: 'c1' } },
        })
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['c2', 'c3']),
        });

      const result = await service.broadcast({
        type: 'notification',
        data: {},
      });

      const scanCalls = getDynamoCalls().filter((c) => c._type === 'Scan');
      expect(scanCalls).toHaveLength(2);
      expect(scanCalls[0].input.ExclusiveStartKey).toBeUndefined();
      expect(scanCalls[1].input.ExclusiveStartKey).toEqual({
        connectionId: { S: 'c1' },
      });
      expect(result).toEqual({ sent: 3, failed: 0 });
    });
  });

  describe('getMatchupConnections via notifyPlayerStatsLoading', () => {
    it('follows LastEvaluatedKey across all pages of the MatchupIdIndex Query', async () => {
      mockDynamoSend
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['m1', 'm2']),
          LastEvaluatedKey: { connectionId: { S: 'm2' } },
        })
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['m3']),
        });

      await service.notifyPlayerStatsLoading(1, 99, 42);

      const queryCalls = getDynamoCalls().filter((c) => c._type === 'Query');
      expect(queryCalls).toHaveLength(2);
      expect(queryCalls[0].input.IndexName).toBe('MatchupIdIndex');
      expect(queryCalls[1].input.ExclusiveStartKey).toEqual({
        connectionId: { S: 'm2' },
      });
      expect(mockApiGatewaySend).toHaveBeenCalledTimes(3);
    });
  });

  describe('getUserConnections via notifyDirectMessage', () => {
    it('follows LastEvaluatedKey across all pages of the UserIdIndex Query', async () => {
      mockDynamoSend
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['u1']),
          LastEvaluatedKey: { connectionId: { S: 'u1' } },
        })
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['u2', 'u3']),
          LastEvaluatedKey: { connectionId: { S: 'u3' } },
        })
        .mockResolvedValueOnce({
          Items: makeConnectionItems(['u4']),
        });

      await service.notifyDirectMessage(123, {
        messageId: 1,
        fromUserId: 7,
        fromUsername: 'sender',
        toUserId: 123,
        leagueId: null,
        messageText: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      const queryCalls = getDynamoCalls().filter((c) => c._type === 'Query');
      expect(queryCalls).toHaveLength(3);
      expect(queryCalls[0].input.IndexName).toBe('UserIdIndex');
      expect(queryCalls[2].input.ExclusiveStartKey).toEqual({
        connectionId: { S: 'u3' },
      });
      expect(mockApiGatewaySend).toHaveBeenCalledTimes(4);
    });
  });
});
