import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

jest.mock('./retry-failed.js', () => ({
  retryFailed: jest.fn(),
}));

jest.mock('../logs.js', () => ({
  fetchRunLogsRing: jest.fn(),
}));

import { retryRunnerFlake } from './retry-runner-flake.js';
import * as retryFailedModule from './retry-failed.js';
import * as githubApi from '../github-api.js';
import * as logsModule from '../logs.js';

const mockGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, params?: Record<string, string>) => Promise<unknown>
>;
const mockRetryFailed = retryFailedModule.retryFailed as jest.MockedFunction<
  typeof retryFailedModule.retryFailed
>;
const mockFetchRunLogsRing = logsModule.fetchRunLogsRing as jest.MockedFunction<
  typeof logsModule.fetchRunLogsRing
>;

function comment(body: string) {
  return { body };
}

describe('retryRunnerFlake', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockRetryFailed.mockReset();
    mockRetryFailed.mockResolvedValue({
      content: [{ type: 'text', text: '{"originalRunId":12345}' }],
    });
    mockFetchRunLogsRing.mockReset();
  });

  describe('validation', () => {
    it('rejects a non-positive prNumber without calling the API', async () => {
      const result = await retryRunnerFlake({ prNumber: 0 });
      expect(result.isError).toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockRetryFailed).not.toHaveBeenCalled();
    });
  });

  describe('label present + comment found', () => {
    it('extracts the run id from the bot comment and delegates to retryFailed when the run matches the current head', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/42') {
          return Promise.resolve({ labels: [{ name: 'CI: Runner Flake' }] });
        }
        if (path === '/issues/42/comments') {
          return Promise.resolve([
            comment('unrelated comment'),
            comment(
              [
                '⚡ **CI cancelled due to a runner restart** — this is not caused by your code.',
                '',
                '[Re-run the failed jobs →](https://github.com/acme/repo/actions/runs/12345)',
              ].join('\n'),
            ),
          ]);
        }
        if (path === '/pulls/42') {
          return Promise.resolve({ head: { sha: 'currentsha' } });
        }
        if (path === '/actions/runs/12345') {
          return Promise.resolve({
            id: 12345,
            status: 'completed',
            head_sha: 'currentsha',
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 42 });

      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 12345 });
      expect(result.isError).toBeUndefined();
    });

    it('takes the most recent matching comment when a PR has multiple flake cycles', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/7') {
          return Promise.resolve({ labels: [{ name: 'CI: Runner Flake' }] });
        }
        if (path === '/issues/7/comments') {
          return Promise.resolve([
            comment(
              'CI cancelled due to a runner restart\n[link](https://github.com/acme/repo/actions/runs/111)',
            ),
            comment(
              'CI cancelled due to a runner restart\n[link](https://github.com/acme/repo/actions/runs/222)',
            ),
          ]);
        }
        if (path === '/pulls/7') {
          return Promise.resolve({ head: { sha: 'headsha222' } });
        }
        if (path === '/actions/runs/222') {
          return Promise.resolve({
            id: 222,
            status: 'completed',
            head_sha: 'headsha222',
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      await retryRunnerFlake({ prNumber: 7 });

      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 222 });
    });

    it('LS-9807: refuses and does not call retryFailed when the label/comment-resolved run belongs to a superseded head', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/7453') {
          return Promise.resolve({ labels: [{ name: 'CI: Runner Flake' }] });
        }
        if (path === '/issues/7453/comments') {
          return Promise.resolve([
            comment(
              'CI cancelled due to a runner restart\n[link](https://github.com/acme/repo/actions/runs/33554899413)',
            ),
          ]);
        }
        if (path === '/pulls/7453') {
          return Promise.resolve({ head: { sha: 'bdbfb99' } });
        }
        if (path === '/actions/runs/33554899413') {
          return Promise.resolve({
            id: 33554899413,
            status: 'completed',
            head_sha: 'b40d50b',
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 7453 });

      expect(mockRetryFailed).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('33554899413');
      expect(result.content[0].text).toContain('stale');
      expect(result.content[0].text).toContain('b40d50b');
      expect(result.content[0].text).toContain('bdbfb99');
      expect(result.content[0].text).toContain('ci_retry_failed');
    });
  });

  describe('label absent, comment absent', () => {
    it('returns a clear no-signal result when no completed run exists for the head SHA, making no write calls', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/99') {
          return Promise.resolve({ labels: [{ name: 'some-other-label' }] });
        }
        if (path === '/issues/99/comments') {
          return Promise.resolve([comment('unrelated comment')]);
        }
        if (path === '/pulls/99') {
          return Promise.resolve({ head: { sha: 'deadbeef' } });
        }
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({ workflow_runs: [] });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 99 });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain(
        'No runner-shutdown flake signal',
      );
      expect(result.content[0].text).toContain('CI: Runner Flake');
      expect(result.content[0].text).toContain('bot comment');
      expect(result.content[0].text).toContain('runner-shutdown signature');
      expect(mockRetryFailed).not.toHaveBeenCalled();
      expect(mockFetchRunLogsRing).not.toHaveBeenCalled();
    });

    it('LS-9334: falls back to a job-log scan and retries when the shutdown signature is found in a run whose "Report Runner Shutdown" job was skipped', async () => {
      mockGet.mockImplementation((path: string, params) => {
        if (path === '/issues/200') {
          return Promise.resolve({ labels: [{ name: 'some-other-label' }] });
        }
        if (path === '/issues/200/comments') {
          return Promise.resolve([comment('unrelated comment')]);
        }
        if (path === '/pulls/200') {
          return Promise.resolve({ head: { sha: 'abc123' } });
        }
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          expect(params).toMatchObject({ head_sha: 'abc123' });
          return Promise.resolve({
            workflow_runs: [{ id: 31421732904, status: 'completed' }],
          });
        }
        if (path === '/actions/runs/31421732904/jobs') {
          return Promise.resolve({
            total_count: 1,
            jobs: [{ conclusion: 'cancelled' }],
          });
        }
        if (path === '/actions/runs/31421732904') {
          return Promise.resolve({ id: 31421732904, status: 'completed' });
        }
        throw new Error(`unexpected path ${path}`);
      });
      mockFetchRunLogsRing.mockResolvedValue({
        lines: [],
        totalLines: 1,
        priorityLines: ['##[error]The runner has received a shutdown signal.'],
      });

      const result = await retryRunnerFlake({ prNumber: 200 });

      expect(mockFetchRunLogsRing).toHaveBeenCalledWith(
        { runId: 31421732904, failedOnly: true },
        1,
        expect.any(Function),
      );
      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 31421732904 });
      expect(result.isError).toBeUndefined();
    });

    it('still refuses (does not retry) when the failed job logs contain no shutdown signature — a genuine test failure', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/201') {
          return Promise.resolve({ labels: [{ name: 'some-other-label' }] });
        }
        if (path === '/issues/201/comments') {
          return Promise.resolve([comment('unrelated comment')]);
        }
        if (path === '/pulls/201') {
          return Promise.resolve({ head: { sha: 'def456' } });
        }
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({
            workflow_runs: [{ id: 555, status: 'completed' }],
          });
        }
        if (path === '/actions/runs/555/jobs') {
          return Promise.resolve({
            total_count: 1,
            jobs: [{ conclusion: 'failure' }],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });
      mockFetchRunLogsRing.mockResolvedValue({
        lines: [],
        totalLines: 1,
        priorityLines: [],
      });

      const result = await retryRunnerFlake({ prNumber: 201 });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain(
        'No runner-shutdown flake signal',
      );
      expect(mockRetryFailed).not.toHaveBeenCalled();
    });

    it('skips the log fetch entirely (never a false positive) when the latest completed run has no failed/cancelled jobs', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/202') {
          return Promise.resolve({ labels: [{ name: 'some-other-label' }] });
        }
        if (path === '/issues/202/comments') {
          return Promise.resolve([comment('unrelated comment')]);
        }
        if (path === '/pulls/202') {
          return Promise.resolve({ head: { sha: 'ghi789' } });
        }
        if (path === '/actions/workflows/ci-orchestrator.yml/runs') {
          return Promise.resolve({
            workflow_runs: [{ id: 777, status: 'completed' }],
          });
        }
        if (path === '/actions/runs/777/jobs') {
          return Promise.resolve({
            total_count: 1,
            jobs: [{ conclusion: 'success' }],
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 202 });

      expect(mockFetchRunLogsRing).not.toHaveBeenCalled();
      expect(mockRetryFailed).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain(
        'No runner-shutdown flake signal',
      );
    });
  });

  describe('label absent, comment present', () => {
    it('treats the bot comment as a sufficient signal on its own and retries', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/101') {
          return Promise.resolve({ labels: [{ name: 'some-other-label' }] });
        }
        if (path === '/issues/101/comments') {
          return Promise.resolve([
            comment(
              [
                '⚡ **CI cancelled due to a runner restart** — this is not caused by your code.',
                '',
                '[Re-run the failed jobs →](https://github.com/acme/repo/actions/runs/999)',
              ].join('\n'),
            ),
          ]);
        }
        if (path === '/pulls/101') {
          return Promise.resolve({ head: { sha: 'matchingsha' } });
        }
        if (path === '/actions/runs/999') {
          return Promise.resolve({
            id: 999,
            status: 'completed',
            head_sha: 'matchingsha',
          });
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 101 });

      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 999 });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('label present but no matching comment', () => {
    it('returns a clear no-signal result when no comment matches the signature', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/5') {
          return Promise.resolve({ labels: [{ name: 'CI: Runner Flake' }] });
        }
        if (path === '/issues/5/comments') {
          return Promise.resolve([comment('just a regular review comment')]);
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 5 });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain(
        'No runner-shutdown flake signal',
      );
      expect(mockRetryFailed).not.toHaveBeenCalled();
    });

    it('returns a clear no-signal result when the matching comment has no parseable run id', async () => {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/6') {
          return Promise.resolve({ labels: [{ name: 'CI: Runner Flake' }] });
        }
        if (path === '/issues/6/comments') {
          return Promise.resolve([
            comment('CI cancelled due to a runner restart, no link here'),
          ]);
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 6 });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain(
        'No runner-shutdown flake signal',
      );
      expect(mockRetryFailed).not.toHaveBeenCalled();
    });
  });

  describe('LS-10269: stale merge snapshot guard', () => {
    function mockPr(opts: {
      startedAt: string;
      baseCommits: unknown[] | Error;
    }) {
      mockGet.mockImplementation((path: string) => {
        if (path === '/issues/8076') {
          return Promise.resolve({ labels: [{ name: 'CI: Runner Flake' }] });
        }
        if (path === '/issues/8076/comments') {
          return Promise.resolve([
            comment(
              'CI cancelled due to a runner restart\n[link](https://github.com/acme/repo/actions/runs/999)',
            ),
          ]);
        }
        if (path === '/pulls/8076') {
          return Promise.resolve({ head: { sha: 'h' }, base: { ref: 'main' } });
        }
        if (path === '/actions/runs/999') {
          return Promise.resolve({
            id: 999,
            status: 'completed',
            head_sha: 'h',
            event: 'pull_request',
            run_started_at: opts.startedAt,
          });
        }
        if (path === '/commits') {
          return opts.baseCommits instanceof Error
            ? Promise.reject(opts.baseCommits)
            : Promise.resolve(opts.baseCommits);
        }
        throw new Error(`unexpected path ${path}`);
      });
    }

    const recent = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

    it('refuses when the run is older than the artifact retention window', async () => {
      mockPr({
        startedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        baseCommits: [],
      });
      const result = await retryRunnerFlake({ prNumber: 8076 });
      expect(mockRetryFailed).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toContain('retention window');
      expect(JSON.stringify(result)).toContain('ci_dispatch_workflow');
    });

    it('refuses when the base branch advanced since the run started', async () => {
      mockPr({ startedAt: recent(), baseCommits: [{ sha: 'newer' }] });
      const result = await retryRunnerFlake({ prNumber: 8076 });
      expect(mockRetryFailed).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).toContain('has advanced');
      expect(JSON.stringify(result)).toContain('Update the branch');
    });

    it('retries when the run is fresh and the base has not moved', async () => {
      mockPr({ startedAt: recent(), baseCommits: [] });
      await retryRunnerFlake({ prNumber: 8076 });
      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 999 });
    });

    it('fails open on the base-movement lookup so an API error does not block a retry', async () => {
      mockPr({ startedAt: recent(), baseCommits: new Error('boom') });
      await retryRunnerFlake({ prNumber: 8076 });
      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 999 });
    });
  });
});
