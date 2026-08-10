import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

jest.mock('./retry-failed.js', () => ({
  retryFailed: jest.fn(),
}));

import { retryRunnerFlake } from './retry-runner-flake.js';
import * as githubApi from '../github-api.js';
import * as retryFailedModule from './retry-failed.js';

const mockGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string) => Promise<unknown>
>;
const mockRetryFailed = retryFailedModule.retryFailed as jest.MockedFunction<
  typeof retryFailedModule.retryFailed
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
    it('extracts the run id from the bot comment and delegates to retryFailed', async () => {
      mockGet.mockImplementation(async (path: string) => {
        if (path === '/issues/42') {
          return { labels: [{ name: 'CI: Runner Flake' }] };
        }
        if (path === '/issues/42/comments') {
          return [
            comment('unrelated comment'),
            comment(
              [
                '⚡ **CI cancelled due to a runner restart** — this is not caused by your code.',
                '',
                '[Re-run the failed jobs →](https://github.com/acme/repo/actions/runs/12345)',
              ].join('\n'),
            ),
          ];
        }
        throw new Error(`unexpected path ${path}`);
      });

      const result = await retryRunnerFlake({ prNumber: 42 });

      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 12345 });
      expect(result.isError).toBeUndefined();
    });

    it('takes the most recent matching comment when a PR has multiple flake cycles', async () => {
      mockGet.mockImplementation(async (path: string) => {
        if (path === '/issues/7') {
          return { labels: [{ name: 'CI: Runner Flake' }] };
        }
        if (path === '/issues/7/comments') {
          return [
            comment(
              'CI cancelled due to a runner restart\n[link](https://github.com/acme/repo/actions/runs/111)',
            ),
            comment(
              'CI cancelled due to a runner restart\n[link](https://github.com/acme/repo/actions/runs/222)',
            ),
          ];
        }
        throw new Error(`unexpected path ${path}`);
      });

      await retryRunnerFlake({ prNumber: 7 });

      expect(mockRetryFailed).toHaveBeenCalledWith({ runId: 222 });
    });
  });

  describe('label absent, comment absent', () => {
    it('returns a clear no-signal result naming both signals and makes no write calls', async () => {
      mockGet.mockImplementation(async (path: string) => {
        if (path === '/issues/99') {
          return { labels: [{ name: 'some-other-label' }] };
        }
        if (path === '/issues/99/comments') {
          return [comment('unrelated comment')];
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
      expect(mockRetryFailed).not.toHaveBeenCalled();
    });
  });

  describe('label absent, comment present', () => {
    it('treats the bot comment as a sufficient signal on its own and retries', async () => {
      mockGet.mockImplementation(async (path: string) => {
        if (path === '/issues/101') {
          return { labels: [{ name: 'some-other-label' }] };
        }
        if (path === '/issues/101/comments') {
          return [
            comment(
              [
                '⚡ **CI cancelled due to a runner restart** — this is not caused by your code.',
                '',
                '[Re-run the failed jobs →](https://github.com/acme/repo/actions/runs/999)',
              ].join('\n'),
            ),
          ];
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
      mockGet.mockImplementation(async (path: string) => {
        if (path === '/issues/5') {
          return { labels: [{ name: 'CI: Runner Flake' }] };
        }
        if (path === '/issues/5/comments') {
          return [comment('just a regular review comment')];
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
      mockGet.mockImplementation(async (path: string) => {
        if (path === '/issues/6') {
          return { labels: [{ name: 'CI: Runner Flake' }] };
        }
        if (path === '/issues/6/comments') {
          return [
            comment('CI cancelled due to a runner restart, no link here'),
          ];
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
});
