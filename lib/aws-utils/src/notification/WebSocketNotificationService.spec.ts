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

import { WireNotificationType } from '@legacy-sports/utils';
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

  describe('notifyDraftCompleted — published envelope contract (LS-8883)', () => {
    it('broadcasts a DRAFT_COMPLETED envelope filtered to the league via LeagueIdIndex', async () => {
      mockDynamoSend.mockResolvedValueOnce({
        Items: makeConnectionItems(['c1', 'c2']),
      });

      await service.notifyDraftCompleted(42, 'automated');

      const queryCalls = getDynamoCalls().filter((c) => c._type === 'Query');
      expect(queryCalls).toHaveLength(1);
      expect(queryCalls[0].input.IndexName).toBe('LeagueIdIndex');

      expect(mockApiGatewaySend).toHaveBeenCalledTimes(2);
      for (const [command] of mockApiGatewaySend.mock.calls) {
        const published = JSON.parse(
          (command as { input: { Data: Buffer } }).input.Data.toString('utf-8'),
        ) as { type: string; data: Record<string, unknown> };

        expect(published).toEqual({
          type: 'notification',
          data: {
            type: WireNotificationType.DRAFT_COMPLETED,
            leagueId: 42,
            selectionMethod: 'automated',
            completedAt: expect.any(String) as string,
          },
        });
      }
    });
  });

  describe('sendToConnection — signature-expired retry (LS-8388)', () => {
    const logging = jest.requireMock<{
      LOGGER: { error: jest.Mock; warn: jest.Mock };
    }>('@legacy-sports/logging');

    const signatureExpiredError = Object.assign(
      new Error(
        'Signature expired: 20260707T212942Z is now earlier than 20260707T213035Z (20260707T213535Z - 5 min.)',
      ),
      { name: 'InvalidSignatureException' },
    );

    beforeEach(() => {
      mockDynamoSend.mockReset().mockResolvedValue({
        Items: makeConnectionItems(['c1']),
      });
    });

    it('retries once with a freshly signed request and succeeds', async () => {
      mockApiGatewaySend
        .mockReset()
        .mockRejectedValueOnce(signatureExpiredError)
        .mockResolvedValueOnce({});

      await service.notifyDirectMessage(123, {
        messageId: 1,
        fromUserId: 7,
        fromUsername: 'sender',
        toUserId: 123,
        leagueId: null,
        messageText: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      expect(mockApiGatewaySend).toHaveBeenCalledTimes(2);
      expect(logging.LOGGER.error).not.toHaveBeenCalled();
      expect(logging.LOGGER.warn).toHaveBeenCalledWith(
        'Signature expired sending to connection, retrying with a freshly signed request',
        { connectionId: 'c1' },
      );
    });

    it('logs a warning (not an error) when the retry also fails', async () => {
      mockApiGatewaySend
        .mockReset()
        .mockRejectedValueOnce(signatureExpiredError)
        .mockRejectedValueOnce(signatureExpiredError);

      await service.notifyDirectMessage(123, {
        messageId: 1,
        fromUserId: 7,
        fromUsername: 'sender',
        toUserId: 123,
        leagueId: null,
        messageText: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      });

      expect(mockApiGatewaySend).toHaveBeenCalledTimes(2);
      expect(logging.LOGGER.error).not.toHaveBeenCalled();
      expect(logging.LOGGER.warn).toHaveBeenCalledWith(
        'Error sending message to connection after signature-expiry retry',
        { connectionId: 'c1', error: signatureExpiredError },
      );
    });
  });
});
