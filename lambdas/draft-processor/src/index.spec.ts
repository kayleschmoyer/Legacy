import type { SQSEvent, SQSRecord } from 'aws-lambda';

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

jest.mock('@legacy-sports/db-client', () => ({
  createAllMatchupsForLeague: (...args: unknown[]): unknown =>
    mockCreateAllMatchupsForLeague(...args),
  filterPlayerIdsByLeagueEligibility: (...args: unknown[]): unknown =>
    mockFilterPlayerIdsByLeagueEligibility(...args),
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
    },
    teams: { id: 'id', name: 'name', leagueId: 'leagueId' },
    teamMembers: { leagueId: 'leagueId' },
    leaguePositions: {
      leagueId: 'leagueId',
      positionType: 'positionType',
      id: 'id',
    },
    leagues: { id: 'id' },
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

// ── Import under test ───────────────────────────────────────────────────────

import { buildBenchAssignments, handler } from './index';

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
