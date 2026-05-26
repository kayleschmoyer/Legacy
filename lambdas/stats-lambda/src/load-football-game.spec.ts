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
  PublicSchema: {},
}));

jest.mock('@legacy-sports/pfr-client', () => ({
  CareerStats: { getGameLog: jest.fn() },
  IDPStats: { getGameLog: jest.fn() },
  TeamDefense: { getGameLog: jest.fn() },
}));

jest.mock('./load-game-types', () => ({
  PLAYER_PROCESSING_BUDGET_MS: 30000,
}));

jest.mock('./retry-strategy', () => ({
  isRateLimitError: jest.fn(() => false),
  isRetryableError: jest.fn(() => false),
}));

const mockUpdateMatchupStatus = jest.fn();
const mockCheckMatchupCompletion = jest.fn();
const mockSelectAndAssignFootballGameIdentifiers = jest.fn();

jest.mock('./game-state-manager', () => ({
  updateMatchupStatus: (...args: unknown[]): unknown =>
    mockUpdateMatchupStatus(...args),
  checkMatchupCompletion: (...args: unknown[]): unknown =>
    mockCheckMatchupCompletion(...args),
  selectAndAssignFootballGameIdentifiers: (...args: unknown[]): unknown =>
    mockSelectAndAssignFootballGameIdentifiers(...args),
}));

jest.mock('./handlers/calculate-football-matchup-scores', () => ({
  calculateAndUpdateFootballMatchupScores: jest.fn(),
  isFootballScoreMessage: jest.fn(),
}));

jest.mock('./constants', () => ({
  IDP_POSITIONS: [],
  validateNflTeam: jest.fn(),
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

import { handler, isFootballGameMessage } from './load-football-game';

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

// Valid message: matchupId + players array required by isFootballGameMessage
const validBody = JSON.stringify({
  type: 'football-game-stats',
  matchupId: 1,
  players: [],
});

const mockDb = {} as unknown;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('isFootballGameMessage', () => {
  it('returns true for football-game-stats with matchupId and players', () => {
    expect(
      isFootballGameMessage({
        type: 'football-game-stats',
        matchupId: 1,
        players: [],
      }),
    ).toBe(true);
  });

  it('returns false when players is not an array', () => {
    expect(
      isFootballGameMessage({ type: 'football-game-stats', matchupId: 1 }),
    ).toBe(false);
  });

  it('returns false for other types', () => {
    expect(isFootballGameMessage({ type: 'football-season-stats' })).toBe(
      false,
    );
    expect(isFootballGameMessage({ type: 'mlb-player-stats' })).toBe(false);
    expect(isFootballGameMessage(null)).toBe(false);
    expect(isFootballGameMessage('string')).toBe(false);
  });
});

describe('load-football-game handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitSuccess.mockResolvedValue(undefined);
    mockEmitFailure.mockResolvedValue(undefined);
    mockRunWithPublicClient.mockImplementation(
      (_opts: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
    );
    mockUpdateMatchupStatus.mockResolvedValue(undefined);
  });

  it('processes valid message with no players and emits success metric', async () => {
    const result = await handler(makeSqsEvent([validBody]));

    expect(result.batchItemFailures).toEqual([]);
    expect(mockEmitSuccess).toHaveBeenCalledWith('game_load');
    expect(mockEmitFailure).not.toHaveBeenCalled();
  });

  it('adds to batchItemFailures and emits failure metric when processing throws', async () => {
    mockUpdateMatchupStatus.mockRejectedValue(new Error('DB error'));

    const result = await handler(makeSqsEvent([validBody]));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockEmitFailure).toHaveBeenCalledWith('game_load');
    expect(mockEmitSuccess).not.toHaveBeenCalled();
  });

  it('adds to batchItemFailures without metric on invalid JSON', async () => {
    const result = await handler(makeSqsEvent(['not-valid-json']));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockEmitSuccess).not.toHaveBeenCalled();
    expect(mockEmitFailure).not.toHaveBeenCalled();
  });

  it('processes multiple records independently', async () => {
    mockUpdateMatchupStatus
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await handler(makeSqsEvent([validBody, validBody]));

    expect(result.batchItemFailures).toEqual([]);
    expect(mockEmitSuccess).toHaveBeenCalledTimes(2);
  });

  it('only fails the failing record in a mixed batch', async () => {
    mockUpdateMatchupStatus
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DB error'));

    const result = await handler(makeSqsEvent([validBody, validBody]));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
    expect(mockEmitSuccess).toHaveBeenCalledTimes(1);
    expect(mockEmitFailure).toHaveBeenCalledTimes(1);
  });
});
