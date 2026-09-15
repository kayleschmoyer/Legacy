jest.mock('../github-api', () => ({ githubGraphQL: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { prBatchStatus } from './pr-batch-status';
import { githubGraphQL } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function makePR(
  number: number,
  checkNodes: unknown[],
  overrides: Record<string, unknown> = {},
) {
  return {
    number,
    title: 'feat: big feature',
    state: 'OPEN',
    headRefName: 'claude/branch',
    baseRefName: 'main',
    author: { login: 'alice' },
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: 'REVIEW_REQUIRED',
    updatedAt: '2026-01-02T00:00:00Z',
    url: `https://github.com/o/r/pull/${number}`,
    labels: { nodes: [{ name: 'bug' }] },
    commits: {
      nodes: [
        {
          commit: {
            oid: `sha-${number}`,
            statusCheckRollup: {
              contexts: {
                nodes: checkNodes,
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      ],
    },
    reviews: { nodes: [] },
    reviewThreads: {
      totalCount: 0,
      pageInfo: { hasNextPage: false },
      nodes: [],
    },
    ...overrides,
  };
}

function gqlResponse(prsByAlias: Record<string, unknown>) {
  return { data: { repository: prsByAlias }, errors: undefined };
}

interface ParsedBatchStatus {
  prs: Array<{
    ciSummary: string;
    failedJobs?: string[];
    cancelledJobs?: string[];
  }>;
}

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
});

afterEach(() => jest.resetAllMocks());

describe('prBatchStatus — failedJobs dedup (LS-8829)', () => {
  it('dedupes stale/cancelled reruns to the latest run per check name, matching github_get_check_runs', async () => {
    mockedGraphQL.mockResolvedValue(
      gqlResponse({
        pr_6520: makePR(6520, [
          // Earlier cancelled attempt, superseded by a later success.
          {
            __typename: 'CheckRun',
            name: 'Jira Link Check',
            status: 'COMPLETED',
            conclusion: 'CANCELLED',
            startedAt: '2026-01-02T09:00:00Z',
            completedAt: '2026-01-02T09:01:00Z',
          },
          {
            __typename: 'CheckRun',
            name: 'Jira Link Check',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            startedAt: '2026-01-02T09:05:00Z',
            completedAt: '2026-01-02T09:06:00Z',
          },
          // Duplicate rows with the same name and conclusion from a rerun.
          {
            __typename: 'CheckRun',
            name: 'Resolve Runner Label',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            startedAt: '2026-01-02T09:00:00Z',
            completedAt: '2026-01-02T09:01:00Z',
          },
          {
            __typename: 'CheckRun',
            name: 'Resolve Runner Label',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            startedAt: '2026-01-02T09:00:00Z',
            completedAt: '2026-01-02T09:01:00Z',
          },
          {
            __typename: 'CheckRun',
            name: 'build',
            status: 'COMPLETED',
            conclusion: 'SUCCESS',
            startedAt: '2026-01-02T09:00:00Z',
            completedAt: '2026-01-02T09:01:00Z',
          },
        ]),
      }),
    );

    const result = await prBatchStatus({ numbers: [6520], compact: true });
    const parsed = JSON.parse(result.content[0].text) as ParsedBatchStatus;

    expect(parsed.prs[0].ciSummary).toBe('pass');
    expect(parsed.prs[0]).not.toHaveProperty('failedJobs');
  });

  it('reports a genuinely failing check once, not once per stale run', async () => {
    mockedGraphQL.mockResolvedValue(
      gqlResponse({
        pr_1: makePR(1, [
          {
            __typename: 'CheckRun',
            name: 'lint',
            status: 'COMPLETED',
            conclusion: 'FAILURE',
            startedAt: '2026-01-02T09:00:00Z',
            completedAt: '2026-01-02T09:01:00Z',
          },
          {
            __typename: 'CheckRun',
            name: 'lint',
            status: 'COMPLETED',
            conclusion: 'FAILURE',
            startedAt: '2026-01-02T09:10:00Z',
            completedAt: '2026-01-02T09:11:00Z',
          },
        ]),
      }),
    );

    const result = await prBatchStatus({ numbers: [1], compact: true });
    const parsed = JSON.parse(result.content[0].text) as ParsedBatchStatus;

    expect(parsed.prs[0].ciSummary).toBe('fail');
    expect(parsed.prs[0].failedJobs).toEqual(['lint']);
  });
});

describe('prBatchStatus — statusCheckRollup pagination (LS-8829 Cycle 2)', () => {
  it('drains additional pages of contexts instead of truncating at 100', async () => {
    const pr = makePR(
      42,
      [
        {
          __typename: 'CheckRun',
          name: 'build',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          startedAt: '2026-01-02T09:00:00Z',
          completedAt: '2026-01-02T09:01:00Z',
        },
      ],
      {
        commits: {
          nodes: [
            {
              commit: {
                oid: 'sha-42',
                statusCheckRollup: {
                  contexts: {
                    nodes: [
                      {
                        __typename: 'CheckRun',
                        name: 'build',
                        status: 'COMPLETED',
                        conclusion: 'SUCCESS',
                        startedAt: '2026-01-02T09:00:00Z',
                        completedAt: '2026-01-02T09:01:00Z',
                      },
                    ],
                    pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                  },
                },
              },
            },
          ],
        },
      },
    );

    mockedGraphQL.mockImplementation((query: string) => {
      if (query.includes('pr_42')) {
        return Promise.resolve({
          data: { repository: { pr_42: pr } },
          errors: undefined,
        });
      }
      // Pagination follow-up query, scoped to the commit oid.
      return Promise.resolve({
        data: {
          repository: {
            object: {
              statusCheckRollup: {
                contexts: {
                  nodes: [
                    {
                      __typename: 'CheckRun',
                      name: 'lint',
                      status: 'COMPLETED',
                      conclusion: 'FAILURE',
                      startedAt: '2026-01-02T09:05:00Z',
                      completedAt: '2026-01-02T09:06:00Z',
                    },
                  ],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        },
        errors: undefined,
      });
    });

    const result = await prBatchStatus({ numbers: [42], compact: true });
    const parsed = JSON.parse(result.content[0].text) as ParsedBatchStatus;

    // Without pagination, the second-page "lint" failure would be silently dropped.
    expect(parsed.prs[0].ciSummary).toBe('fail');
    expect(parsed.prs[0].failedJobs).toEqual(['lint']);
  });
});

// LS-10151: reported recurrence of LS-10116 against PR #7974 — compact output
// was observed as `{"ciSummary":"fail","failedJobs":["process-merge-queue"]}`
// for a PR whose only non-success job was a single cancelled
// `process-merge-queue` check run (confirmed via `github_get_check_runs` as
// `completed`/`cancelled`). Reproduced here with the exact reported PR number,
// `mergeable` value, and single-job shape (no other checks alongside it,
// unlike the LS-10116 suite's multi-job cases above). Investigation found no
// defect in the current CI_FAILURE_CONCLUSIONS/NON_RESULT_CONCLUSIONS
// classification (this test passes against current source) — most likely
// explanation is a deployed MCP server instance that had not yet picked up
// the LS-10116 fix. Kept as a permanent regression guard against this exact
// reported shape recurring in the classifier itself.
describe('prBatchStatus — LS-10151 recurrence guard (exact reported shape)', () => {
  it('reports pass, not fail, for PR #7974 with only a cancelled process-merge-queue job', async () => {
    mockedGraphQL.mockResolvedValue(
      gqlResponse({
        pr_7974: makePR(7974, [checkRun('process-merge-queue', 'CANCELLED')], {
          headRefName: 'claude/blissful-ride-xbfdqj',
          mergeable: 'UNKNOWN',
        }),
      }),
    );

    const result = await prBatchStatus({ numbers: [7974], compact: true });
    const parsed = JSON.parse(result.content[0].text) as ParsedBatchStatus;

    expect(parsed.prs[0].ciSummary).toBe('pass');
    expect(parsed.prs[0]).not.toHaveProperty('failedJobs');
  });
});

function checkRun(
  name: string,
  conclusion: string | null,
  status = 'COMPLETED',
  completedAt = '2026-01-02T09:01:00Z',
) {
  return {
    __typename: 'CheckRun',
    name,
    status,
    conclusion,
    startedAt: '2026-01-02T09:00:00Z',
    completedAt,
  };
}

describe('prBatchStatus — CANCELLED/SKIPPED are not failures (LS-10116)', () => {
  async function compactRow(checkNodes: unknown[]) {
    mockedGraphQL.mockResolvedValue(
      gqlResponse({ pr_7963: makePR(7963, checkNodes) }),
    );
    const result = await prBatchStatus({ numbers: [7963], compact: true });
    return (JSON.parse(result.content[0].text) as ParsedBatchStatus).prs[0];
  }

  it('reports pass when the only non-success job is a cancelled merge-queue attempt', async () => {
    const row = await compactRow([
      checkRun('process-merge-queue', 'CANCELLED'),
      checkRun('build', 'SUCCESS'),
      checkRun('test', 'SUCCESS'),
    ]);

    expect(row.ciSummary).toBe('pass');
    expect(row).not.toHaveProperty('failedJobs');
  });

  it('keeps cancelled jobs visible in cancelledJobs rather than dropping them', async () => {
    const row = await compactRow([
      checkRun('process-merge-queue', 'CANCELLED'),
      checkRun('stale-check', 'STALE'),
      checkRun('build', 'SUCCESS'),
    ]);

    expect(row.ciSummary).toBe('pass');
    expect(row.cancelledJobs).toEqual(['process-merge-queue', 'stale-check']);
  });

  it('reports pass when the only non-success jobs are skipped', async () => {
    const row = await compactRow([
      checkRun('deploy', 'SKIPPED'),
      checkRun('build', 'SUCCESS'),
    ]);

    expect(row.ciSummary).toBe('pass');
    expect(row).not.toHaveProperty('failedJobs');
  });

  it('reports pending — not pass — when a cancelled job coexists with a running job', async () => {
    const row = await compactRow([
      checkRun('process-merge-queue', 'CANCELLED'),
      checkRun('build', null, 'IN_PROGRESS'),
    ]);

    expect(row.ciSummary).toBe('pending');
    expect(row).not.toHaveProperty('failedJobs');
  });

  // Negative controls: the fix must not turn real failures into passes.
  it('still reports fail when a cancelled job coexists with a real failure', async () => {
    const row = await compactRow([
      checkRun('process-merge-queue', 'CANCELLED'),
      checkRun('lint', 'FAILURE'),
      checkRun('build', 'SUCCESS'),
    ]);

    expect(row.ciSummary).toBe('fail');
    expect(row.failedJobs).toEqual(['lint']);
    expect(row.cancelledJobs).toEqual(['process-merge-queue']);
  });

  it.each(['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])(
    'still reports fail for a %s conclusion',
    async (conclusion) => {
      const row = await compactRow([
        checkRun('build', 'SUCCESS'),
        checkRun('gate', conclusion),
      ]);

      expect(row.ciSummary).toBe('fail');
      expect(row.failedJobs).toEqual(['gate']);
    },
  );

  it('still reports fail for an ERROR StatusContext', async () => {
    const row = await compactRow([
      checkRun('build', 'SUCCESS'),
      {
        __typename: 'StatusContext',
        context: 'legacy/status',
        state: 'ERROR',
        createdAt: '2026-01-02T09:00:00Z',
      },
    ]);

    expect(row.ciSummary).toBe('fail');
    expect(row.failedJobs).toEqual(['legacy/status']);
  });

  it('reports pass and no failure fields when every job is green', async () => {
    const row = await compactRow([
      checkRun('build', 'SUCCESS'),
      checkRun('test', 'SUCCESS'),
    ]);

    expect(row.ciSummary).toBe('pass');
    expect(row).not.toHaveProperty('failedJobs');
    expect(row).not.toHaveProperty('cancelledJobs');
  });

  it('leaves the full form unchanged apart from the corrected ciSummary', async () => {
    mockedGraphQL.mockResolvedValue(
      gqlResponse({
        pr_7963: makePR(7963, [
          checkRun('process-merge-queue', 'CANCELLED'),
          checkRun('build', 'SUCCESS'),
        ]),
      }),
    );

    const result = await prBatchStatus({ numbers: [7963] });
    const parsed = JSON.parse(result.content[0].text) as {
      prs: Array<{
        ciSummary: string;
        ciJobs: Array<{ name: string; conclusion: string | null }>;
      }>;
    };

    expect(parsed.prs[0].ciSummary).toBe('pass');
    // ciJobs keeps the cancelled row so the full form remains the audit trail.
    expect(parsed.prs[0].ciJobs).toEqual([
      {
        name: 'process-merge-queue',
        status: 'COMPLETED',
        conclusion: 'CANCELLED',
      },
      { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]);
  });
});
