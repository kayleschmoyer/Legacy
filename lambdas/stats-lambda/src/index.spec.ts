import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';

// ── Mocks (must precede module import) ──────────────────────────────────────

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
  getRollbarConfigFromEnv: jest.fn(() => null),
  initRollbar: jest.fn(),
  withRollbar: jest.fn((fn: unknown) => fn),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  formatVersionInfo: jest.fn(() => ''),
  getVersionInfo: jest.fn(() => ({})),
}));

const mockGameHandler = jest.fn<Promise<SQSBatchResponse>, [SQSEvent]>();
const mockCareerHandler = jest.fn<Promise<SQSBatchResponse>, [SQSEvent]>();
const mockMlbStatsHandler = jest.fn<SQSBatchResponse, [SQSEvent]>();

jest.mock('./load-game', () => ({
  handler: (...args: [SQSEvent]) => mockGameHandler(...args),
}));

jest.mock('./load-career', () => ({
  handler: (...args: [SQSEvent]) => mockCareerHandler(...args),
}));

jest.mock('./load-mlb-stats', () => ({
  isMlbStatsMessage:
    jest.requireActual<typeof import('./load-mlb-stats')>('./load-mlb-stats')
      .isMlbStatsMessage,
  handler: (...args: [SQSEvent]) => mockMlbStatsHandler(...args),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSqsEvent(bodies: string[]): SQSEvent {
  return {
    Records: bodies.map(
      (body, i) =>
        ({
          messageId: `msg-${i}`,
          body,
          receiptHandle: '',
          attributes: {} as SQSRecord['attributes'],
          messageAttributes: {},
          md5OfBody: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:test-queue',
          awsRegion: 'us-east-1',
        }) satisfies SQSRecord,
    ),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

import { handler } from './index';

describe('stats-lambda router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGameHandler.mockResolvedValue({ batchItemFailures: [] });
    mockCareerHandler.mockResolvedValue({ batchItemFailures: [] });
    mockMlbStatsHandler.mockReturnValue({ batchItemFailures: [] });
  });

  it('returns empty batchItemFailures for an empty event', async () => {
    const result = await handler(makeSqsEvent([]));
    expect(result.batchItemFailures).toEqual([]);
    expect(mockGameHandler).not.toHaveBeenCalled();
    expect(mockCareerHandler).not.toHaveBeenCalled();
  });

  it('routes mlb-player-stats messages to the mlb stats handler', async () => {
    const body = JSON.stringify({
      type: 'mlb-player-stats',
      mlbPlayerId: 123,
      season: 2024,
    });
    const event = makeSqsEvent([body]);

    await handler(event);

    expect(mockMlbStatsHandler).toHaveBeenCalledWith(event);
    expect(mockGameHandler).not.toHaveBeenCalled();
    expect(mockCareerHandler).not.toHaveBeenCalled();
  });

  it('routes matchup-format messages to the game handler', async () => {
    const body = JSON.stringify({
      matchupId: 42,
      players: [
        {
          matchupPlayerId: 1,
          playerId: 10,
          brefId: 'foo01',
          season: 1990,
          fieldingGamePos: 'SS',
        },
      ],
    });
    const event = makeSqsEvent([body]);

    await handler(event);

    expect(mockGameHandler).toHaveBeenCalledWith(event);
    expect(mockCareerHandler).not.toHaveBeenCalled();
  });

  it('routes legacy game-stats messages to the game handler', async () => {
    const body = JSON.stringify({ statType: 'batting', gameNum: 5 });
    const event = makeSqsEvent([body]);

    await handler(event);

    expect(mockGameHandler).toHaveBeenCalledWith(event);
    expect(mockCareerHandler).not.toHaveBeenCalled();
  });

  it('routes career-stats (plain string) messages to the career handler', async () => {
    const body = JSON.stringify('ruthba01');
    const event = makeSqsEvent([body]);

    await handler(event);

    expect(mockCareerHandler).toHaveBeenCalledWith(event);
    expect(mockGameHandler).not.toHaveBeenCalled();
  });

  it('returns all records as failures for unknown message format', async () => {
    const body = JSON.stringify({ unknownField: true });
    const event = makeSqsEvent([body]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockGameHandler).not.toHaveBeenCalled();
    expect(mockCareerHandler).not.toHaveBeenCalled();
  });

  it('returns all records as failures when JSON parsing fails', async () => {
    const event = makeSqsEvent(['not-valid-json']);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
  });

  it('routes based on the first record only', async () => {
    // First record is matchup format — all records go to gameHandler
    const matchupBody = JSON.stringify({
      matchupId: 1,
      players: [
        {
          matchupPlayerId: 1,
          playerId: 1,
          brefId: 'x',
          season: 2000,
          fieldingGamePos: 'C',
        },
      ],
    });
    const careerBody = JSON.stringify('ruthba01');
    const event = makeSqsEvent([matchupBody, careerBody]);

    await handler(event);

    expect(mockGameHandler).toHaveBeenCalledWith(event);
    expect(mockCareerHandler).not.toHaveBeenCalled();
  });
});
