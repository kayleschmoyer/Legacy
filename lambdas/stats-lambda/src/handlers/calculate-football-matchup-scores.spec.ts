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
const mockGetMatchupFootballPlayerGameStats = jest.fn();
const mockUpdateMatchupScore = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  getMatchupFootballPlayerGameStats: (...args: unknown[]): unknown =>
    mockGetMatchupFootballPlayerGameStats(...args),
  updateMatchupScore: (...args: unknown[]): unknown =>
    mockUpdateMatchupScore(...args),
  PublicSchema: {
    matchupPlayers: { id: 'id', matchupId: 'matchupId', teamId: 'teamId' },
  },
}));

jest.mock('@legacy-sports/scoring', () => ({
  computeDefenseScore: jest.fn(() => 0),
  computeIDPScore: jest.fn(() => 0),
  computeScoring: jest.fn(() => 0),
  DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS: [],
  DEFAULT_DEFENSE_SCORING: {},
  DEFAULT_IDP_SCORING: {},
  DEFAULT_KICKING_SCORING: {},
  DEFAULT_PASSING_SCORING: {},
  DEFAULT_RECEIVING_SCORING: {},
  DEFAULT_RUSHING_SCORING: {},
}));

const mockEmitSuccess = jest.fn();
const mockEmitFailure = jest.fn();

jest.mock('../football-metrics', () => ({
  emitFootballSuccess: (...args: unknown[]): unknown =>
    mockEmitSuccess(...args),
  emitFootballFailure: (...args: unknown[]): unknown =>
    mockEmitFailure(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import {
  handler,
  isFootballScoreMessage,
} from './calculate-football-matchup-scores';

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

const validBody = JSON.stringify({
  type: 'football-calculate-scores',
  matchupId: 7,
});

const mockDb = {
  query: { matchups: { findFirst: jest.fn() } },
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnValue([]),
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('isFootballScoreMessage', () => {
  it('returns true for football-calculate-scores with matchupId', () => {
    expect(
      isFootballScoreMessage({
        type: 'football-calculate-scores',
        matchupId: 1,
      }),
    ).toBe(true);
  });

  it('returns false when matchupId is not a number', () => {
    expect(isFootballScoreMessage({ type: 'football-calculate-scores' })).toBe(
      false,
    );
  });

  it('returns false for other types', () => {
    expect(
      isFootballScoreMessage({ type: 'football-matchup-scores', matchupId: 1 }),
    ).toBe(false);
    expect(isFootballScoreMessage(null)).toBe(false);
    expect(isFootballScoreMessage('string')).toBe(false);
  });
});

describe('calculate-football-matchup-scores handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmitSuccess.mockResolvedValue(undefined);
    mockEmitFailure.mockResolvedValue(undefined);
    mockRunWithPublicClient.mockImplementation(
      (_opts: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
    );
    mockDb.query.matchups.findFirst.mockResolvedValue({
      id: 7,
      team1Id: 1,
      team2Id: 2,
      team1Score: null,
      team2Score: null,
    });
    mockDb.where.mockReturnValue([]);
    mockGetMatchupFootballPlayerGameStats.mockResolvedValue([]);
    mockUpdateMatchupScore.mockResolvedValue({
      team1Score: '0',
      team2Score: '0',
    });
  });

  it('processes valid message and emits success metric', async () => {
    const result = await handler(makeSqsEvent([validBody]));

    expect(result.batchItemFailures).toEqual([]);
    expect(mockEmitSuccess).toHaveBeenCalledWith('matchup_score');
    expect(mockEmitFailure).not.toHaveBeenCalled();
  });

  it('adds to batchItemFailures and emits failure metric when DB throws', async () => {
    mockDb.query.matchups.findFirst.mockRejectedValue(
      new Error('DB connection failed'),
    );

    const result = await handler(makeSqsEvent([validBody]));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockEmitFailure).toHaveBeenCalledWith('matchup_score');
    expect(mockEmitSuccess).not.toHaveBeenCalled();
  });

  it('adds to batchItemFailures without metric on invalid JSON', async () => {
    const result = await handler(makeSqsEvent(['not-valid-json']));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockEmitSuccess).not.toHaveBeenCalled();
    expect(mockEmitFailure).not.toHaveBeenCalled();
  });

  it('only fails the failing record in a mixed batch', async () => {
    mockDb.query.matchups.findFirst
      .mockResolvedValueOnce({
        id: 7,
        team1Id: 1,
        team2Id: 2,
        team1Score: null,
        team2Score: null,
      })
      .mockRejectedValueOnce(new Error('DB error'));

    const result = await handler(makeSqsEvent([validBody, validBody]));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
    expect(mockEmitSuccess).toHaveBeenCalledTimes(1);
    expect(mockEmitFailure).toHaveBeenCalledTimes(1);
  });
});
