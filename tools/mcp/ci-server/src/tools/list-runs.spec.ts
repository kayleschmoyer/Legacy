import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

import { listRuns, resolveCommitSha, resolveWorkflowId } from './list-runs.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, query?: Record<string, string>) => Promise<unknown>
>;

describe('resolveCommitSha (LS-9589 AC1)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  it('returns a full 40-char SHA unchanged without calling the API', async () => {
    const fullSha = 'a'.repeat(40);
    const result = await resolveCommitSha(fullSha);
    expect(result).toBe(fullSha);
    expect(mockGithubGet).not.toHaveBeenCalled();
  });

  it('resolves an abbreviated SHA to its full SHA via the commits endpoint', async () => {
    const fullSha = '386219c44'.padEnd(40, '0');
    mockGithubGet.mockResolvedValue({ sha: fullSha });

    const result = await resolveCommitSha('386219c44');

    expect(mockGithubGet).toHaveBeenCalledWith('/commits/386219c44');
    expect(result).toBe(fullSha);
  });

  it('falls back to the original value when the abbreviated SHA lookup fails', async () => {
    mockGithubGet.mockRejectedValue(new Error('GitHub API 404: Not Found'));

    const result = await resolveCommitSha('deadbee');

    expect(result).toBe('deadbee');
  });

  it('passes through a non-hex value (e.g. a branch name) unchanged', async () => {
    const result = await resolveCommitSha('my-feature-branch');
    expect(result).toBe('my-feature-branch');
    expect(mockGithubGet).not.toHaveBeenCalled();
  });
});

describe('resolveWorkflowId (LS-9589 AC2)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  it('falls back to a case-insensitive substring match when the display name has an emoji prefix', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      workflows: [
        { id: 1, name: '🚀 CI Pipeline', path: '.github/workflows/ci.yml' },
      ],
    });

    const result = await resolveWorkflowId('CI Pipeline');

    expect(result).toBe('ci.yml');
  });
});

describe('listRuns (LS-9589)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  it('resolves an abbreviated commit SHA before filtering runs', async () => {
    const fullSha = '386219c44'.padEnd(40, '0');
    mockGithubGet.mockImplementation((path: string) => {
      if (path === '/commits/386219c44') {
        return Promise.resolve({ sha: fullSha });
      }
      return Promise.resolve({
        total_count: 1,
        workflow_runs: [
          {
            id: 1,
            run_number: 1,
            run_attempt: 1,
            conclusion: 'success',
            created_at: '2026-08-22T00:00:00Z',
            display_title: 'test',
            event: 'push',
            head_branch: 'main',
            head_sha: fullSha,
            name: 'CI Pipeline',
            status: 'completed',
            updated_at: '2026-08-22T00:00:00Z',
            html_url: 'https://github.com/x/y/actions/runs/1',
            workflow_id: 9,
          },
        ],
      });
    });

    const result = await listRuns({ commit: '386219c44' });

    expect(mockGithubGet).toHaveBeenCalledWith(
      '/actions/runs',
      expect.objectContaining({ head_sha: fullSha }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('CI Pipeline');
  });

  it('suggests the actual workflow name when a workflow filter matches zero runs but the branch/commit has runs elsewhere', async () => {
    mockGithubGet.mockImplementation((path: string) => {
      if (path.startsWith('/actions/workflows?')) {
        return Promise.resolve({
          total_count: 1,
          workflows: [
            {
              id: 5,
              name: 'Legacy Sports CI Orchestrator',
              path: '.github/workflows/ci-orchestrator.yml',
            },
          ],
        });
      }
      if (path.startsWith('/actions/workflows/')) {
        return Promise.resolve({ total_count: 0, workflow_runs: [] });
      }
      // Broader /actions/runs re-query without the workflow filter.
      return Promise.resolve({
        total_count: 1,
        workflow_runs: [
          {
            id: 2,
            run_number: 2,
            run_attempt: 1,
            conclusion: 'failure',
            created_at: '2026-08-22T00:00:00Z',
            display_title: 'test',
            event: 'push',
            head_branch: 'my-branch',
            head_sha: 'b'.repeat(40),
            name: 'Legacy Sports CI Orchestrator',
            status: 'completed',
            updated_at: '2026-08-22T00:00:00Z',
            html_url: 'https://github.com/x/y/actions/runs/2',
            workflow_id: 5,
          },
        ],
      });
    });

    const result = await listRuns({
      branch: 'my-branch',
      workflow: 'Legacy Sports CI Orchestrator',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Did you mean one of these');
    expect(result.content[0].text).toContain('Legacy Sports CI Orchestrator');
  });

  it('sorts runs by createdAt descending regardless of the order the API returns them in (LS-9426 AC1/AC3)', async () => {
    const makeRun = (id: number, createdAt: string) => ({
      id,
      run_number: id,
      run_attempt: 1,
      conclusion: 'success',
      created_at: createdAt,
      display_title: `run-${id}`,
      event: 'schedule',
      head_branch: 'main',
      head_sha: `${id}`.repeat(40).slice(0, 40),
      name: 'Terraform Lock Watchdog',
      status: 'completed',
      updated_at: createdAt,
      html_url: `https://github.com/x/y/actions/runs/${id}`,
      workflow_id: 9,
    });

    // Deliberately out of chronological order — a stale/newest-last run in
    // the middle of month-old rows, mirroring the LS-9426 observation where
    // same-day runs were missing from a response full of older ones.
    mockGithubGet.mockResolvedValue({
      total_count: 3,
      workflow_runs: [
        makeRun(1, '2026-07-11T00:00:00Z'),
        makeRun(3, '2026-08-13T07:02:00Z'),
        makeRun(2, '2026-07-14T00:00:00Z'),
      ],
    });

    const result = await listRuns({ branch: 'main', limit: 2 });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    // Newest run (3) must appear before the next-newest (2); the oldest (1)
    // must be dropped entirely since limit is applied after sorting.
    expect(text.indexOf('run-3')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('run-2')).toBeGreaterThan(text.indexOf('run-3'));
    expect(text).not.toContain('run-1');
  });

  it('returns the plain empty message when neither the workflow nor broader filters match any runs', async () => {
    mockGithubGet.mockImplementation((path: string) => {
      if (path.startsWith('/actions/workflows?')) {
        return Promise.resolve({
          total_count: 1,
          workflows: [
            { id: 5, name: 'CI Pipeline', path: '.github/workflows/ci.yml' },
          ],
        });
      }
      return Promise.resolve({ total_count: 0, workflow_runs: [] });
    });

    const result = await listRuns({
      branch: 'my-branch',
      workflow: 'CI Pipeline',
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe('No workflow runs found.');
  });
});
