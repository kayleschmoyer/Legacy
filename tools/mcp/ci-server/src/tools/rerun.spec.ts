import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubPost: jest.fn(),
}));

import { rerun } from './rerun.js';
import * as githubApi from '../github-api.js';

const mockGithubPost = githubApi.githubPost as jest.MockedFunction<
  typeof githubApi.githubPost
>;

describe('rerun', () => {
  beforeEach(() => {
    mockGithubPost.mockReset();
    mockGithubPost.mockResolvedValue(undefined);
  });

  describe('ci_rerun_failed_jobs contract (failedOnly: true)', () => {
    it('calls rerun-failed-jobs endpoint with a valid runId', async () => {
      await rerun({ runId: 123, failedOnly: true });

      expect(mockGithubPost).toHaveBeenCalledWith(
        '/actions/runs/123/rerun-failed-jobs',
        undefined,
      );
    });

    it('passes enable_debug_logging when debug is true', async () => {
      await rerun({ runId: 456, failedOnly: true, debug: true });

      expect(mockGithubPost).toHaveBeenCalledWith(
        '/actions/runs/456/rerun-failed-jobs',
        { enable_debug_logging: true },
      );
    });

    it('returns scope: failed-jobs in success response', async () => {
      const result = await rerun({ runId: 123, failedOnly: true });

      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as {
        scope: string;
        runId: number;
      };
      expect(payload.scope).toBe('failed-jobs');
      expect(payload.runId).toBe(123);
    });
  });

  describe('validation', () => {
    it('returns an error for a non-positive runId', async () => {
      const result = await rerun({ runId: -1, failedOnly: true });

      expect(result.isError).toBe(true);
    });
  });
});
