import type { SQSRecord } from 'aws-lambda';

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
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

const mockRunWithPublicClient = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  PublicSchema: {
    footballSeasonDefenseIdp: {},
  },
}));

jest.mock('@legacy-sports/pfr-client', () => ({
  IDPStats: { getSeasonTotals: jest.fn() },
}));

jest.mock('./constants', () => ({
  IDP_POSITIONS: [],
  validatePfrId: jest.fn(),
}));

const mockEmitSuccess = jest.fn();
const mockEmitFailure = jest.fn();

jest.mock('./football-metrics', () => ({
  emitFootballSuccess: (...args: unknown[]): unknown =>
    mockEmitSuccess(...args),
  emitFootballFailure: (...args: unknown[]): unknown =>
    mockEmitFailure(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { handler, isFootballSeasonMessage } from './load-football-season';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSqsEvent(bodies: string[]) {
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
          eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:test',
          awsRegion: 'us-east-1',
        }) satisfies SQSRecord,
    ),
  };
}

// Valid message: type + players array required by isFootballSeasonMessage
const validBody = JSON.stringify({
  type: 'football-season-stats',
  players: [],
});

const mockDb = {} as unknown;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('isFootballSeasonMessage', () => {
  it('returns true for football-season-stats with players array', () => {
    expect(
      isFootballSeasonMessage({ type: 'football-season-stats', players: [] }),
    ).toBe(true);
  });

  it('returns false when players is not an array', () => {
    expect(isFootballSeasonMessage({ type: 'football-season-stats' })).toBe(
      false,
    );
  });

  it('returns false for other types', () => {
    expect(isFootballSeasonMessage({ type: 'football-game-stats' })).toBe(
      false,
    );
    expect(isFootballSeasonMessage({ type: 'mlb-player-stats' })).toBe(false);
    expect(isFootballSeasonMessage(null)).toBe(false);
    expect(isFootballSeasonMessage('string')).toBe(false);
  });
});

describe('load-football-season handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitSuccess.mockResolvedValue(undefined);
    mockEmitFailure.mockResolvedValue(undefined);
    mockRunWithPublicClient.mockImplementation(
      (_opts: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
    );
  });

  it('processes valid message with no players and emits success metric', async () => {
    const result = await handler(makeSqsEvent([validBody]));

    expect(result.batchItemFailures).toEqual([]);
    expect(mockEmitSuccess).toHaveBeenCalledWith('season_load');
    expect(mockEmitFailure).not.toHaveBeenCalled();
  });

  it('adds to batchItemFailures and emits failure metric when processing throws', async () => {
    mockEmitSuccess.mockRejectedValue(new Error('metric error'));

    const result = await handler(makeSqsEvent([validBody]));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockEmitFailure).toHaveBeenCalledWith('season_load');
    expect(mockEmitSuccess).toHaveBeenCalledTimes(1);
  });

  it('adds to batchItemFailures without metric on invalid JSON', async () => {
    const result = await handler(makeSqsEvent(['not-valid-json']));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockEmitSuccess).not.toHaveBeenCalled();
    expect(mockEmitFailure).not.toHaveBeenCalled();
  });

  it('processes multiple records independently', async () => {
    const result = await handler(makeSqsEvent([validBody, validBody]));

    expect(result.batchItemFailures).toEqual([]);
    expect(mockEmitSuccess).toHaveBeenCalledTimes(2);
  });

  it('only fails the failing record in a mixed batch', async () => {
    mockEmitSuccess
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('metric error'));

    const result = await handler(makeSqsEvent([validBody, validBody]));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
    expect(mockEmitSuccess).toHaveBeenCalledTimes(2);
    expect(mockEmitFailure).toHaveBeenCalledTimes(1);
  });
});
