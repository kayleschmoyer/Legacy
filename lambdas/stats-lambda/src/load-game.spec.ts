/**
 * Tests for load-game.ts — specifically the post-stats score calculation trigger (LS-1762)
 */

import type { SQSEvent, SQSRecord } from 'aws-lambda';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockLoggerWarn = jest.fn();
const mockCaptureError = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: (...args: unknown[]): unknown => mockLoggerWarn(...args),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/rollbar', () => ({
  addBreadcrumb: jest.fn(),
  captureError: (...args: unknown[]): unknown => mockCaptureError(...args),
  getRollbarConfigFromEnv: jest.fn(() => null),
  initRollbar: jest.fn(),
  withRollbar: jest.fn((fn: unknown) => fn),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(() => null),
}));

jest.mock('@legacy-sports/bref-client', () => ({
  cleanupCache: jest.fn(() => 0),
  getCacheStats: jest.fn(() => ({
    totalEntries: 0,
    totalSizeBytes: 0,
    avgAgeSeconds: 0,
  })),
}));

const mockRunWithPublicClient = jest.fn();

// Track the mock db's select/from/where chain for leagueId lookup
const mockSelectFrom = {
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([{ leagueId: 100 }]),
};
const mockSelectChain = {
  from: jest.fn().mockReturnValue(mockSelectFrom),
};
const mockCountChain = {
  from: jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue([{ count: 10 }]),
  }),
};

const mockDb = {
  select: jest.fn().mockImplementation((arg) => {
    // If called with count() arg, return count chain
    if (arg && typeof arg === 'object' && 'count' in arg) {
      return mockCountChain;
    }
    return mockSelectChain;
  }),
  update: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  }),
};

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  PublicSchema: {
    matchups: { id: 'matchups.id', leagueId: 'matchups.league_id' },
    matchupPlayers: { matchupId: 'matchup_players.matchup_id' },
    matchupPlayerGames: {
      matchupPlayerId: 'matchup_player_games.matchup_player_id',
      gameNum: 'matchup_player_games.game_num',
    },
  },
}));

const mockLoadPlayerGameStats = jest.fn().mockResolvedValue(undefined);

jest.mock('./player-stats-loader', () => ({
  loadPlayerGameStats: (...args: unknown[]): unknown =>
    mockLoadPlayerGameStats(...args),
}));

const mockCheckMatchupCompletion = jest.fn();
const mockUpdateMatchupStatus = jest.fn().mockResolvedValue(undefined);

jest.mock('./game-state-manager', () => ({
  checkMatchupCompletion: (...args: unknown[]): unknown =>
    mockCheckMatchupCompletion(...args),
  updateMatchupStatus: (...args: unknown[]): unknown =>
    mockUpdateMatchupStatus(...args),
}));

const mockScoreMatchup = jest.fn();

jest.mock('@legacy-sports/scoring-utils', () => ({
  scoreMatchup: (...args: unknown[]): unknown => mockScoreMatchup(...args),
}));

jest.mock('./retry-strategy', () => ({
  isRetryableError: jest.fn(() => false),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { handler } from './load-game';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSqsEvent(bodies: string[]): SQSEvent {
  return {
    Records: bodies.map(
      (body, i) =>
        ({
          messageId: `msg-${i}`,
          body,
          receiptHandle: '',
          attributes: {
            ApproximateReceiveCount: '1',
          } as unknown as SQSRecord['attributes'],
          messageAttributes: {},
          md5OfBody: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:test-queue',
          awsRegion: 'us-east-1',
        }) satisfies SQSRecord,
    ),
  };
}

function makeMatchupMessage(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    matchupId: 42,
    players: [
      {
        matchupPlayerId: 1,
        playerId: 10,
        brefId: 'player01',
        season: 1985,
        gamePosition: 'SS',
      },
    ],
    ...overrides,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('load-game score calculation trigger (LS-1762)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-establish the default implementation: clearAllMocks clears recorded
    // calls but NOT implementations, so the all-players-fail test's
    // mockRejectedValue would otherwise leak into every later test.
    mockLoadPlayerGameStats.mockResolvedValue(undefined);

    // Default: runWithPublicClient passes the mock db to the callback
    mockRunWithPublicClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
        return cb(mockDb);
      },
    );

    // Default: all games complete
    mockCheckMatchupCompletion.mockResolvedValue('completed');

    // Default: score calculation succeeds
    mockScoreMatchup.mockResolvedValue({
      matchupId: 42,
      team1Score: 125.5,
      team2Score: 98.3,
      team1GamesSelected: 5,
      team2GamesSelected: 5,
      gamesPerMatchup: 5,
      updated: true,
    });
  });

  it('calculates scores after stats loading completes for the final batch', async () => {
    const event = makeSqsEvent([makeMatchupMessage()]);

    await handler(event);

    // load-game's only scoring responsibility is handing the shared function
    // the matchup and the league it belongs to. Resolving that league's
    // multipliers happens inside the shared function, where no call site can
    // get it wrong (LS-9532).
    expect(mockScoreMatchup).toHaveBeenCalledWith(mockDb, 42, 100, {
      forceRecalculation: true,
    });
  });

  it('calculates scores when last batch of multi-batch message completes', async () => {
    const event = makeSqsEvent([
      makeMatchupMessage({ batchIndex: 2, totalBatches: 3 }),
    ]);

    await handler(event);

    expect(mockScoreMatchup).toHaveBeenCalledWith(mockDb, 42, 100, {
      forceRecalculation: true,
    });
  });

  it('does not calculate scores for non-last batches', async () => {
    const event = makeSqsEvent([
      makeMatchupMessage({ batchIndex: 0, totalBatches: 3 }),
    ]);

    await handler(event);

    expect(mockScoreMatchup).not.toHaveBeenCalled();
  });

  it('does not calculate scores when stats loading fails for all players', async () => {
    mockLoadPlayerGameStats.mockRejectedValue(new Error('scrape failed'));

    const event = makeSqsEvent([makeMatchupMessage()]);

    await handler(event);

    // All players failed => finalStatus is 'failed', not 'completed'
    expect(mockScoreMatchup).not.toHaveBeenCalled();
  });

  it('still calculates scores on partial failure (some players succeed)', async () => {
    // First player succeeds, second fails
    mockLoadPlayerGameStats
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('scrape failed'));

    const event = makeSqsEvent([
      makeMatchupMessage({
        players: [
          {
            matchupPlayerId: 1,
            playerId: 10,
            brefId: 'player01',
            season: 1985,
            gamePosition: 'SS',
          },
          {
            matchupPlayerId: 2,
            playerId: 11,
            brefId: 'player02',
            season: 1985,
            gamePosition: 'C',
          },
        ],
      }),
    ]);

    await handler(event);

    // Partial success => finalStatus is 'completed' => scores calculated
    expect(mockScoreMatchup).toHaveBeenCalledWith(mockDb, 42, 100, {
      forceRecalculation: true,
    });
  });

  it('does not fail the SQS message if score calculation throws', async () => {
    mockScoreMatchup.mockRejectedValue(new Error('scoring engine error'));

    const event = makeSqsEvent([makeMatchupMessage()]);

    const result = await handler(event);

    // Score calculation error is non-fatal — message should succeed
    expect(result.batchItemFailures).toEqual([]);
  });

  it('does not report to Rollbar when matchup was deleted between enqueue and processing (LS-8086)', async () => {
    mockScoreMatchup.mockRejectedValue(new Error('Matchup 42 not found'));

    const event = makeSqsEvent([makeMatchupMessage()]);
    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(mockCaptureError).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'post-stats-score-calculation' }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('matchup 42 no longer exists'),
      expect.objectContaining({ matchupId: 42 }),
    );
  });

  it('skips scoring without alerting when the leagueId lookup finds no matchup (LS-9535)', async () => {
    // No matchup row -> leagueId stays null. Scoring without the league's own
    // multipliers would silently persist default-scored values, so the handler
    // must skip rather than fall back to defaults.
    mockSelectFrom.limit.mockResolvedValueOnce([]);

    const event = makeSqsEvent([makeMatchupMessage()]);
    const result = await handler(event);

    expect(mockScoreMatchup).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toEqual([]);
    expect(mockCaptureError).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'post-stats-score-calculation' }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('matchup 42 no longer exists'),
      expect.objectContaining({ matchupId: 42 }),
    );
  });
});
