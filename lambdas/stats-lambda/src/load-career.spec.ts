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

const mockGetPlayerByBrefId = jest.fn();
const mockRunWithPublicClient = jest.fn();
const mockRefreshCareerStats = jest.fn();
const mockRefreshPlayerEligiblePositions = jest.fn();
const mockRefreshPlayerScoringCache = jest.fn();

jest.mock('@legacy-sports/db-client', () => ({
  getPlayerByBrefId: (...args: unknown[]): unknown =>
    mockGetPlayerByBrefId(...args),
  runWithPublicClient: (...args: unknown[]): unknown =>
    mockRunWithPublicClient(...args),
  refreshCareerStats: (...args: unknown[]): unknown =>
    mockRefreshCareerStats(...args),
  refreshPlayerEligiblePositions: (...args: unknown[]): unknown =>
    mockRefreshPlayerEligiblePositions(...args),
  refreshPlayerScoringCache: (...args: unknown[]): unknown =>
    mockRefreshPlayerScoringCache(...args),
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn(() => ({})),
}));

const mockLoadCareerStats = jest.fn();

jest.mock('@legacy-sports/data-loaders', () => ({
  loadCareerStats: (...args: unknown[]): unknown =>
    mockLoadCareerStats(...args),
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

// ── Import under test ───────────────────────────────────────────────────────

import { handler } from './load-career';

describe('load-career handler', () => {
  const fakeDb = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunWithPublicClient.mockImplementation(
      async (_opts: unknown, cb: (db: unknown) => Promise<unknown>) =>
        cb(fakeDb),
    );
    mockRefreshCareerStats.mockResolvedValue(undefined);
    mockRefreshPlayerEligiblePositions.mockResolvedValue(undefined);
    mockRefreshPlayerScoringCache.mockResolvedValue(undefined);
  });

  it('processes a valid brefId and refreshes materialized views', async () => {
    mockGetPlayerByBrefId.mockResolvedValue({ brefId: 'ruthba01' });
    mockLoadCareerStats.mockResolvedValue(undefined);

    const result = await handler(makeSqsEvent([JSON.stringify('ruthba01')]));

    expect(result.batchItemFailures).toEqual([]);
    expect(mockGetPlayerByBrefId).toHaveBeenCalledWith(fakeDb, 'ruthba01');
    expect(mockLoadCareerStats).toHaveBeenCalledWith(fakeDb, 'ruthba01');

    // Materialized views refreshed on success
    expect(mockRefreshCareerStats).toHaveBeenCalledWith(fakeDb);
    expect(mockRefreshPlayerEligiblePositions).toHaveBeenCalledWith(fakeDb);
    expect(mockRefreshPlayerScoringCache).toHaveBeenCalledWith(fakeDb, null);
  });

  it('reports failure for records with empty body', async () => {
    const event = makeSqsEvent(['']);
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-0');
  });

  it('reports failure when player is not found', async () => {
    mockGetPlayerByBrefId.mockResolvedValue(null);

    const result = await handler(makeSqsEvent([JSON.stringify('unknown01')]));

    expect(result.batchItemFailures).toHaveLength(1);
  });

  it('reports failure for unparseable JSON', async () => {
    const result = await handler(makeSqsEvent(['not-json']));

    expect(result.batchItemFailures).toHaveLength(1);
  });

  it('processes multiple records with partial failures', async () => {
    mockGetPlayerByBrefId
      .mockResolvedValueOnce({ brefId: 'cobbty01' })
      .mockResolvedValueOnce(null);
    mockLoadCareerStats.mockResolvedValue(undefined);

    const result = await handler(
      makeSqsEvent([JSON.stringify('cobbty01'), JSON.stringify('unknown01')]),
    );

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe('msg-1');

    // Views still refreshed because 1 record succeeded
    expect(mockRefreshCareerStats).toHaveBeenCalled();
  });

  it('skips materialized view refresh when all records fail', async () => {
    mockGetPlayerByBrefId.mockResolvedValue(null);

    await handler(makeSqsEvent([JSON.stringify('unknown01')]));

    expect(mockRefreshCareerStats).not.toHaveBeenCalled();
    expect(mockRefreshPlayerEligiblePositions).not.toHaveBeenCalled();
    expect(mockRefreshPlayerScoringCache).not.toHaveBeenCalled();
  });

  it('does not fail the batch when materialized view refresh errors', async () => {
    mockGetPlayerByBrefId.mockResolvedValue({ brefId: 'ruthba01' });
    mockLoadCareerStats.mockResolvedValue(undefined);
    mockRefreshCareerStats.mockRejectedValue(new Error('refresh failed'));

    const result = await handler(makeSqsEvent([JSON.stringify('ruthba01')]));

    expect(result.batchItemFailures).toEqual([]);
  });

  it('reports failure for non-string brefId values', async () => {
    const result = await handler(makeSqsEvent([JSON.stringify(12345)]));

    expect(result.batchItemFailures).toHaveLength(1);
  });
});
