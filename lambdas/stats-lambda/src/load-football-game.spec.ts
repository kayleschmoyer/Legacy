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

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    runWithPublicClient: (...args: unknown[]): unknown =>
      mockRunWithPublicClient(...args),
    PublicSchema: {
      gameFootballPassing: { name: 'game_football_passing' },
      gameFootballRushing: { name: 'game_football_rushing' },
      gameFootballReceiving: { name: 'game_football_receiving' },
      gameFootballKicking: { name: 'game_football_kicking' },
      gameFootballDefense: { name: 'game_football_defense' },
      gameFootballDefenseIdp: { name: 'game_football_defense_idp' },
      matchupPlayerGames: { name: 'matchup_player_games' },
    },
  }),
);

jest.mock('drizzle-orm', () =>
  mockDrizzleOrm({
    and: jest.fn(() => 'and'),
    eq: jest.fn(() => 'eq'),
  }),
);

const mockGetCareerGameLog = jest.fn();
const mockGetIdpGameLog = jest.fn();
const mockGetTeamDefenseGameLog = jest.fn();

jest.mock('./football-game-stats-source', () => {
  class FootballCorpusUnavailableError extends Error {}
  const actual = jest.requireActual<
    typeof import('./football-game-stats-source')
  >('./football-game-stats-source');
  return {
    FootballCorpusUnavailableError,
    resolvePlayerCorpusKey: actual.resolvePlayerCorpusKey,
    getFootballGameStatsSource: jest.fn(() => ({
      name: 'nflverse',
      getCareerGameLog: (...args: unknown[]): unknown =>
        mockGetCareerGameLog(...args),
      getIdpGameLog: (...args: unknown[]): unknown =>
        mockGetIdpGameLog(...args),
      getTeamDefenseGameLog: (...args: unknown[]): unknown =>
        mockGetTeamDefenseGameLog(...args),
    })),
  };
});

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
  validateFootballCorpusKey: jest.fn(),
}));

const mockEmitSuccess = jest.fn();
const mockEmitFailure = jest.fn();

jest.mock('./football-metrics', () => ({
  emitFootballSuccess: (...args: unknown[]): unknown =>
    mockEmitSuccess(...args),
  emitFootballFailure: (...args: unknown[]): unknown =>
    mockEmitFailure(...args),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationPublisher: jest.fn(() => null),
}));

const mockPublishFootballGameAlerts = jest.fn();

jest.mock('./football-notification-triggers', () => ({
  publishFootballGameAlerts: (...args: unknown[]): unknown =>
    mockPublishFootballGameAlerts(...args),
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
    mockUpdateMatchupStatus.mockRejectedValueOnce(new Error('DB error'));

    const result = await handler(makeSqsEvent([validBody]));

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockEmitFailure).toHaveBeenCalledWith('game_load');
    expect(mockEmitSuccess).not.toHaveBeenCalled();
  });

  it('still returns batchItemFailures when the DB is persistently down (LS-8308)', async () => {
    // Every call rejects — including the catch-path status update. The
    // handler must not throw: a thrown invocation drops batchItemFailures
    // and makes SQS re-drive the entire batch, succeeded records included.
    mockUpdateMatchupStatus.mockRejectedValue(new Error('DB down'));

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

// ── Per-player corpus loading (LS-10214) ────────────────────────────────────

/**
 * Minimal drizzle stand-in: every cache-check SELECT finds nothing, and every
 * INSERT / UPDATE is recorded so tests can assert what was written.
 */
function makeFakeDb() {
  const inserts: { table: unknown; rows: unknown[] }[] = [];
  const updates: { table: unknown; values: unknown }[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (rows: unknown[]) => {
        inserts.push({ table, rows });
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => {
        updates.push({ table, values });
        return { where: () => Promise.resolve() };
      },
    }),
  };
  return { db, inserts, updates };
}

function playerBody(season: number, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'football-game-stats',
    matchupId: 7,
    players: [
      {
        playerId: 42,
        pfrId: 'MahoPa00',
        season,
        isDst: false,
        position: 'QB',
        nflTeam: 'KAN',
        matchupPlayerId: 900,
        ...overrides,
      },
    ],
  });
}

describe('load-football-game per-player corpus loading', () => {
  let fake: ReturnType<typeof makeFakeDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    fake = makeFakeDb();
    mockEmitSuccess.mockResolvedValue(undefined);
    mockEmitFailure.mockResolvedValue(undefined);
    mockRunWithPublicClient.mockImplementation(
      (_opts: unknown, fn: (db: unknown) => Promise<unknown>) => fn(fake.db),
    );
    mockUpdateMatchupStatus.mockResolvedValue(undefined);
    mockSelectAndAssignFootballGameIdentifiers.mockResolvedValue(undefined);
    mockCheckMatchupCompletion.mockResolvedValue('completed');
  });

  it('writes corpus rows with the app playerId on a hit', async () => {
    mockGetCareerGameLog.mockResolvedValueOnce({
      passing: [
        {
          season: 2023,
          gameNum: 1,
          gameIdentifier: '2023-09-07-KC',
          cmp: 21,
          att: 39,
          yds: 226,
          td: 2,
          int: 1,
          sacked: 2,
          sackYds: 14,
          rating: null,
        },
      ],
      rushing: [],
      receiving: [],
      kicking: [],
    });

    const result = await handler(makeSqsEvent([playerBody(2023)]));

    expect(result.batchItemFailures).toEqual([]);
    expect(mockGetCareerGameLog).toHaveBeenCalledWith('MahoPa00', 2023);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]?.rows).toEqual([
      expect.objectContaining({
        playerId: 42,
        season: 2023,
        gameIdentifier: '2023-09-07-KC',
        interceptions: 1,
      }),
    ]);
    expect(mockSelectAndAssignFootballGameIdentifiers).toHaveBeenCalledWith(
      fake.db,
      900,
      42,
      2023,
      false,
      'QB',
    );
  });

  it('reads a player with no pfr_id by pfa-<pfaId> (ADR 0023, LS-10588)', async () => {
    mockGetCareerGameLog.mockResolvedValueOnce(null);

    const result = await handler(
      makeSqsEvent([
        playerBody(1960, { pfrId: null, pfaId: 'unit00100', nflTeam: null }),
      ]),
    );

    expect(result.batchItemFailures).toEqual([]);
    expect(mockGetCareerGameLog).toHaveBeenCalledWith('pfa-unit00100', 1960);
  });

  it('reads DST games by nflTeam from the corpus', async () => {
    mockGetTeamDefenseGameLog.mockResolvedValueOnce([
      {
        season: 1999,
        gameNum: 1,
        gameIdentifier: '1999-09-12-KC',
        sacks: 3,
        int: 1,
        fumRec: 0,
        defTd: 0,
        safeties: 0,
        ptsAllowed: 17,
        ydsAllowed: 310,
        passYdsAllowed: 210,
        rushYdsAllowed: 100,
      },
    ]);

    await handler(
      makeSqsEvent([
        playerBody(1999, { isDst: true, position: 'DST', pfrId: 'kan' }),
      ]),
    );

    expect(mockGetTeamDefenseGameLog).toHaveBeenCalledWith('KAN', 1999);
    expect(fake.inserts[0]?.rows).toEqual([
      expect.objectContaining({ playerId: 42, fumblesRec: 0, ptsAllowed: 17 }),
    ]);
  });

  it('records a corpus miss as no data without throwing', async () => {
    mockGetCareerGameLog.mockResolvedValueOnce(null);

    const result = await handler(makeSqsEvent([playerBody(2010)]));

    expect(result.batchItemFailures).toEqual([]);
    expect(fake.inserts).toEqual([]);
    // selectAndAssignFootballGameIdentifiers is what stamps
    // noGameDataFound when no game rows exist for the player-season.
    expect(mockSelectAndAssignFootballGameIdentifiers).toHaveBeenCalled();
    expect(fake.updates).not.toContainEqual(
      expect.objectContaining({ values: { statsLoadingStatus: 'failed' } }),
    );
    expect(mockUpdateMatchupStatus).toHaveBeenCalledWith(
      fake.db,
      7,
      'completed',
      expect.anything(),
    );
  });

  it('fails the player on a non-404 S3 error instead of treating it as a miss', async () => {
    mockGetCareerGameLog.mockRejectedValueOnce(
      Object.assign(new Error('Access Denied'), { name: 'AccessDenied' }),
    );

    await handler(makeSqsEvent([playerBody(2010)]));

    expect(mockSelectAndAssignFootballGameIdentifiers).not.toHaveBeenCalled();
    expect(fake.updates).toContainEqual(
      expect.objectContaining({ values: { statsLoadingStatus: 'failed' } }),
    );
    expect(mockUpdateMatchupStatus).toHaveBeenCalledWith(
      fake.db,
      7,
      'failed',
      expect.anything(),
    );
  });
});
