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
