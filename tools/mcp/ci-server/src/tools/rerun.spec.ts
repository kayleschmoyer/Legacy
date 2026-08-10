import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  postWithRetryOnAlreadyRunning: jest.fn(),
  githubGet: jest.fn(),
}));

import { rerun } from './rerun.js';
import * as githubApi from '../github-api.js';

const mockPostWithRetry =
  githubApi.postWithRetryOnAlreadyRunning as jest.MockedFunction<
    typeof githubApi.postWithRetryOnAlreadyRunning
  >;
const mockGithubGet = githubApi.githubGet as jest.MockedFunction<
  typeof githubApi.githubGet
>;

describe('rerun', () => {
  beforeEach(() => {
    mockPostWithRetry.mockReset();
    mockPostWithRetry.mockResolvedValue(undefined);
    mockGithubGet.mockReset();
    mockGithubGet.mockResolvedValue({ jobs: [] });
  });

  describe('ci_rerun_failed_jobs contract (failedOnly: true)', () => {
    it('calls rerun-failed-jobs endpoint with a valid runId', async () => {
      await rerun({ runId: 123, failedOnly: true });

      expect(mockPostWithRetry).toHaveBeenCalledWith(
        '/actions/runs/123/rerun-failed-jobs',
        undefined,
      );
    });

    it('passes enable_debug_logging when debug is true', async () => {
      await rerun({ runId: 456, failedOnly: true, debug: true });

      expect(mockPostWithRetry).toHaveBeenCalledWith(
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

  describe('cancelled-dependency escalation (LS-9212)', () => {
    it('escalates to a full rerun when the run has a cancelled job', async () => {
      mockGithubGet.mockResolvedValue({
        jobs: [
          { id: 1, conclusion: 'success' },
          { id: 2, conclusion: 'cancelled' },
        ],
      });

      const result = await rerun({ runId: 123, failedOnly: true });

      expect(mockGithubGet).toHaveBeenCalledWith('/actions/runs/123/jobs', {
        per_page: '100',
        filter: 'latest',
      });
      expect(mockPostWithRetry).toHaveBeenCalledWith(
        '/actions/runs/123/rerun',
        undefined,
      );
      expect(mockPostWithRetry).not.toHaveBeenCalledWith(
        '/actions/runs/123/rerun-failed-jobs',
        expect.anything(),
      );

      const payload = JSON.parse(result.content[0].text) as {
        scope: string;
        message: string;
      };
      expect(payload.scope).toBe('run (escalated from failed-jobs)');
      expect(payload.message).toMatch(/Escalated to a full run rerun/);
    });

    it('does not escalate when no jobs are cancelled', async () => {
      mockGithubGet.mockResolvedValue({
        jobs: [
          { id: 1, conclusion: 'failure' },
          { id: 2, conclusion: 'success' },
        ],
      });

      const result = await rerun({ runId: 123, failedOnly: true });

      expect(mockPostWithRetry).toHaveBeenCalledWith(
        '/actions/runs/123/rerun-failed-jobs',
        undefined,
      );
      const payload = JSON.parse(result.content[0].text) as { scope: string };
      expect(payload.scope).toBe('failed-jobs');
    });

    it('falls back to the normal failed-only rerun when the jobs lookup fails', async () => {
      mockGithubGet.mockRejectedValue(new Error('network error'));

      const result = await rerun({ runId: 123, failedOnly: true });

      expect(mockPostWithRetry).toHaveBeenCalledWith(
        '/actions/runs/123/rerun-failed-jobs',
        undefined,
      );
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text) as { scope: string };
      expect(payload.scope).toBe('failed-jobs');
    });

    it('does not check for cancelled jobs on the full-run or job-scoped paths', async () => {
      await rerun({ runId: 123, failedOnly: false });
      await rerun({ runId: 123, jobId: 987 });

      expect(mockGithubGet).not.toHaveBeenCalled();
    });
  });

  describe('ci_rerun full-run and job-scoped paths', () => {
    it('calls the job-scoped rerun endpoint when jobId is set', async () => {
      await rerun({ runId: 123, jobId: 987 });

      expect(mockPostWithRetry).toHaveBeenCalledWith('/actions/jobs/987/rerun');
    });

    it('calls the full-run rerun endpoint when failedOnly is false', async () => {
      await rerun({ runId: 123, failedOnly: false });

      expect(mockPostWithRetry).toHaveBeenCalledWith(
        '/actions/runs/123/rerun',
        undefined,
      );
    });
  });

  describe('validation', () => {
    it('returns an error for a non-positive runId', async () => {
      const result = await rerun({ runId: -1, failedOnly: true });

      expect(result.isError).toBe(true);
    });
  });

  describe('already-running 403 surfaced by the retry wrapper', () => {
    it('surfaces a final "gave up after N attempts" error as a tool error', async () => {
      mockPostWithRetry.mockRejectedValue(
        new Error(
          'GitHub API 403: This workflow is already running. (gave up after 3 attempts waiting for the run to settle)',
        ),
      );

      const result = await rerun({ runId: 123, failedOnly: true });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/gave up after 3 attempts/);
    });

    it('still fails fast on a non-matching 403 (e.g. permissions)', async () => {
      mockPostWithRetry.mockRejectedValue(
        new Error('GitHub API 403: Resource not accessible by integration'),
      );

      const result = await rerun({ runId: 123, failedOnly: true });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(
        /Resource not accessible by integration/,
      );
    });
  });
});
