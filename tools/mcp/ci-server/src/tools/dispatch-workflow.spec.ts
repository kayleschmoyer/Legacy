import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  githubPost: jest.fn(),
}));

import { dispatchWorkflow } from './dispatch-workflow.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, query?: Record<string, string>) => Promise<unknown>
>;
const mockGithubPost = githubApi.githubPost as unknown as jest.MockedFunction<
  (path: string, body?: unknown) => Promise<unknown>
>;

describe('dispatchWorkflow', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubPost.mockReset();
  });

  it('dispatches without waiting when waitForCompletion is unset', async () => {
    mockGithubPost.mockResolvedValue(undefined);

    const result = await dispatchWorkflow({
      workflow: 'ci.yml',
      ref: 'my-branch',
    });

    expect(mockGithubPost).toHaveBeenCalledWith(
      '/actions/workflows/ci.yml/dispatches',
      { ref: 'my-branch' },
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Workflow dispatch requested');
  });

  it('redirects to ci_list_runs + ci_rerun_failed_jobs on a 422 workflow_dispatch-trigger-missing error', async () => {
    mockGithubPost.mockRejectedValue(
      new Error(
        'GitHub API 422: {"message":"Workflow does not have \'workflow_dispatch\' trigger"}',
      ),
    );

    const result = await dispatchWorkflow({
      workflow: 'jira-link-check.yml',
      ref: 'my-branch',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no 'workflow_dispatch' trigger");
    expect(result.content[0].text).toContain('ci_list_runs');
    expect(result.content[0].text).toContain('ci_rerun_failed_jobs');
    expect(result.content[0].text).toContain('jira-link-check.yml');
  });

  it('surfaces a 403 (missing actions:write) with the merge-queue workaround hint', async () => {
    mockGithubPost.mockRejectedValue(new Error('GitHub API 403: forbidden'));

    const result = await dispatchWorkflow({ workflow: 'ci.yml' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('actions:write');
    expect(result.content[0].text).not.toContain('ci_rerun_failed_jobs');
  });

  it('surfaces other errors without throwing', async () => {
    mockGithubPost.mockRejectedValue(new Error('GitHub API 500: oops'));

    const result = await dispatchWorkflow({ workflow: 'ci.yml' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Failed to dispatch workflow "ci.yml"',
    );
  });

  describe('waitForCompletion: true (LS-8429)', () => {
    function findRunResponse(run: {
      id: number;
      status: string;
      conclusion: string | null;
    }) {
      return {
        workflow_runs: [
          {
            ...run,
            created_at: new Date().toISOString(),
            html_url: `https://github.com/bkrupa/legacy-sports/actions/runs/${run.id}`,
            run_number: 9,
            event: 'workflow_dispatch',
            head_branch: 'my-branch',
          },
        ],
      };
    }

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns the conclusion when the run completes within the bounded wait', async () => {
      mockGithubPost.mockResolvedValue(undefined);
      const runId = 555;
      let pollCount = 0;
      mockGithubGet.mockImplementation(async (path: string) => {
        if (path.includes('/workflows/')) {
          return findRunResponse({
            id: runId,
            status: 'in_progress',
            conclusion: null,
          });
        }
        pollCount++;
        return {
          id: runId,
          status: pollCount >= 2 ? 'completed' : 'in_progress',
          conclusion: pollCount >= 2 ? 'success' : null,
          html_url: `https://github.com/bkrupa/legacy-sports/actions/runs/${runId}`,
          run_number: 9,
        };
      });

      jest.useFakeTimers();
      const resultPromise = dispatchWorkflow({
        workflow: 'ci.yml',
        ref: 'my-branch',
        waitForCompletion: true,
      });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      const body = JSON.parse(result.content[0].text) as {
        status: string;
        conclusion: string;
        runId: number;
      };
      expect(body.status).toBe('completed');
      expect(body.conclusion).toBe('success');
      expect(body.runId).toBe(runId);
    });

    it('returns a bounded in_progress snapshot with a re-arm hint instead of blocking past the Lambda timeout when the run never finishes', async () => {
      mockGithubPost.mockResolvedValue(undefined);
      const runId = 777;
      mockGithubGet.mockImplementation(async (path: string) => {
        if (path.includes('/workflows/')) {
          return findRunResponse({
            id: runId,
            status: 'in_progress',
            conclusion: null,
          });
        }
        return {
          id: runId,
          status: 'in_progress',
          conclusion: null,
          html_url: `https://github.com/bkrupa/legacy-sports/actions/runs/${runId}`,
          run_number: 3,
        };
      });

      jest.useFakeTimers();
      const resultPromise = dispatchWorkflow({
        workflow: 'ci.yml',
        ref: 'my-branch',
        waitForCompletion: true,
      });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isError).toBeUndefined();
      const body = JSON.parse(result.content[0].text) as {
        status: string;
        runId: number;
        hint: string;
      };
      expect(body.status).toBe('in_progress');
      expect(body.runId).toBe(runId);
      expect(body.hint).toContain(`ci_wait_run({ runId: ${runId} })`);
    });

    it('gives up locating the dispatched run well under the Lambda timeout and points back at ci_list_runs/ci_view_run', async () => {
      mockGithubPost.mockResolvedValue(undefined);
      mockGithubGet.mockResolvedValue({ workflow_runs: [] });

      jest.useFakeTimers();
      const resultPromise = dispatchWorkflow({
        workflow: 'ci.yml',
        ref: 'my-branch',
        waitForCompletion: true,
      });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Could not locate the triggered run',
      );
      expect(result.content[0].text).toContain('ci_list_runs');
      // FIND_RUN_MAX_ATTEMPTS(4) - 1 attempts spaced FIND_RUN_POLL_INTERVAL_MS(3s)
      // apart -> ~9s, comfortably inside the 20s TRANSPORT_SAFE_WAIT_MS budget.
      expect(mockGithubGet).toHaveBeenCalledTimes(4);
    });
  });
});
