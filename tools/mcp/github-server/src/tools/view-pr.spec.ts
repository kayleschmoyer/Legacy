jest.mock('../github-api', () => ({ githubGraphQL: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { viewPR } from './view-pr';
import { githubGraphQL } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockedGraphQL = githubGraphQL as jest.MockedFunction<
  typeof githubGraphQL
>;
const mockedRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;

function makePR(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'feat: big feature',
    body: 'A'.repeat(60_000),
    state: 'OPEN',
    headRefName: 'claude/branch',
    baseRefName: 'main',
    author: { login: 'alice' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    mergedAt: null,
    closedAt: null,
    url: 'https://github.com/o/r/pull/42',
    labels: { nodes: [{ name: 'bug' }] },
    isDraft: false,
    reviewDecision: 'REVIEW_REQUIRED',
    additions: 100,
    deletions: 20,
    changedFiles: 5,
    files: {
      nodes: [
        {
          path: 'src/foo.ts',
          additions: 10,
          deletions: 2,
          changeType: 'MODIFIED',
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    commits: {
      totalCount: 3,
      nodes: [
        {
          commit: {
            statusCheckRollup: {
              contexts: {
                nodes: [
                  {
                    __typename: 'CheckRun',
                    name: 'build',
                    status: 'COMPLETED',
                    conclusion: 'SUCCESS',
                  },
                  {
                    __typename: 'CheckRun',
                    name: 'lint',
                    status: 'COMPLETED',
                    conclusion: 'FAILURE',
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      ],
    },
    reviews: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          author: { login: 'bob' },
          state: 'APPROVED',
          submittedAt: '2026-01-02T10:00:00Z',
        },
      ],
    },
    assignees: { nodes: [{ login: 'alice' }] },
    milestone: { title: 'Sprint 17' },
    ...overrides,
  };
}

function gqlResponse(pr: unknown) {
  return { data: { repository: { pullRequest: pr } }, errors: undefined };
}

interface ParsedViewPRResult {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  body?: string;
  files?: Array<{ path: string; status: string }>;
  reviews?: Array<{ state: string }>;
  checksSummary: {
    total: number;
    passed: number;
    failed: number;
    failedNames: string[];
  };
}

beforeEach(() => {
  mockedRepo.mockResolvedValue({ owner: 'org', name: 'repo' });
});

afterEach(() => jest.resetAllMocks());

describe('viewPR — compact default', () => {
  it('omits body and files when no fields param', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42 });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    const parsed = JSON.parse(text) as ParsedViewPRResult;
    expect(parsed).not.toHaveProperty('body');
    expect(parsed).not.toHaveProperty('files');
    expect(parsed).toHaveProperty('checksSummary');
    expect(parsed.checksSummary.failed).toBe(1);
    expect(parsed.checksSummary.passed).toBe(1);
    expect(parsed.checksSummary.failedNames).toEqual(['lint']);
  });

  it('includes checksSummary in compact output', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42 });
    const parsed = JSON.parse(result.content[0].text) as ParsedViewPRResult;
    expect(parsed.number).toBe(42);
    expect(parsed.title).toBe('feat: big feature');
    expect(parsed.state).toBe('OPEN');
    expect(parsed.isDraft).toBe(false);
  });
});

describe('viewPR — checksSummary dedup (LS-8667)', () => {
  it('dedupes stale/cancelled reruns to the latest run per check name', async () => {
    mockedGraphQL.mockResolvedValue(
      gqlResponse(
        makePR({
          commits: {
            totalCount: 3,
            nodes: [
              {
                commit: {
                  statusCheckRollup: {
                    contexts: {
                      nodes: [
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
                        // Duplicate rows with the same name and conclusion.
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
                      ],
                    },
                  },
                },
              },
            ],
          },
        }),
      ),
    );

    const result = await viewPR({ number: 42 });
    const parsed = JSON.parse(result.content[0].text) as ParsedViewPRResult;

    expect(parsed.checksSummary.total).toBe(3);
    expect(parsed.checksSummary.passed).toBe(3);
    expect(parsed.checksSummary.failed).toBe(0);
    expect(parsed.checksSummary.failedNames).toEqual([]);
  });
});

describe('viewPR — statusCheckRollup.contexts pagination (LS-9283)', () => {
  it('fetches remaining pages when the first page is truncated', async () => {
    mockedGraphQL
      .mockResolvedValueOnce(
        gqlResponse(
          makePR({
            commits: {
              totalCount: 1,
              nodes: [
                {
                  commit: {
                    statusCheckRollup: {
                      contexts: {
                        nodes: [
                          {
                            __typename: 'CheckRun',
                            name: 'check-1',
                            status: 'COMPLETED',
                            conclusion: 'SUCCESS',
                          },
                        ],
                        pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                      },
                    },
                  },
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              commits: {
                nodes: [
                  {
                    commit: {
                      statusCheckRollup: {
                        contexts: {
                          nodes: [
                            {
                              __typename: 'CheckRun',
                              name: 'check-2',
                              status: 'COMPLETED',
                              conclusion: 'FAILURE',
                            },
                          ],
                          pageInfo: { hasNextPage: false, endCursor: null },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        errors: undefined,
      });

    const result = await viewPR({ number: 42 });
    const parsed = JSON.parse(result.content[0].text) as ParsedViewPRResult;

    expect(mockedGraphQL).toHaveBeenCalledTimes(2);
    expect(mockedGraphQL.mock.calls[1][1]).toMatchObject({
      number: 42,
      cursor: 'cursor-1',
    });
    expect(parsed.checksSummary.total).toBe(2);
    expect(parsed.checksSummary.passed).toBe(1);
    expect(parsed.checksSummary.failed).toBe(1);
    expect(parsed.checksSummary.failedNames).toEqual(['check-2']);
  });
});

describe('viewPR — fields opt-in', () => {
  it('includes body when fields:["body"] passed', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42, fields: ['body'] });
    const parsed = JSON.parse(result.content[0].text) as ParsedViewPRResult;
    expect(parsed).toHaveProperty('body');
    expect(parsed.body).toHaveLength(60_000);
    expect(parsed).not.toHaveProperty('files');
  });

  it('includes files when fields:["files"] passed', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42, fields: ['files'] });
    const parsed = JSON.parse(result.content[0].text) as ParsedViewPRResult;
    expect(parsed).toHaveProperty('files');
    expect(parsed.files[0].path).toBe('src/foo.ts');
    expect(parsed.files[0].status).toBe('modified');
    expect(parsed).not.toHaveProperty('body');
  });

  it('fetches remaining pages when files are truncated (LS-9305)', async () => {
    mockedGraphQL
      .mockResolvedValueOnce(
        gqlResponse(
          makePR({
            files: {
              nodes: [
                {
                  path: 'src/foo.ts',
                  additions: 10,
                  deletions: 2,
                  changeType: 'MODIFIED',
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            },
          }),
        ),
      )
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              files: {
                nodes: [
                  {
                    path: 'src/bar.ts',
                    additions: 3,
                    deletions: 0,
                    changeType: 'ADDED',
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
        errors: undefined,
      });

    const result = await viewPR({ number: 42, fields: ['files'] });
    const parsed = JSON.parse(result.content[0].text) as ParsedViewPRResult;

    expect(mockedGraphQL).toHaveBeenCalledTimes(2);
    expect(mockedGraphQL.mock.calls[1][1]).toMatchObject({
      number: 42,
      cursor: 'cursor-1',
    });
    expect(parsed.files).toHaveLength(2);
    expect(parsed.files?.map((f) => f.path)).toEqual([
      'src/foo.ts',
      'src/bar.ts',
    ]);
    expect(parsed).not.toHaveProperty('filesNote');
  });

  it('does not paginate files when field is not requested', async () => {
    mockedGraphQL.mockResolvedValueOnce(
      gqlResponse(
        makePR({
          files: {
            nodes: [
              {
                path: 'src/foo.ts',
                additions: 10,
                deletions: 2,
                changeType: 'MODIFIED',
              },
            ],
            pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
          },
        }),
      ),
    );

    const result = await viewPR({ number: 42 });
    JSON.parse(result.content[0].text);

    expect(mockedGraphQL).toHaveBeenCalledTimes(1);
  });

  it('includes reviews when fields:["reviews"] passed', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42, fields: ['reviews'] });
    const parsed = JSON.parse(result.content[0].text) as ParsedViewPRResult;
    expect(parsed.reviews[0].state).toBe('APPROVED');
  });
});

describe('viewPR — reviewDecision derivation (LS-8708)', () => {
  it('does not report stale CHANGES_REQUESTED once the same reviewer later approves', async () => {
    mockedGraphQL.mockResolvedValue(
      gqlResponse(
        makePR({
          // GitHub's reviewDecision field lagging behind the true state.
          reviewDecision: 'CHANGES_REQUESTED',
          reviews: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                author: { login: 'bot' },
                state: 'CHANGES_REQUESTED',
                submittedAt: '2026-01-02T09:00:00Z',
              },
              {
                author: { login: 'bot' },
                state: 'APPROVED',
                submittedAt: '2026-01-02T10:00:00Z',
              },
            ],
          },
        }),
      ),
    );
    const result = await viewPR({ number: 42 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reviewDecision).toBe('APPROVED');
  });

  it('falls back to the raw reviewDecision field when no reviews exist yet', async () => {
    mockedGraphQL.mockResolvedValue(
      gqlResponse(
        makePR({
          reviewDecision: 'REVIEW_REQUIRED',
          reviews: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [],
          },
        }),
      ),
    );
    const result = await viewPR({ number: 42 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reviewDecision).toBe('REVIEW_REQUIRED');
  });

  it("paginates past a truncated first review page to find a reviewer's true latest state", async () => {
    mockedGraphQL
      .mockResolvedValueOnce(
        gqlResponse(
          makePR({
            reviewDecision: 'CHANGES_REQUESTED',
            reviews: {
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
              nodes: [
                {
                  author: { login: 'bot' },
                  state: 'CHANGES_REQUESTED',
                  submittedAt: '2026-01-02T09:00:00Z',
                },
              ],
            },
          }),
        ),
      )
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              reviews: {
                pageInfo: { hasNextPage: false, endCursor: null },
                nodes: [
                  {
                    author: { login: 'bot' },
                    state: 'APPROVED',
                    submittedAt: '2026-01-02T10:00:00Z',
                  },
                ],
              },
            },
          },
        },
      });
    const result = await viewPR({ number: 42 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reviewDecision).toBe('APPROVED');
  });
});

describe('viewPR — error cases', () => {
  it('returns error when PR not found', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(null));
    const result = await viewPR({ number: 999 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
