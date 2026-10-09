import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

import { viewRunJobs } from './view-run-jobs.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as jest.MockedFunction<
  typeof githubApi.githubGet
>;

const job = {
  id: 1,
  run_id: 99,
  name: 'build',
  status: 'completed',
  conclusion: 'failure',
  started_at: null,
  completed_at: null,
};

const EMPTY = { total_count: 0, jobs: [] };

/** Route mocked GitHub responses by path: attempt number -> jobs payload. */
function mockRun(runAttempt: number, byAttempt: Record<string, unknown>) {
  mockGithubGet.mockImplementation(((path: string) => {
    if (path === '/actions/runs/99') {
      return Promise.resolve({ run_attempt: runAttempt });
    }
    const m = /\/attempts\/(\d+)\/jobs$/.exec(path);
    const key = m ? m[1] : 'latest';
    return Promise.resolve(byAttempt[key] ?? EMPTY);
  }) as typeof githubApi.githubGet);
}

function text(result: Awaited<ReturnType<typeof viewRunJobs>>): string {
  return (result.content[0] as { text: string }).text;
}

describe('viewRunJobs (LS-10480)', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  it('falls back to the newest earlier attempt with jobs when the latest is empty', async () => {
    mockRun(2, { latest: EMPTY, '1': { total_count: 1, jobs: [job] } });
    const out = text(await viewRunJobs({ runId: 99 }));
    expect(out).toContain('"attempt":1');
    expect(out).toContain('Latest attempt 2 has no jobs yet');
    expect(out).toContain('"total":1');
    expect(out).toContain('build');
  });

  it('names the existing attempts when an explicit attempt is empty', async () => {
    mockRun(2, { '2': EMPTY });
    const out = text(await viewRunJobs({ runId: 99, attempt: 2 }));
    expect(out).toContain('Attempt 2 has no jobs; run has attempts 1-2');
    expect(out).toContain('No jobs found.');
  });

  it('does not add a note or extra calls when jobs exist', async () => {
    mockRun(2, { latest: { total_count: 1, jobs: [job] } });
    const out = text(await viewRunJobs({ runId: 99 }));
    expect(out).not.toContain('note');
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });

  it('stays quiet for a single-attempt run with no jobs', async () => {
    mockRun(1, {});
    const out = text(await viewRunJobs({ runId: 99 }));
    expect(out).not.toContain('note');
    expect(out).toContain('No jobs found.');
  });
});
