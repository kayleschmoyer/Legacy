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

const mockCaptureError = jest.fn();

jest.mock('@legacy-sports/rollbar', () => ({
  addBreadcrumb: jest.fn(),
  captureError: (...args: unknown[]): unknown => mockCaptureError(...args),
  getRollbarConfigFromEnv: jest.fn(() => null),
  initRollbar: jest.fn(),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

const mockRunWithPublicClient = jest.fn();
const mockWhere = jest.fn();
const mockSet = jest.fn(() => ({ where: mockWhere }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  PublicSchema: { players: { mlbPlayerId: 'mlb_player_id' } },
}));

const mockGetPlayerInfo = jest.fn();
const mockCreateMlbDataProvider = jest.fn();
mockCreateMlbDataProvider.mockReturnValue({ getPlayerInfo: mockGetPlayerInfo });

jest.mock('@legacy-sports/mlb-client', () => ({
  createMlbDataProvider: (...args: unknown[]): unknown =>
    mockCreateMlbDataProvider(...args),
}));

// ── Import under test ───────────────────────────────────────────────────────

import { handler, isMlbStatsMessage } from './load-mlb-stats';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSqsEvent(bodies: string[]) {
  return {
    Records: bodies.map(
      (body, i) =>
        ({
          messageId: `msg-${i}`,
          body,
        }) as SQSRecord,
    ),
  };
}

const mockDb = { update: mockUpdate } as unknown;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('isMlbStatsMessage', () => {
  it('returns true for a valid mlb-player-stats message', () => {
    expect(
      isMlbStatsMessage({
        type: 'mlb-player-stats',
        mlbPlayerId: 592450,
        season: 2024,
      }),
    ).toBe(true);
  });

  it('returns false for a message missing mlbPlayerId', () => {
    expect(isMlbStatsMessage({ type: 'mlb-player-stats', season: 2024 })).toBe(
      false,
    );
  });

  it('returns false for non-object input', () => {
    expect(isMlbStatsMessage('not an object')).toBe(false);
    expect(isMlbStatsMessage(null)).toBe(false);
  });
});

describe('load-mlb-stats handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunWithPublicClient.mockImplementation(
      (_opts: unknown, fn: (db: unknown) => Promise<unknown>) => fn(mockDb),
    );
    mockWhere.mockResolvedValue(undefined);
  });

  it('syncs team + jersey number for a valid message (LS-8597)', async () => {
    mockGetPlayerInfo.mockResolvedValue({
      playerId: 592450,
      mlbTeamAbbreviation: 'NYY',
      jerseyNumber: 99,
    });

    const event = makeSqsEvent([
      JSON.stringify({
        type: 'mlb-player-stats',
        mlbPlayerId: 592450,
        season: 2024,
      }),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(mockGetPlayerInfo).toHaveBeenCalledWith(592450);
    expect(mockSet).toHaveBeenCalledWith({
      mlbTeam: 'NYY',
      jerseyNumber: 99,
    });
  });

  it('records a batch failure when the message body is malformed JSON', async () => {
    const event = makeSqsEvent(['not json']);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockGetPlayerInfo).not.toHaveBeenCalled();
  });

  it('skips (without failing) a well-formed message of a different type', async () => {
    const event = makeSqsEvent([JSON.stringify({ type: 'other' })]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(mockGetPlayerInfo).not.toHaveBeenCalled();
  });

  it('records a batch failure and captures the error when the provider throws', async () => {
    mockGetPlayerInfo.mockRejectedValue(new Error('upstream unavailable'));

    const event = makeSqsEvent([
      JSON.stringify({
        type: 'mlb-player-stats',
        mlbPlayerId: 592450,
        season: 2024,
      }),
    ]);

    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-0' }]);
    expect(mockCaptureError).toHaveBeenCalled();
  });
});
