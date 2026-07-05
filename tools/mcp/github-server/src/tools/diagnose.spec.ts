import { diagnose } from './diagnose';

jest.mock('../github-api', () => ({
  githubRest: jest.fn(),
  githubGraphQL: jest.fn(),
}));

jest.mock('../auth', () => ({
  getRepoOwnerName: jest.fn(),
}));

jest.mock('../required-checks', () => ({
  evaluatePRChecks: jest.fn(),
}));

const { githubRest: mockGithubRest, githubGraphQL: mockGithubGraphQL } =
  jest.requireMock('../github-api') as {
    githubRest: jest.Mock;
    githubGraphQL: jest.Mock;
  };
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock(
  '../auth',
) as {
  getRepoOwnerName: jest.Mock;
};
const { evaluatePRChecks: mockEvaluatePRChecks } = jest.requireMock(
  '../required-checks',
) as {
  evaluatePRChecks: jest.Mock;
};

const BASE_PR = {
  number: 100,
  title: 'Test PR',
  url: 'https://example/pr/100',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  isInMergeQueue: false,
  headRefOid: 'abc123',
  baseRefName: 'main',
  reviewDecision: null,
  labels: { nodes: [] },
  reviews: { nodes: [] },
  reviewThreads: { totalCount: 0, nodes: [] },
};

describe('diagnose', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRepoOwnerName.mockResolvedValue({
      owner: 'bkrupa',
      name: 'legacy-sports',
    });
    mockEvaluatePRChecks.mockResolvedValue({
      failing: [],
      pending: [],
      passing: 5,
      hadDuplicateRuns: false,
    });
  });

  it('returns error when PR not found', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: null } },
    });
    const result = await diagnose({ prNumber: 999 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
  });

  it('returns AWAITING_REVIEW reason when PR is open and no reviews', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: BASE_PR } },
    });
    const result = await diagnose({ prNumber: 100 });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('AWAITING_REVIEW');
  });

  it('returns DRAFT reason for draft PRs', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: { ...BASE_PR, isDraft: true } } },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('DRAFT');
  });

  it('returns MERGE_CONFLICT when mergeable is CONFLICTING', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: { pullRequest: { ...BASE_PR, mergeable: 'CONFLICTING' } },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('MERGE_CONFLICT');
  });

  it('returns MERGE_CONFLICT from the CI: Conflicts label when mergeable is stale-MERGEABLE', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...BASE_PR,
            mergeable: 'MERGEABLE',
            labels: { nodes: [{ name: 'CI: Conflicts' }] },
          },
        },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('MERGE_CONFLICT');
  });

  it('returns MERGE_CONFLICT (not CI_FAILING) when the No Merge Conflicts check fails during a mergeable UNKNOWN window', async () => {
    mockEvaluatePRChecks.mockResolvedValue({
      failing: ['No Merge Conflicts (failure)'],
      pending: [],
      passing: 0,
      hadDuplicateRuns: false,
    });
    mockGithubRest.mockResolvedValue({ total_count: 0, check_runs: [] });
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: { pullRequest: { ...BASE_PR, mergeable: 'UNKNOWN' } },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('MERGE_CONFLICT');
  });

  it('notes un-ruled-out conflicts on CI_FAILING while mergeable is UNKNOWN', async () => {
    mockEvaluatePRChecks.mockResolvedValue({
      failing: ['typecheck (failure)'],
      pending: [],
      passing: 0,
      hadDuplicateRuns: false,
    });
    mockGithubRest.mockResolvedValue({ total_count: 0, check_runs: [] });
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: { pullRequest: { ...BASE_PR, mergeable: 'UNKNOWN' } },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('CI_FAILING');
    expect(payload.summary).toContain('conflicts cannot be ruled out');
  });

  it('returns CI_FAILING when evaluatePRChecks reports failures', async () => {
    mockEvaluatePRChecks.mockResolvedValue({
      failing: ['typecheck'],
      pending: [],
      passing: 0,
      hadDuplicateRuns: false,
    });
    mockGithubRest.mockResolvedValue({
      total_count: 1,
      check_runs: [
        {
          id: 1,
          name: 'typecheck',
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://example',
          output: { title: null, summary: null },
        },
      ],
    });
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: BASE_PR } },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('CI_FAILING');
    expect(payload.failingJobs).toHaveLength(1);
  });

  it('returns MERGED for merged PRs', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: { ...BASE_PR, state: 'MERGED' } } },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBe('MERGED');
  });

  it('surfaces CI evaluation failure non-fatally', async () => {
    mockEvaluatePRChecks.mockRejectedValue(new Error('CI unavailable'));
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: BASE_PR } },
    });
    const result = await diagnose({ prNumber: 100 });
    // Should succeed despite CI evaluation failure
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.reason).toBeDefined();
  });
});
