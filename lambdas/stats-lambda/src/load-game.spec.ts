/**
 * Tests for load-game.ts — specifically the post-stats score calculation trigger (LS-1762)
 */

import type { SQSEvent, SQSRecord } from 'aws-lambda';

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
const mockGetScoringMultipliersForLeague = jest.fn();

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
  getScoringMultipliersForLeague: (...args: unknown[]): unknown =>
    mockGetScoringMultipliersForLeague(...args),
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

const mockCalculateAndUpdateMatchupScores = jest.fn();

jest.mock('./scoring-utils', () => ({
  calculateAndUpdateMatchupScores: (...args: unknown[]): unknown =>
    mockCalculateAndUpdateMatchupScores(...args),
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

    // Default: runWithPublicClient passes the mock db to the callback
    mockRunWithPublicClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) => {
        return cb(mockDb);
      },
    );

    // Default: scoring multipliers for league (snake_case keys from DB)
    mockGetScoringMultipliersForLeague.mockResolvedValue({
      batting: {
        h: 1,
        hr: 3,
        r: 1,
        rbi: 1,
        sb: 1,
        cs: -1,
        so: -0.5,
        doubles: 1,
        triples: 2,
        hbp: 1,
      },
      pitching: {
        w: 2,
        l: -2,
        sv: 3,
        so: 1,
        outs_recorded: 1,
        h: -1,
        er: -2,
        bb: -1,
      },
      fielding: { e_def: -1 },
    });

    // Default: all games complete
    mockCheckMatchupCompletion.mockResolvedValue('completed');

    // Default: score calculation succeeds
    mockCalculateAndUpdateMatchupScores.mockResolvedValue({
      matchupId: 42,
      team1Score: 125.5,
      team2Score: 98.3,
      team1GamesSelected: 5,
      team2GamesSelected: 5,
      gamesPerMatchup: 5,
      updated: true,
    });
  });

  // Expected scoring settings after snake_case → camelCase conversion
  const expectedScoringSettings = {
    batting: {
      h: 1,
      hr: 3,
      r: 1,
      rbi: 1,
      sb: 1,
      cs: -1,
      so: -0.5,
      doubles: 1,
      triples: 2,
      hbp: 1,
    },
    pitching: {
      w: 2,
      l: -2,
      sv: 3,
      so: 1,
      outsRecorded: 1,
      h: -1,
      er: -2,
      bb: -1,
    },
    fielding: { eDef: -1 },
  };

  it('calculates scores after stats loading completes for the final batch', async () => {
    const event = makeSqsEvent([makeMatchupMessage()]);

    await handler(event);

    expect(mockCalculateAndUpdateMatchupScores).toHaveBeenCalledWith(
      mockDb,
      42,
      expectedScoringSettings,
      true, // forceRecalculation
    );
  });

  it('calculates scores when last batch of multi-batch message completes', async () => {
    const event = makeSqsEvent([
      makeMatchupMessage({ batchIndex: 2, totalBatches: 3 }),
    ]);

    await handler(event);

    expect(mockCalculateAndUpdateMatchupScores).toHaveBeenCalledWith(
      mockDb,
      42,
      expectedScoringSettings,
      true,
    );
  });

  it('does not calculate scores for non-last batches', async () => {
    const event = makeSqsEvent([
      makeMatchupMessage({ batchIndex: 0, totalBatches: 3 }),
    ]);

    await handler(event);

    expect(mockCalculateAndUpdateMatchupScores).not.toHaveBeenCalled();
  });

  it('does not calculate scores when stats loading fails for all players', async () => {
    mockLoadPlayerGameStats.mockRejectedValue(new Error('scrape failed'));

    const event = makeSqsEvent([makeMatchupMessage()]);

    await handler(event);

    // All players failed => finalStatus is 'failed', not 'completed'
    expect(mockCalculateAndUpdateMatchupScores).not.toHaveBeenCalled();
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
    expect(mockCalculateAndUpdateMatchupScores).toHaveBeenCalledWith(
      mockDb,
      42,
      expectedScoringSettings,
      true,
    );
  });

  it('does not fail the SQS message if score calculation throws', async () => {
    mockCalculateAndUpdateMatchupScores.mockRejectedValue(
      new Error('scoring engine error'),
    );

    const event = makeSqsEvent([makeMatchupMessage()]);

    const result = await handler(event);

    // Score calculation error is non-fatal — message should succeed
    expect(result.batchItemFailures).toEqual([]);
  });
});
