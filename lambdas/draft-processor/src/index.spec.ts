import type { SQSEvent, SQSRecord } from 'aws-lambda';

// ── Mocks (must precede module import) ──────────────────────────────────────

// Stub drizzle-orm so that eq/and/etc. don't throw when passed mock string
// columns (PublicSchema fields are strings in tests, not real Drizzle columns).
jest.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ _type: 'and', args }),
  eq: (l: unknown, r: unknown) => ({ _type: 'eq', l, r }),
  gte: (l: unknown, r: unknown) => ({ _type: 'gte', l, r }),
  inArray: (col: unknown, vals: unknown) => ({ _type: 'inArray', col, vals }),
  isNull: (col: unknown) => ({ _type: 'isNull', col }),
  notInArray: (col: unknown, vals: unknown) => ({
    _type: 'notInArray',
    col,
    vals,
  }),
  or: (...args: unknown[]) => ({ _type: 'or', args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({
      _type: 'sql',
      strings,
      vals,
    }),
    { param: (v: unknown) => v },
  ),
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
  addBreadcrumb: jest.fn(),
  captureError: jest.fn(),
  getRollbarConfigFromEnv: jest.fn(() => null),
  initRollbar: jest.fn(),
  withRollbar: jest.fn((fn: unknown) => fn),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  formatVersionInfo: jest.fn(() => ''),
  getVersionInfo: jest.fn(() => ({})),
  getDbOptions: jest.fn(() => ({})),
}));

jest.mock('@legacy-sports/utils', () => ({
  ALLOWED_POSITIONS: {
    C: ['C'],
    '1B': ['1B'],
    '2B': ['2B'],
    '3B': ['3B'],
    SS: ['SS'],
    OF: ['OF', 'LF', 'CF', 'RF'],
    DH: ['DH', 'C', '1B', '2B', '3B', 'SS', 'OF', 'LF', 'CF', 'RF'],
    SP: ['SP'],
    RP: ['RP'],
    IF: ['1B', '2B', '3B', 'SS'],
    XDH: ['DH', 'C', '1B', '2B', '3B', 'SS', 'OF', 'LF', 'CF', 'RF'],
  },
  BATTING_POSITIONS: new Set([
    'C',
    '1B',
    '2B',
    '3B',
    'SS',
    'OF',
    'LF',
    'CF',
    'RF',
    'DH',
  ]),
  PITCHING_POSITIONS: new Set(['SP', 'RP']),
  MIN_SEASON_WITH_GAME_DATA: 1901,
  NEGRO_LEAGUE_IDS: ['NNL', 'NAL'],
  SEASON_MATCHUP_MULTIPLIER: 3,
  shuffleArray: jest.fn(<T>(arr: T[]): T[] => [...arr]),
}));

const mockRunWithPublicClient = jest.fn();
const mockCreateAllMatchupsForLeague = jest.fn();
const mockFilterPlayerIdsByLeagueEligibility = jest.fn();
const mockFinalizeDraftCompletion = jest.fn();
const mockUpdateLeagueDraftStatus = jest.fn();
const mockValidateDraftMode = jest.fn();
const mockValidateSelectionMethod = jest.fn();
const mockValidateUserAccess = jest.fn();

// jest.requireActual cannot be used here: db-client's module-level code
// (materialized view in Players.ts) calls drizzle-orm's sql tag and expects
// a full Drizzle SQL object with inlineParams. Since drizzle-orm is mocked
// in this file, requireActual would fail with "query.inlineParams is not a
// function". The manual mock is therefore required, not a style preference.
jest.mock('@legacy-sports/db-client', () => ({
  createAllMatchupsForLeague: (...args: unknown[]): unknown =>
    mockCreateAllMatchupsForLeague(...args),
  filterPlayerIdsByLeagueEligibility: (...args: unknown[]): unknown =>
    mockFilterPlayerIdsByLeagueEligibility(...args),
  inArrayAny: (col: unknown, vals: unknown) => ({
    _type: 'inArrayAny',
    col,
    vals,
  }),
  finalizeDraftCompletion: (...args: unknown[]): unknown =>
    mockFinalizeDraftCompletion(...args),
  PublicDb: {},
  PublicSchema: {
    players: {
      id: 'id',
      firstName: 'firstName',
      lastName: 'lastName',
      brefId: 'brefId',
      statsLastFetchedAt: 'statsLastFetchedAt',
      sport: 'sport',
    },
    teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
    teamMembers: { leagueId: 'leagueId' },
    leaguePosition: {
      leagueId: 'leagueId',
      positionType: 'positionType',
      id: 'id',
    },
    leaguePositions: {
      leagueId: 'leagueId',
      positionType: 'positionType',
      id: 'id',
    },
    leagues: {
      id: 'id',
      sport: 'sport',
      gamesPerMatchup: 'gamesPerMatchup',
      playerPool: 'playerPool',
      minCareerGames: 'minCareerGames',
      minCareerSeasons: 'minCareerSeasons',
      baseballHofOnly: 'baseballHofOnly',
      baseballEraFilter: 'baseballEraFilter',
      customEraStartYear: 'customEraStartYear',
      customEraEndYear: 'customEraEndYear',
      maxRosterSize: 'maxRosterSize',
    },
    seasonBatting: {
      playerId: 'playerId',
      g: 'g',
      season: 'season',
      lgId: 'lgId',
    },
    seasonPitching: {
      playerId: 'playerId',
      g: 'g',
      season: 'season',
      lgId: 'lgId',
    },
    seasonFielding: {
      playerId: 'playerId',
      g: 'g',
      season: 'season',
      lgId: 'lgId',
    },
    playerEligiblePositions: { playerId: 'playerId', position: 'position' },
  },
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  updateLeagueDraftStatus: (...args: unknown[]): unknown =>
    mockUpdateLeagueDraftStatus(...args),
  validateDraftMode: (...args: unknown[]): unknown =>
    mockValidateDraftMode(...args),
  validateSelectionMethod: (...args: unknown[]): unknown =>
    mockValidateSelectionMethod(...args),
  validateUserAccess: (...args: unknown[]): unknown =>
    mockValidateUserAccess(...args),
}));

const mockNotifyDraftCompleted = jest.fn();
const mockPublish = jest.fn();
jest.mock('@legacy-sports/aws-utils', () => ({
  createNotificationService: jest.fn(() => ({
    notifyDraftCompleted: (...args: unknown[]): unknown =>
      mockNotifyDraftCompleted(...args),
  })),
  createNotificationPublisher: jest.fn(() => ({
    publish: (...args: unknown[]): unknown => mockPublish(...args),
    publishToMany: jest.fn(),
  })),
  DraftProcessingResult: {},
  SqsDraftMessage: {},
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSqsRecord(body: unknown, messageId = 'msg-0'): SQSRecord {
  return {
    messageId,
    body: JSON.stringify(body),
    receiptHandle: '',
    attributes: {} as SQSRecord['attributes'],
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:test-queue',
    awsRegion: 'us-east-1',
  };
}

function makeSqsEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

function makeValidStartDraftMessage(overrides: Record<string, unknown> = {}) {
  return {
    messageType: 'START_DRAFT',
    payload: {
      leagueId: 1,
      draftMode: 'automated',
      selectionMethod: 'random',
      draftOrder: 'snake',
      requestedBy: 42,
      timestamp: '2026-01-01T00:00:00Z',
      ...overrides,
    },
  };
}

// ── Import mocked modules for implementation re-init after resetAllMocks ────

import { withRollbar } from '@legacy-sports/rollbar';
import { shuffleArray } from '@legacy-sports/utils';
import { getDbOptions } from '@legacy-sports/utils/node';
import type { PublicDb } from '@legacy-sports/db-client';

// ── Import under test ───────────────────────────────────────────────────────

import { buildBenchAssignments, buildPlayerPool, handler } from './index';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('draft-processor handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Re-establish implementations cleared by resetAllMocks
    (withRollbar as jest.Mock).mockImplementation((fn: unknown) => fn);
    (shuffleArray as jest.Mock).mockImplementation(<T>(arr: T[]): T[] => [
      ...arr,
    ]);
    (getDbOptions as jest.Mock).mockReturnValue({});

    mockValidateDraftMode.mockResolvedValue(undefined);
    mockValidateSelectionMethod.mockResolvedValue(undefined);
    mockValidateUserAccess.mockResolvedValue(undefined);
    mockUpdateLeagueDraftStatus.mockResolvedValue(undefined);
    mockFinalizeDraftCompletion.mockResolvedValue(undefined);
    mockCreateAllMatchupsForLeague.mockResolvedValue(undefined);
    mockNotifyDraftCompleted.mockResolvedValue(undefined);
  });

  // ── Zod validation ──────────────────────────────────────────────────────

  describe('message validation', () => {
    it('rejects records with invalid JSON', async () => {
      const record: SQSRecord = {
        ...makeSqsRecord({}),
        body: 'not-json',
      };
      const result = await handler(makeSqsEvent([record]));

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
    });

    it('rejects records missing required fields', async () => {
      const record = makeSqsRecord({ messageType: 'START_DRAFT' });
      const result = await handler(makeSqsEvent([record]));

      // Missing payload
      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('rejects records with invalid messageType', async () => {
      const msg = {
        messageType: 'STOP_DRAFT',
        payload: {
          leagueId: 1,
          draftMode: 'automated',
          selectionMethod: 'random',
          draftOrder: 'snake',
          requestedBy: 42,
          timestamp: '2026-01-01T00:00:00Z',
        },
      };
      const record = makeSqsRecord(msg);
      const result = await handler(makeSqsEvent([record]));

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('rejects records with invalid selectionMethod', async () => {
      const msg = makeValidStartDraftMessage({ selectionMethod: 'chaos' });
      const record = makeSqsRecord(msg);
      const result = await handler(makeSqsEvent([record]));

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('rejects records with non-positive leagueId', async () => {
      const msg = makeValidStartDraftMessage({ leagueId: -1 });
      const record = makeSqsRecord(msg);
      const result = await handler(makeSqsEvent([record]));

      expect(result.batchItemFailures).toHaveLength(1);
    });

    it('rejects records with non-integer leagueId', async () => {
      const msg = makeValidStartDraftMessage({ leagueId: 1.5 });
      const record = makeSqsRecord(msg);
      const result = await handler(makeSqsEvent([record]));

      expect(result.batchItemFailures).toHaveLength(1);
    });
  });

  // ── SQS batch handling ────────────────────────────────────────────────

  describe('SQS batch handling', () => {
    it('returns empty batchItemFailures for empty batch', async () => {
      const result = await handler(makeSqsEvent([]));

      expect(result.batchItemFailures).toEqual([]);
    });

    it('processes a valid START_DRAFT message', async () => {
      // Mock runWithPublicClient to resolve immediately, skipping DB work
      mockRunWithPublicClient.mockResolvedValue(undefined);

      const msg = makeValidStartDraftMessage();
      const record = makeSqsRecord(msg);
      const result = await handler(makeSqsEvent([record]));

      // Validation functions should be called
      expect(mockValidateDraftMode).toHaveBeenCalled();
      expect(mockValidateSelectionMethod).toHaveBeenCalled();
      expect(mockValidateUserAccess).toHaveBeenCalled();

      // Valid message should not produce any batch failures
      expect(result.batchItemFailures).toHaveLength(0);

      // Push notification should be published for draft completion
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: msg.payload.requestedBy,
          notificationType: 'draft_completed',
          title: 'Draft Complete',
        }),
      );
    });

    it('tracks batch failures per-record', async () => {
      // Mock runWithPublicClient to resolve immediately, skipping DB work
      mockRunWithPublicClient.mockResolvedValue(undefined);

      const validMsg = makeValidStartDraftMessage();
      const invalidMsg = { messageType: 'INVALID' };

      const result = await handler(
        makeSqsEvent([
          makeSqsRecord(invalidMsg, 'msg-bad'),
          makeSqsRecord(validMsg, 'msg-good'),
        ]),
      );

      // The invalid record should be in failures, the valid one should not
      const failedIds = result.batchItemFailures.map((f) => f.itemIdentifier);
      expect(failedIds).toContain('msg-bad');
      expect(failedIds).not.toContain('msg-good');
    });
  });

  // ── Error recovery ──────────────────────────────────────────────────────

  describe('error recovery', () => {
    it('resets draft status on processing error', async () => {
      mockRunWithPublicClient.mockRejectedValue(
        new Error('database unreachable'),
      );

      const msg = makeValidStartDraftMessage();
      const record = makeSqsRecord(msg);
      const result = await handler(makeSqsEvent([record]));

      expect(result.batchItemFailures).toHaveLength(1);

      // Draft status should have been reset to not-started
      expect(mockUpdateLeagueDraftStatus).toHaveBeenCalledWith(
        1,
        'not-started',
        expect.stringContaining('error recovery'),
      );
    });

    it('handles status reset failure gracefully', async () => {
      mockRunWithPublicClient.mockRejectedValue(new Error('processing failed'));
      // First call (in-progress) succeeds; recovery call (not-started) fails
      mockUpdateLeagueDraftStatus
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('status update also failed'));

      const msg = makeValidStartDraftMessage();
      const record = makeSqsRecord(msg);

      // Should not throw — error is captured
      const result = await handler(makeSqsEvent([record]));

      expect(result.batchItemFailures).toHaveLength(1);
    });
  });
});

// ── Bench assignment tests ────────────────────────────────────────────────

describe('buildBenchAssignments', () => {
  function makePlayer(id: number, isPitcher: boolean) {
    return { id, isPitcher };
  }

  it('interleaves batters and pitchers across bench slots', () => {
    // 4 batters (ids 1-4) and 4 pitchers (ids 11-14)
    const players = [
      makePlayer(1, false),
      makePlayer(2, false),
      makePlayer(3, false),
      makePlayer(4, false),
      makePlayer(11, true),
      makePlayer(12, true),
      makePlayer(13, true),
      makePlayer(14, true),
    ];
    const teams = [{ id: 100 }];
    const result = buildBenchAssignments(players, teams, 8, 1);

    // With one team, interleaving means batter, pitcher, batter, pitcher, ...
    const ids = result.map((a) => a.playerId);
    expect(ids).toEqual([1, 11, 2, 12, 3, 13, 4, 14]);
  });

  it('uses snake-order so even-team-count benches are balanced', () => {
    // 2 teams, 2 bench slots, 4 remaining players: B1, P1, B2, P2
    const players = [
      makePlayer(1, false), // batter
      makePlayer(11, true), // pitcher
      makePlayer(2, false), // batter
      makePlayer(12, true), // pitcher
    ];
    const teams = [{ id: 100 }, { id: 200 }];
    const result = buildBenchAssignments(players, teams, 2, 1);

    // Round 0 (even): teams in order [100, 200]
    //   100 gets player 1 (batter), 200 gets player 11 (pitcher)
    // Round 1 (odd):  teams reversed [200, 100]
    //   200 gets player 2 (batter), 100 gets player 12 (pitcher)
    const team100 = result.filter((a) => a.teamId === 100);
    const team200 = result.filter((a) => a.teamId === 200);

    // Each team should have 1 batter and 1 pitcher
    expect(team100.map((a) => a.playerId)).toEqual([1, 12]);
    expect(team200.map((a) => a.playerId)).toEqual([11, 2]);
  });

  it('handles more teams than remaining players gracefully', () => {
    const players = [makePlayer(1, false)];
    const teams = [{ id: 100 }, { id: 200 }, { id: 300 }];
    const result = buildBenchAssignments(players, teams, 1, 1);

    // Only one player — only one assignment
    expect(result).toHaveLength(1);
    expect(result[0].teamId).toBe(100);
    expect(result[0].playerId).toBe(1);
    expect(result[0].positionId).toBeNull();
  });

  it('sets positionId to null and correct leagueId for all assignments', () => {
    const players = [makePlayer(1, false), makePlayer(2, true)];
    const teams = [{ id: 100 }];
    const result = buildBenchAssignments(players, teams, 2, 42);

    for (const a of result) {
      expect(a.positionId).toBeNull();
      expect(a.leagueId).toBe(42);
    }
  });

  it('returns empty array when benchSlots is zero', () => {
    const players = [makePlayer(1, false)];
    const teams = [{ id: 100 }];
    const result = buildBenchAssignments(players, teams, 0, 1);
    expect(result).toEqual([]);
  });
});

// ── buildPlayerPool sport-aware tests ────────────────────────────────────────

describe('buildPlayerPool', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  function makePlayer(id: number) {
    return {
      id,
      firstName: `First${id}`,
      lastName: `Last${id}`,
      brefId: `bref${id}`,
      statsLastFetchedAt: null,
    };
  }

  function makePosition(playerId: number, position: string) {
    return { playerId, position };
  }

  // A minimal Drizzle-fluent mock DB.
  // Each call to `.from()` pops the next response from the queue.
  // Supports both .limit() termination and direct thenable await.
  // Critically: each query chain shares a SINGLE lazy slot so that
  // db.select().from().where().orderBy().limit() and
  // db.select().from().where() both consume exactly one response.
  function makeSequentialDb(
    responses: unknown[][],
    options: { forbiddenTables?: string[] } = {},
  ) {
    let callIdx = 0;

    return {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table: Record<string, unknown>) => {
          if (
            options.forbiddenTables?.some((name) =>
              Object.values(table ?? {}).includes(name),
            )
          ) {
            throw new Error(
              `Forbidden table queried: ${JSON.stringify(table)}`,
            );
          }

          // Each from() owns a single lazy slot shared by all terminal calls.
          let fetched = false;
          let slotValue: unknown[] = [];
          const fetch = () => {
            if (!fetched) {
              slotValue = responses[callIdx++] ?? [];
              fetched = true;
            }
            return slotValue;
          };

          const afterWhere = {
            orderBy: jest.fn().mockImplementation(() => ({
              limit: jest
                .fn()
                .mockImplementation(() => Promise.resolve(fetch())),
            })),
            limit: jest.fn().mockImplementation(() => Promise.resolve(fetch())),
            then: (
              resolve: (v: unknown[]) => unknown,
              reject?: (e: unknown) => unknown,
            ) => Promise.resolve(fetch()).then(resolve, reject),
            catch: (reject: (e: unknown) => unknown) =>
              Promise.resolve(fetch()).catch(reject),
          };

          return {
            where: jest.fn().mockImplementation(() => afterWhere),
            orderBy: jest.fn().mockImplementation(() => ({
              limit: jest
                .fn()
                .mockImplementation(() => Promise.resolve(fetch())),
            })),
          };
        }),
      })),
    };
  }

  const LEAGUE_ID = 42;
  const NUM_TEAMS = 2;
  const POSITIONS = [{ id: 1, positionType: 'OF' }];
  const BASE_CONFIG = {
    gamesPerMatchup: 5,
    playerPool: 'all' as const,
    minCareerGames: 50,
    minCareerSeasons: 3,
    baseballHofOnly: false as boolean,
    eraFilter: 'all',
    customEraStartYear: null,
    customEraEndYear: null,
    maxRosterSize: 25,
  };

  it('for football: passes sport="football" to filterPlayerIdsByLeagueEligibility', async () => {
    const players = [makePlayer(1), makePlayer(2)];
    const positions = [makePosition(1, 'OF'), makePosition(2, 'OF')];

    // Sequence: candidatePlayers → playerEligiblePositions
    const db = makeSequentialDb([players, positions]);

    mockFilterPlayerIdsByLeagueEligibility.mockResolvedValue({
      eligibleIds: new Set([1, 2]),
      excludedByPool: 0,
      excludedByCareerGames: 0,
      excludedByCareerSeasons: 0,
      excludedByHofOnly: 0,
      excludedByEraFilter: 0,
    });

    await buildPlayerPool(
      db as unknown as PublicDb,
      LEAGUE_ID,
      NUM_TEAMS,
      POSITIONS,
      {
        ...BASE_CONFIG,
        sport: 'football',
      },
    );

    expect(mockFilterPlayerIdsByLeagueEligibility).toHaveBeenCalledWith(
      db,
      [1, 2],
      expect.objectContaining({ sport: 'football' }),
    );
  });

  it('for football: does not query season_batting/pitching/fielding tables', async () => {
    const players = [makePlayer(1)];
    const positions = [makePosition(1, 'OF')];

    // season_batting has a unique mock field 'playerId' on lgId col.
    // We detect forbidden access by checking for 'lgId' in the table object.
    const db = makeSequentialDb([players, positions], {
      forbiddenTables: ['lgId'],
    });

    mockFilterPlayerIdsByLeagueEligibility.mockResolvedValue({
      eligibleIds: new Set([1]),
      excludedByPool: 0,
      excludedByCareerGames: 0,
      excludedByCareerSeasons: 0,
      excludedByHofOnly: 0,
      excludedByEraFilter: 0,
    });

    await expect(
      buildPlayerPool(
        db as unknown as PublicDb,
        LEAGUE_ID,
        NUM_TEAMS,
        POSITIONS,
        {
          ...BASE_CONFIG,
          sport: 'football',
        },
      ),
    ).resolves.not.toThrow();
  });

  it('for baseball: passes sport="baseball" to filterPlayerIdsByLeagueEligibility', async () => {
    const players = [makePlayer(1)];
    const positions = [makePosition(1, 'OF')];

    // Sequence: candidatePlayers → battingStats → pitchingStats → fieldingStats → playerPositions
    // battingStats must include player 1 with g >= gamesPerMatchup*SEASON_MATCHUP_MULTIPLIER (5*3=15)
    const db = makeSequentialDb([
      players,
      [{ playerId: 1, g: 50 }],
      [],
      [],
      positions,
    ]);

    mockFilterPlayerIdsByLeagueEligibility.mockResolvedValue({
      eligibleIds: new Set([1]),
      excludedByPool: 0,
      excludedByCareerGames: 0,
      excludedByCareerSeasons: 0,
      excludedByHofOnly: 0,
      excludedByEraFilter: 0,
    });

    await buildPlayerPool(
      db as unknown as PublicDb,
      LEAGUE_ID,
      NUM_TEAMS,
      POSITIONS,
      {
        ...BASE_CONFIG,
        sport: 'baseball',
      },
    );

    expect(mockFilterPlayerIdsByLeagueEligibility).toHaveBeenCalledWith(
      db,
      expect.any(Array),
      expect.objectContaining({ sport: 'baseball' }),
    );
  });
});
