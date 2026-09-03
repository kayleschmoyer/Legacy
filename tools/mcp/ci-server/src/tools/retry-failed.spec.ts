import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  postWithRetryOnAlreadyRunning: jest.fn(),
}));

jest.mock('../logs.js', () => ({
  fetchRunLogsRing: jest.fn(),
}));

import { retryFailed } from './retry-failed.js';
import * as githubApi from '../github-api.js';
import * as logsModule from '../logs.js';

const mockGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, qs?: Record<string, string>) => Promise<unknown>
>;
const mockPost = githubApi.postWithRetryOnAlreadyRunning as jest.MockedFunction<
  typeof githubApi.postWithRetryOnAlreadyRunning
>;
const mockFetchLogs = logsModule.fetchRunLogsRing as jest.MockedFunction<
  typeof logsModule.fetchRunLogsRing
>;

function runResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 999,
    run_attempt: 1,
    conclusion: 'failure',
    status: 'completed',
    html_url: 'https://github.com/example/repo/actions/runs/999',
    ...overrides,
  };
}

function job(
  id: number,
  name: string,
  conclusion: string | null,
  status = 'completed',
) {
  return { id, name, conclusion, status };
}

describe('retryFailed', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockFetchLogs.mockReset();
    mockPost.mockResolvedValue(undefined);
    mockFetchLogs.mockResolvedValue({
      lines: ['some log', 'error: boom', 'after'],
      totalLines: 3,
    });
  });

  describe('validation', () => {
    it('rejects a non-positive runId without calling the API', async () => {
      const result = await retryFailed({ runId: 0 });
      expect(result.isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('failed-jobs path', () => {
    beforeEach(() => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/actions/runs/999') {
          return Promise.resolve(runResponse({ run_attempt: 1 }));
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({
            total_count: 3,
            jobs: [
              job(1, 'build', 'success'),
              job(2, 'test', 'failure'),
              job(3, 'lint', 'failure'),
            ],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });
    });

    it('triggers rerun-failed-jobs and returns the new attempt id', async () => {
      // Second GET on the run (after rerun) returns incremented attempt.
      let runCallCount = 0;
      mockGet.mockImplementation((path: string) => {
        if (path === '/actions/runs/999') {
          runCallCount += 1;
          return Promise.resolve(
            runResponse({ run_attempt: runCallCount === 1 ? 1 : 2 }),
          );
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({
            total_count: 2,
            jobs: [job(1, 'build', 'success'), job(2, 'test', 'failure')],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryFailed({ runId: 999 });

      expect(result.isError).toBeUndefined();
      expect(mockPost).toHaveBeenCalledWith(
        '/actions/runs/999/rerun-failed-jobs',
      );
      const payload = JSON.parse(result.content[0].text) as {
        originalRunId: number;
        newRunId: number;
        originalAttempt: number;
        newAttempt: number;
        failedJobsRerun: Array<{ databaseId: number; name: string }>;
        originalLogSnippet: string;
      };
      expect(payload.originalRunId).toBe(999);
      expect(payload.newRunId).toBe(999);
      expect(payload.originalAttempt).toBe(1);
      expect(payload.newAttempt).toBe(2);
      expect(payload.failedJobsRerun).toEqual([
        { databaseId: 2, name: 'test', conclusion: 'failure' },
      ]);
      expect(payload.originalLogSnippet).toContain('error: boom');
    });

    it('includes a followUp hint when withFreshLogs is true', async () => {
      const result = await retryFailed({ runId: 999, withFreshLogs: true });
      const payload = JSON.parse(result.content[0].text) as {
        followUp?: string;
      };
      expect(payload.followUp).toMatch(/ci_get_logs/);
    });

    it('returns multiple failed jobs (partial-failure path)', async () => {
      const result = await retryFailed({ runId: 999 });
      const payload = JSON.parse(result.content[0].text) as {
        failedJobsRerun: Array<{ name: string }>;
      };
      expect(payload.failedJobsRerun.map((j) => j.name)).toEqual([
        'test',
        'lint',
      ]);
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('still returns a payload when log fetching fails', async () => {
      mockFetchLogs.mockRejectedValueOnce(new Error('logs unavailable'));
      const result = await retryFailed({ runId: 999 });
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        originalLogSnippet: string;
      };
      expect(payload.originalLogSnippet).toBe('');
    });
  });

  describe('stale merge-ref warning (LS-9638)', () => {
    it('includes a warning when the run replays a stale merge-ref', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/actions/runs/999') {
          return Promise.resolve(
            runResponse({
              run_attempt: 1,
              event: 'pull_request',
              pull_requests: [{ number: 7300 }],
              head_sha: 'abc123def456abc123def456abc123def456abc',
            }),
          );
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({
            total_count: 1,
            jobs: [job(2, 'test', 'failure')],
          });
        }
        if (path === '/pulls/7300') {
          return Promise.resolve({
            merge_commit_sha: 'fedcba987654fedcba987654fedcba987654fed',
            state: 'open',
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryFailed({ runId: 999 });

      const payload = JSON.parse(result.content[0].text) as {
        warning?: string;
      };
      expect(payload.warning).toMatch(/refs\/pull\/7300\/merge/);
    });
  });

  describe('pagination', () => {
    it('paginates jobs when a run has more than 100 of them', async () => {
      // Page 1: 100 successful jobs (full page → must request page 2)
      // Page 2: 1 successful + 1 failed job, then page 3 is empty
      const page1Jobs = Array.from({ length: 100 }, (_, i) =>
        job(i + 1, `build-${i + 1}`, 'success'),
      );
      const page2Jobs = [
        job(101, 'extra-success', 'success'),
        job(102, 'matrix-tail-failure', 'failure'),
      ];
      const totalCount = 102;
      const pagesByPage: Record<string, typeof page1Jobs> = {
        '1': page1Jobs,
        '2': page2Jobs,
      };
      const requestedPages: string[] = [];

      mockGet.mockImplementation(
        (path: string, qs?: Record<string, string>) => {
          if (path === '/actions/runs/555') {
            return Promise.resolve(runResponse({ id: 555, run_attempt: 1 }));
          }
          if (path === '/actions/runs/555/jobs') {
            const page = qs?.['page'] ?? '1';
            requestedPages.push(page);
            return Promise.resolve({
              total_count: totalCount,
              jobs: pagesByPage[page] ?? [],
            });
          }
          throw new Error(`unexpected path ${path}`);
        },
      );

      const result = await retryFailed({ runId: 555 });

      expect(result.isError).toBeUndefined();
      expect(requestedPages).toContain('1');
      expect(requestedPages).toContain('2');
      const payload = JSON.parse(result.content[0].text) as {
        failedJobsRerun: Array<{ databaseId: number; name: string }>;
      };
      expect(payload.failedJobsRerun).toEqual([
        {
          databaseId: 102,
          name: 'matrix-tail-failure',
          conclusion: 'failure',
        },
      ]);
      expect(mockPost).toHaveBeenCalledWith(
        '/actions/runs/555/rerun-failed-jobs',
      );
    });
  });

  describe('clean path (no failed jobs)', () => {
    it('returns a clear error and does NOT trigger a rerun', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/actions/runs/777') {
          return Promise.resolve(
            runResponse({ id: 777, conclusion: 'success' }),
          );
        }
        if (path === '/actions/runs/777/jobs') {
          return Promise.resolve({
            total_count: 2,
            jobs: [job(10, 'build', 'success'), job(11, 'test', 'success')],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryFailed({ runId: 777 });

      expect(result.isError).toBe(true);
      expect(mockPost).not.toHaveBeenCalled();
      expect(result.content[0].text).toMatch(/No failed jobs to rerun/);
      expect(result.content[0].text).toMatch(/777/);
    });
  });

  describe('API errors', () => {
    it('returns an error if the initial fetch fails', async () => {
      mockGet.mockRejectedValue(new Error('not found'));
      const result = await retryFailed({ runId: 123 });
      expect(result.isError).toBe(true);
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('already-running 403 surfaced by the retry wrapper', () => {
    beforeEach(() => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/actions/runs/999') {
          return Promise.resolve(runResponse({ run_attempt: 1 }));
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({
            total_count: 2,
            jobs: [job(1, 'build', 'success'), job(2, 'test', 'failure')],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });
    });

    it('surfaces a final "gave up after N attempts" error as a tool error', async () => {
      mockPost.mockRejectedValue(
        new Error(
          'GitHub API 403: This workflow is already running. (gave up after 3 attempts waiting for the run to settle)',
        ),
      );

      const result = await retryFailed({ runId: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/gave up after 3 attempts/);
    });

    it('still fails fast on a non-matching 403 (e.g. permissions)', async () => {
      mockPost.mockRejectedValue(
        new Error('GitHub API 403: Resource not accessible by integration'),
      );

      const result = await retryFailed({ runId: 999 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(
        /Resource not accessible by integration/,
      );
    });
  });
});
