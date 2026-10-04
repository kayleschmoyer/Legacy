jest.mock('./github-api', () => ({ githubRest: jest.fn() }));

import { githubRest } from './github-api';
import {
  diagnoseNeverRegistered,
  fetchLatestCompletedRunForBranch,
  fetchWorkflowRunsForSha,
} from './ci-run-diagnosis';
import type { WorkflowRun } from './ci-run-diagnosis';

const mockGithubRest = githubRest as jest.MockedFunction<typeof githubRest>;

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 1,
    status: 'completed',
    conclusion: 'cancelled',
    head_sha: 'cdaf1c2',
    head_branch: 'ls-9247',
    created_at: '2026-08-10T00:00:00Z',
    ...overrides,
  };
}

describe('diagnoseNeverRegistered', () => {
  // LS-9335 repro: PR #6935 at commit cdaf1c2 — both orchestrator runs
  // (31421732904, 31422037097) were cancelled; the only completed run
  // (31419427766, conclusion "failure") belonged to the superseded commit
  // e812d4b.
  it('reports neverRan true and names the cancelled run IDs when every run for the head SHA is cancelled (AC1)', () => {
    const runsForSha = [
      run({ id: 31421732904, conclusion: 'cancelled' }),
      run({ id: 31422037097, conclusion: 'cancelled' }),
    ];
    const latestBranchRun = run({
      id: 31419427766,
      head_sha: 'e812d4b',
      conclusion: 'failure',
    });

    const result = diagnoseNeverRegistered(
      runsForSha,
      'cdaf1c2',
      latestBranchRun,
    );

    expect(result.neverRan).toBe(true);
    expect(result.cancelledRunIds).toEqual([31421732904, 31422037097]);
  });

  it('distinguishes a completed run on the head SHA from one on a superseded SHA (AC3)', () => {
    const runsForSha = [run({ id: 1, conclusion: 'cancelled' })];
    const latestBranchRun = run({
      id: 99,
      head_sha: 'superseded-sha',
      conclusion: 'failure',
    });

    const result = diagnoseNeverRegistered(
      runsForSha,
      'cdaf1c2',
      latestBranchRun,
    );

    expect(result.staleCompletedRun).toEqual({
      runId: 99,
      sha: 'superseded-sha',
      conclusion: 'failure',
    });
  });

  it('omits staleCompletedRun when the latest branch run IS the head SHA', () => {
    const runsForSha = [
      run({ id: 1, conclusion: 'cancelled', head_sha: 'cdaf1c2' }),
    ];
    const latestBranchRun = run({
      id: 1,
      head_sha: 'cdaf1c2',
      conclusion: 'cancelled',
    });

    const result = diagnoseNeverRegistered(
      runsForSha,
      'cdaf1c2',
      latestBranchRun,
    );

    expect(result.staleCompletedRun).toBeUndefined();
  });

  it('reports neverRan false when a run for the head SHA is still queued (AC2)', () => {
    const runsForSha = [run({ id: 1, status: 'queued', conclusion: null })];

    const result = diagnoseNeverRegistered(runsForSha, 'cdaf1c2', null);

    expect(result.neverRan).toBe(false);
    expect(result.cancelledRunIds).toEqual([]);
  });

  it('reports neverRan false when a run for the head SHA is in_progress (AC2)', () => {
    const runsForSha = [
      run({ id: 1, conclusion: 'cancelled' }),
      run({ id: 2, status: 'in_progress', conclusion: null }),
    ];

    const result = diagnoseNeverRegistered(runsForSha, 'cdaf1c2', null);

    expect(result.neverRan).toBe(false);
  });

  it('reports neverRan false when no runs exist for the head SHA at all', () => {
    const result = diagnoseNeverRegistered([], 'cdaf1c2', null);

    expect(result.neverRan).toBe(false);
    expect(result.cancelledRunIds).toEqual([]);
  });

  it('reports neverRan false when a completed run for the SHA has a non-cancelled conclusion', () => {
    const runsForSha = [run({ id: 1, conclusion: 'failure' })];

    const result = diagnoseNeverRegistered(runsForSha, 'cdaf1c2', null);

    expect(result.neverRan).toBe(false);
  });
});

describe('fetchWorkflowRunsForSha', () => {
  afterEach(() => jest.clearAllMocks());

  it('paginates until all runs for the SHA are collected', async () => {
    mockGithubRest
      .mockResolvedValueOnce({
        total_count: 3,
        workflow_runs: [run({ id: 1 }), run({ id: 2 })],
      })
      .mockResolvedValueOnce({
        total_count: 3,
        workflow_runs: [run({ id: 3 })],
      });

    const result = await fetchWorkflowRunsForSha('o', 'r', 'cdaf1c2');

    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(mockGithubRest).toHaveBeenCalledTimes(2);
    expect(mockGithubRest).toHaveBeenNthCalledWith(1, {
      method: 'GET',
      path: '/repos/o/r/actions/runs',
      query: { head_sha: 'cdaf1c2', per_page: '100', page: '1' },
    });
  });
});

describe('fetchLatestCompletedRunForBranch', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the first completed run for the branch', async () => {
    mockGithubRest.mockResolvedValueOnce({
      total_count: 1,
      workflow_runs: [run({ id: 42 })],
    });

    const result = await fetchLatestCompletedRunForBranch('o', 'r', 'ls-9247');

    expect(result?.id).toBe(42);
    expect(mockGithubRest).toHaveBeenCalledWith({
      method: 'GET',
      path: '/repos/o/r/actions/runs',
      query: { branch: 'ls-9247', status: 'completed', per_page: '1' },
    });
  });

  it('returns null when the branch has no completed runs', async () => {
    mockGithubRest.mockResolvedValueOnce({ total_count: 0, workflow_runs: [] });

    const result = await fetchLatestCompletedRunForBranch('o', 'r', 'ls-9247');

    expect(result).toBeNull();
  });
});
