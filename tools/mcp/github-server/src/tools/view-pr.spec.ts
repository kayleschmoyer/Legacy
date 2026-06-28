jest.mock('../github-api', () => ({ githubGraphQL: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));

import { githubGraphQL } from '../github-api';
import { getRepoOwnerName } from '../auth';
import { viewPR } from './view-pr';

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
      pageInfo: { hasNextPage: false },
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
              },
            },
          },
        },
      ],
    },
    reviews: {
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
    const parsed = JSON.parse(text);
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
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.number).toBe(42);
    expect(parsed.title).toBe('feat: big feature');
    expect(parsed.state).toBe('OPEN');
    expect(parsed.isDraft).toBe(false);
  });
});

describe('viewPR — fields opt-in', () => {
  it('includes body when fields:["body"] passed', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42, fields: ['body'] });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('body');
    expect(parsed.body).toHaveLength(60_000);
    expect(parsed).not.toHaveProperty('files');
  });

  it('includes files when fields:["files"] passed', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42, fields: ['files'] });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('files');
    expect(parsed.files[0].path).toBe('src/foo.ts');
    expect(parsed.files[0].status).toBe('modified');
    expect(parsed).not.toHaveProperty('body');
  });

  it('includes reviews when fields:["reviews"] passed', async () => {
    mockedGraphQL.mockResolvedValue(gqlResponse(makePR()));
    const result = await viewPR({ number: 42, fields: ['reviews'] });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.reviews[0].state).toBe('APPROVED');
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
