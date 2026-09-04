import {
  DEFAULT_LOOKBACK_HOURS,
  findSimilarTickets,
  SIMILARITY_THRESHOLD,
  summarySimilarity,
} from './similarity';

jest.mock('./jql-search', () => ({
  searchJqlAll: jest.fn(),
}));

const { searchJqlAll: mockSearchJqlAll } = jest.requireMock<{
  searchJqlAll: jest.Mock;
}>('./jql-search');

beforeEach(() => {
  jest.clearAllMocks();
});

// Real ticket bodies from LS-9567's own gap report — the trio this guard is
// meant to catch.
const LS_9545_SUMMARY =
  'fix(app): football [leagueId].spec.tsx fails on main — Chip missing from shared-components mock breaks 3 FLD-017 bracket-toggle tests';
const LS_9547_SUMMARY =
  "fix(app): add Chip to the football league spec's shared-components mock — app:test red on main";
const LS_9550_SUMMARY =
  'test(app): main is red — football [leagueId].spec.tsx missing Chip in shared-components mock after LS-6330 + LS-6322 land together';

describe('summarySimilarity — reproduced against the real LS-9545/9547/9550 trio (AC2)', () => {
  it('scores all three pairwise combinations above the threshold', () => {
    expect(
      summarySimilarity(LS_9545_SUMMARY, LS_9547_SUMMARY),
    ).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(
      summarySimilarity(LS_9545_SUMMARY, LS_9550_SUMMARY),
    ).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
    expect(
      summarySimilarity(LS_9547_SUMMARY, LS_9550_SUMMARY),
    ).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it('scores unrelated tickets well below the threshold (no false positive)', () => {
    const unrelated =
      'feat(mobile): add push notification opt-in screen to onboarding flow';
    expect(summarySimilarity(LS_9545_SUMMARY, unrelated)).toBeLessThan(
      SIMILARITY_THRESHOLD,
    );
  });

  it('returns 0 for an empty summary rather than throwing', () => {
    expect(summarySimilarity('', LS_9545_SUMMARY)).toBe(0);
    expect(summarySimilarity(LS_9545_SUMMARY, '')).toBe(0);
  });
});

describe('findSimilarTickets', () => {
  it('flags LS-9545 as a likely duplicate when claiming LS-9550 (AC2 reproduction)', async () => {
    mockSearchJqlAll.mockResolvedValue([
      {
        key: 'LS-9545',
        fields: { summary: LS_9545_SUMMARY, status: { name: 'In Review' } },
      },
      {
        key: 'LS-1234',
        fields: {
          summary: 'chore(deps): bump eslint to 9.x',
          status: { name: 'To Do' },
        },
      },
    ]);

    const result = await findSimilarTickets({
      key: 'LS-9550',
      summary: LS_9550_SUMMARY,
      projectKey: 'LS',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'LS-9545', status: 'In Review' });
    expect(result[0].score).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it('sorts multiple matches highest-score first', async () => {
    mockSearchJqlAll.mockResolvedValue([
      {
        key: 'LS-9545',
        fields: { summary: LS_9545_SUMMARY, status: { name: 'To Do' } },
      },
      {
        key: 'LS-9547',
        fields: { summary: LS_9547_SUMMARY, status: { name: 'To Do' } },
      },
    ]);

    const result = await findSimilarTickets({
      key: 'LS-9550',
      summary: LS_9550_SUMMARY,
      projectKey: 'LS',
    });

    expect(result.map((r) => r.key)).toEqual(
      [...result].sort((a, b) => b.score - a.score).map((r) => r.key),
    );
  });

  it('returns [] when no candidate clears the threshold', async () => {
    mockSearchJqlAll.mockResolvedValue([
      {
        key: 'LS-1',
        fields: {
          summary: 'feat(mobile): add push notification opt-in screen',
          status: { name: 'To Do' },
        },
      },
    ]);

    const result = await findSimilarTickets({
      key: 'LS-9550',
      summary: LS_9550_SUMMARY,
      projectKey: 'LS',
    });

    expect(result).toEqual([]);
  });

  it('returns [] without querying Jira when the summary has no scorable tokens', async () => {
    const result = await findSimilarTickets({
      key: 'LS-1',
      summary: '   ',
      projectKey: 'LS',
    });

    expect(result).toEqual([]);
    expect(mockSearchJqlAll).not.toHaveBeenCalled();
  });

  it("excludes the ticket itself and Done/Won't Do candidates defensively, even if JQL returned them", async () => {
    mockSearchJqlAll.mockResolvedValue([
      {
        key: 'LS-9550',
        fields: { summary: LS_9550_SUMMARY, status: { name: 'To Do' } },
      },
      {
        key: 'LS-9547',
        fields: { summary: LS_9547_SUMMARY, status: { name: "Won't Do" } },
      },
      {
        key: 'LS-9545',
        fields: { summary: LS_9545_SUMMARY, status: { name: 'Done' } },
      },
    ]);

    const result = await findSimilarTickets({
      key: 'LS-9550',
      summary: LS_9550_SUMMARY,
      projectKey: 'LS',
    });

    expect(result).toEqual([]);
  });

  it('scopes the JQL query to the project, excludes the ticket itself, and applies the default lookback', async () => {
    mockSearchJqlAll.mockResolvedValue([]);

    await findSimilarTickets({
      key: 'LS-9550',
      summary: LS_9550_SUMMARY,
      projectKey: 'LS',
    });

    expect(mockSearchJqlAll).toHaveBeenCalledTimes(1);
    const calls = mockSearchJqlAll.mock.calls as Array<
      [{ jql: string; fields: string[] }]
    >;
    const call = calls[0][0];
    expect(call.jql).toContain('project = "LS"');
    expect(call.jql).toContain('key != "LS-9550"');
    expect(call.jql).toContain(`-${DEFAULT_LOOKBACK_HOURS}h`);
    expect(call.fields).toEqual(['summary', 'status']);
  });

  it('honors an explicit lookbackHours override', async () => {
    mockSearchJqlAll.mockResolvedValue([]);

    await findSimilarTickets({
      key: 'LS-1',
      summary: 'some summary with real words',
      projectKey: 'LS',
      lookbackHours: 24,
    });

    const calls = mockSearchJqlAll.mock.calls as Array<[{ jql: string }]>;
    expect(calls[0][0].jql).toContain('-24h');
  });
});
