import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  githubPost: jest.fn(),
}));

import { unwedgeOrchestrator } from './unwedge-orchestrator.js';
import * as githubApi from '../github-api.js';

const mockGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, params?: Record<string, string>) => Promise<unknown>
>;
const mockPost = githubApi.githubPost as unknown as jest.MockedFunction<
  (path: string, body?: unknown) => Promise<unknown>
>;

function parseBody(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

function pull(overrides: Partial<{ sha: string; ref: string }> = {}) {
  return {
    head: { sha: overrides.sha ?? 'abc123', ref: overrides.ref ?? 'my-branch' },
  };
}

function run(
  overrides: Partial<{
    id: number;
    status: string;
    conclusion: string | null;
    created_at: string;
    head_sha: string;
  }> = {},
) {
  return {
    id: 999,
    status: 'pending',
    conclusion: null,
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    head_sha: 'abc123',
    ...overrides,
  };
}

describe('unwedgeOrchestrator', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  describe('validation', () => {
    it('rejects a non-positive prNumber without calling the API', async () => {
      const result = await unwedgeOrchestrator({ prNumber: 0 });
      expect(result.isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('no wedge found', () => {
    it('returns status "clean" when there is no pending 0-job run', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42') return Promise.resolve(pull());
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({ workflow_runs: [] });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(result.isError).toBeUndefined();
      expect(parseBody(result.content[0].text)).toMatchObject({
        status: 'clean',
        prNumber: 42,
      });
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('ignores a pending run younger than staleAfterSeconds', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42') return Promise.resolve(pull());
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({
            workflow_runs: [
              run({ created_at: new Date().toISOString() }), // just created
            ],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(parseBody(result.content[0].text).status).toBe('clean');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('ignores a stale pending run that already has jobs registered', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42') return Promise.resolve(pull());
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({ workflow_runs: [run()] });
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({ total_count: 3 });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(parseBody(result.content[0].text).status).toBe('clean');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('ignores runs whose head_sha does not match the PR current head', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42')
          return Promise.resolve(pull({ sha: 'fresh-sha' }));
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({
            workflow_runs: [run({ head_sha: 'stale-sha' })],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(parseBody(result.content[0].text).status).toBe('clean');
    });

    it('stops paginating once a full page has no matches, without fetching further pages', async () => {
      const fullPageOfNewerRuns = Array.from({ length: 100 }, (_, i) =>
        run({ id: 1000 + i, head_sha: 'newer-sha' }),
      );
      let runsCallCount = 0;
      mockGet.mockImplementation(
        (path: string, params?: Record<string, string>) => {
          if (path === '/pulls/42') return Promise.resolve(pull());
          if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
            runsCallCount += 1;
            expect(params?.page).toBe('1');
            return Promise.resolve({ workflow_runs: fullPageOfNewerRuns });
          }
          throw new Error(`unexpected path ${path}`);
        },
      );

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(runsCallCount).toBe(1);
      expect(parseBody(result.content[0].text).status).toBe('clean');
    });
  });

  describe('pagination beyond the first page', () => {
    it('finds a wedged run on the second page when the current SHA alone has a full first page of runs', async () => {
      // Nothing can be newer than the PR's current head SHA (it's the latest
      // push), so a realistic "more than one page" scenario is many runs for
      // that *same* SHA (repeated pull_request_review dispatches, retries,
      // etc.) — not a page of a different, newer SHA, which can't exist.
      const fullPageForCurrentSha = Array.from({ length: 100 }, (_, i) =>
        run({ id: 1000 + i, status: 'completed', conclusion: 'success' }),
      );
      mockGet.mockImplementation(
        (path: string, params?: Record<string, string>) => {
          if (path === '/pulls/42') return Promise.resolve(pull());
          if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
            if (params?.page === '1') {
              return Promise.resolve({ workflow_runs: fullPageForCurrentSha });
            }
            if (params?.page === '2') {
              return Promise.resolve({ workflow_runs: [run()] });
            }
            throw new Error(`unexpected page ${params?.page}`);
          }
          if (path === '/actions/runs/999/jobs') {
            return Promise.resolve({ total_count: 0 });
          }
          if (path === '/actions/runs/999') {
            return Promise.resolve(
              run({ status: 'completed', conclusion: 'cancelled' }),
            );
          }
          throw new Error(`unexpected path ${path}`);
        },
      );
      mockPost.mockResolvedValue({});

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(parseBody(result.content[0].text)).toMatchObject({
        status: 'redispatched',
        cancelledRunId: 999,
      });
    });
  });

  describe('wedge found and recovered', () => {
    it('cancels the wedged run, confirms cancellation, and redispatches via the ci:run label', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42') return Promise.resolve(pull());
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({ workflow_runs: [run()] });
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({ total_count: 0 });
        }
        if (path === '/actions/runs/999') {
          return Promise.resolve(
            run({ status: 'completed', conclusion: 'cancelled' }),
          );
        }
        throw new Error(`unexpected path ${path}`);
      });
      mockPost.mockResolvedValue({});

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(mockPost).toHaveBeenCalledWith('/actions/runs/999/cancel');
      expect(mockPost).toHaveBeenCalledWith('/issues/42/labels', {
        labels: ['ci:run'],
      });
      expect(result.isError).toBeUndefined();
      expect(parseBody(result.content[0].text)).toMatchObject({
        status: 'redispatched',
        cancelledRunId: 999,
      });
    });

    it('tolerates a 409 from cancel (run already completed) and proceeds to poll', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42') return Promise.resolve(pull());
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({ workflow_runs: [run()] });
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({ total_count: 0 });
        }
        if (path === '/actions/runs/999') {
          return Promise.resolve(
            run({ status: 'completed', conclusion: 'cancelled' }),
          );
        }
        throw new Error(`unexpected path ${path}`);
      });
      mockPost.mockImplementation((path: string) => {
        if (path === '/actions/runs/999/cancel') {
          return Promise.reject(new Error('GitHub API 409: already completed'));
        }
        return Promise.resolve({});
      });

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      expect(parseBody(result.content[0].text).status).toBe('redispatched');
    });
  });

  describe('cancellation not confirmed within the poll budget', () => {
    it('returns status "cancelling" with a resumable hint instead of an error', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42') return Promise.resolve(pull());
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({ workflow_runs: [run()] });
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({ total_count: 0 });
        }
        if (path === '/actions/runs/999') {
          return Promise.resolve(run({ status: 'pending' })); // never completes
        }
        throw new Error(`unexpected path ${path}`);
      });
      mockPost.mockResolvedValue({});
      jest.useFakeTimers();

      try {
        const resultPromise = unwedgeOrchestrator({
          prNumber: 42,
          maxWaitSeconds: 6,
        });
        await jest.runAllTimersAsync();
        const result = await resultPromise;

        const body = parseBody(result.content[0].text);
        expect(body).toMatchObject({
          status: 'cancelling',
          runId: 999,
          prNumber: 42,
        });
        expect(body.hint).toContain(
          'ci_unwedge_orchestrator({ prNumber: 42, runId: 999 })',
        );
        // Redispatch must not happen until cancellation is confirmed.
        expect(mockPost).not.toHaveBeenCalledWith('/issues/42/labels', {
          labels: ['ci:run'],
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('resume mode (runId passed) skips discovery and re-cancellation, only polling and redispatching', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/actions/runs/999') {
          return Promise.resolve(
            run({ status: 'completed', conclusion: 'cancelled' }),
          );
        }
        throw new Error(`unexpected path ${path}`);
      });
      mockPost.mockResolvedValue({});

      const result = await unwedgeOrchestrator({ prNumber: 42, runId: 999 });

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith('/actions/runs/999');
      expect(mockPost).not.toHaveBeenCalledWith('/actions/runs/999/cancel');
      expect(mockPost).toHaveBeenCalledWith('/issues/42/labels', {
        labels: ['ci:run'],
      });
      expect(parseBody(result.content[0].text).status).toBe('redispatched');
    });
  });

  describe('run resolves on its own instead of being cancelled', () => {
    it('returns status "unnecessary" and does not redispatch', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/pulls/42') return Promise.resolve(pull());
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({ workflow_runs: [run()] });
        }
        if (path === '/actions/runs/999/jobs') {
          return Promise.resolve({ total_count: 0 });
        }
        if (path === '/actions/runs/999') {
          return Promise.resolve(
            run({ status: 'completed', conclusion: 'success' }),
          );
        }
        throw new Error(`unexpected path ${path}`);
      });
      mockPost.mockResolvedValue({});

      const result = await unwedgeOrchestrator({ prNumber: 42 });

      const body = parseBody(result.content[0].text);
      expect(body).toMatchObject({
        status: 'unnecessary',
        conclusion: 'success',
      });
      expect(mockPost).not.toHaveBeenCalledWith('/issues/42/labels', {
        labels: ['ci:run'],
      });
    });
  });

  describe('fatal errors', () => {
    it('propagates a 404 (bad PR number) as an error result', async () => {
      mockGet.mockRejectedValue(new Error('GitHub API 404: Not Found'));

      const result = await unwedgeOrchestrator({ prNumber: 424242 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to unwedge orchestrator',
      );
    });
  });
});
