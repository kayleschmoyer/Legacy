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

interface DiagnosePayload {
  reason: string;
  summary: string;
  failingJobs: unknown[];
}

const { githubRest: mockGithubRest, githubGraphQL: mockGithubGraphQL } =
  jest.requireMock<{ githubRest: jest.Mock; githubGraphQL: jest.Mock }>(
    '../github-api',
  );
const { getRepoOwnerName: mockGetRepoOwnerName } = jest.requireMock<{
  getRepoOwnerName: jest.Mock;
}>('../auth');
const { evaluatePRChecks: mockEvaluatePRChecks } = jest.requireMock<{
  evaluatePRChecks: jest.Mock;
}>('../required-checks');

const BASE_PR = {
  number: 100,
  title: 'Test PR',
  url: 'https://example/pr/100',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  isInMergeQueue: false,
  headRefOid: 'abc123',
  baseRefName: 'main',
  reviewDecision: null,
  labels: { nodes: [] },
  reviews: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
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
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).toBe('AWAITING_REVIEW');
  });

  it('returns DRAFT reason for draft PRs', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: { ...BASE_PR, isDraft: true } } },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).toBe('DRAFT');
  });

  it('returns MERGE_CONFLICT when mergeable is CONFLICTING', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: { pullRequest: { ...BASE_PR, mergeable: 'CONFLICTING' } },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).toBe('MERGE_CONFLICT');
  });

  it('returns MERGE_CONFLICT from the CI: Conflicts label when mergeable is stale-MERGEABLE and mergeStateStatus has not confirmed clean', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...BASE_PR,
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'UNKNOWN',
            labels: { nodes: [{ name: 'CI: Conflicts' }] },
          },
        },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).toBe('MERGE_CONFLICT');
  });

  // LS-9945: the CI: Conflicts label is written by a separate,
  // independently-scheduled workflow and can lag real git state by
  // 5-15+ minutes after a conflict actually resolves. GitHub's own
  // `mergeable` + `mergeStateStatus` fields are recomputed live on every
  // push and don't share that lag — once both already agree the branch is
  // clean, a stale label alone must not override them. github_pr_why_blocked
  // got this fix first; github_pr_diagnose must apply the same check.
  it('does not report MERGE_CONFLICT from a stale CI: Conflicts label once live mergeable + mergeStateStatus both confirm the branch is clean (LS-9945)', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...BASE_PR,
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'CLEAN',
            labels: { nodes: [{ name: 'CI: Conflicts' }] },
          },
        },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).not.toBe('MERGE_CONFLICT');
  });

  it('also treats mergeStateStatus UNSTABLE (mergeable, but failing non-required checks) as confirming a lingering label is stale', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...BASE_PR,
            mergeable: 'MERGEABLE',
            mergeStateStatus: 'UNSTABLE',
            labels: { nodes: [{ name: 'CI: Conflicts' }] },
          },
        },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).not.toBe('MERGE_CONFLICT');
  });

  it('still reports MERGE_CONFLICT when mergeable itself is live CONFLICTING, even if mergeStateStatus disagrees', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...BASE_PR,
            mergeable: 'CONFLICTING',
            mergeStateStatus: 'DIRTY',
          },
        },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
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
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
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
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
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
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).toBe('CI_FAILING');
    expect(payload.failingJobs).toHaveLength(1);
  });

  it('returns CHANGES_REQUESTED when the latest review from a reviewer requests changes', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...BASE_PR,
            reviews: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  author: { login: 'bot' },
                  state: 'CHANGES_REQUESTED',
                  submittedAt: '2026-07-07T16:30:33Z',
                },
              ],
            },
          },
        },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).toBe('CHANGES_REQUESTED');
  });

  it('does not report stale CHANGES_REQUESTED once the same reviewer later approves (LS-8364)', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: {
        repository: {
          pullRequest: {
            ...BASE_PR,
            reviewDecision: 'APPROVED',
            reviews: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  author: { login: 'bot' },
                  state: 'CHANGES_REQUESTED',
                  submittedAt: '2026-07-07T16:30:33Z',
                },
                {
                  author: { login: 'bot' },
                  state: 'APPROVED',
                  submittedAt: '2026-07-07T16:50:50Z',
                },
              ],
            },
          },
        },
      },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).not.toBe('CHANGES_REQUESTED');
    expect(payload.reason).toBe('READY');
  });

  it("paginates past a truncated first review page to find a reviewer's true latest state (LS-8708)", async () => {
    mockGithubGraphQL
      .mockResolvedValueOnce({
        data: {
          repository: {
            pullRequest: {
              ...BASE_PR,
              reviewDecision: 'CHANGES_REQUESTED',
              reviews: {
                pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                nodes: [
                  {
                    author: { login: 'bot' },
                    state: 'CHANGES_REQUESTED',
                    submittedAt: '2026-07-07T16:30:33Z',
                  },
                ],
              },
            },
          },
        },
      })
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
                    submittedAt: '2026-07-07T16:50:50Z',
                  },
                ],
              },
            },
          },
        },
      });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).not.toBe('CHANGES_REQUESTED');
    expect(payload.reason).toBe('READY');
  });

  it('returns MERGED for merged PRs', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: { ...BASE_PR, state: 'MERGED' } } },
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
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
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload;
    expect(payload.reason).toBeDefined();
  });

  it('reports behindBy and the STALE_BASE hint for a failing check that is green on base (LS-10376)', async () => {
    mockGithubGraphQL.mockResolvedValue({
      data: { repository: { pullRequest: BASE_PR } },
    });
    mockEvaluatePRChecks.mockResolvedValue({
      failing: ['test (failure)'],
      pending: [],
      passing: 4,
      hadDuplicateRuns: false,
    });
    mockGithubRest.mockImplementation(({ path }: { path: string }) => {
      if (path.includes('/compare/')) {
        return Promise.resolve({
          behind_by: 3,
          ahead_by: 1,
          merge_base_commit: { sha: 'aaaaaaaaaaaaaaaa' },
          base_commit: { sha: 'bbbbbbbbbbbbbbbb' },
        });
      }
      const sha = path.split('/commits/')[1].split('/')[0];
      return Promise.resolve({
        check_runs: [
          {
            id: sha === 'bbbbbbbbbbbbbbbb' ? 1 : 2,
            name: 'test',
            status: 'completed',
            conclusion: sha === 'bbbbbbbbbbbbbbbb' ? 'success' : 'failure',
            html_url: 'u',
            output: { title: null, summary: null },
          },
        ],
      });
    });
    const result = await diagnose({ prNumber: 100 });
    const payload = JSON.parse(result.content[0].text) as DiagnosePayload & {
      behindBy: number;
      hint: string;
    };
    expect(payload.reason).toBe('CI_FAILING');
    expect(payload.behindBy).toBe(3);
    expect(payload.hint).toBe('STALE_BASE');
  });

  describe('mergeable UNKNOWN (LS-10375)', () => {
    const approved = { ...BASE_PR, reviewDecision: 'APPROVED' };
    const run = async (pr: Record<string, unknown>) => {
      mockGithubGraphQL.mockResolvedValue({
        data: { repository: { pullRequest: pr } },
      });
      const result = await diagnose({ prNumber: 100 });
      return JSON.parse(result.content[0].text) as DiagnosePayload;
    };

    it('returns MERGEABLE_UNKNOWN, not READY, when nothing else is wrong', async () => {
      const payload = await run({ ...approved, mergeable: 'UNKNOWN' });
      expect(payload.reason).toBe('MERGEABLE_UNKNOWN');
      expect(payload.summary).not.toMatch(/ready to merge/);
    });

    it('negative control: settled MERGEABLE + approved is still READY', async () => {
      const payload = await run(approved);
      expect(payload.reason).toBe('READY');
    });

    it('returns MERGE_CONFLICT when mergeStateStatus is DIRTY during the UNKNOWN window', async () => {
      const payload = await run({
        ...approved,
        mergeable: 'UNKNOWN',
        mergeStateStatus: 'DIRTY',
      });
      expect(payload.reason).toBe('MERGE_CONFLICT');
    });
  });
});
