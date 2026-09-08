import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { Context } from 'aws-lambda';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  githubPost: jest.fn(),
}));

import { dispatchWorkflow } from './dispatch-workflow.js';
import * as githubApi from '../github-api.js';
import { setLambdaContext } from '../lambda-budget.js';

function fakeContext(remainingMs: number): Context {
  return {
    getRemainingTimeInMillis: () => remainingMs,
  } as unknown as Context;
}

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

  it('redirects to ci_list_runs + ci_rerun on a 422 workflow_dispatch-trigger-missing error', async () => {
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
    expect(result.content[0].text).toContain('ci_rerun');
    expect(result.content[0].text).toContain('jira-link-check.yml');
  });

  it('surfaces a 403 (missing actions:write) with the merge-queue workaround hint', async () => {
    mockGithubPost.mockRejectedValue(new Error('GitHub API 403: forbidden'));

    const result = await dispatchWorkflow({ workflow: 'ci.yml' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('actions:write');
    expect(result.content[0].text).not.toContain('ci_rerun');
  });

  describe('display-name resolution (LS-9230)', () => {
    it('resolves a display name to its filename before dispatching, the same way ci_list_runs does', async () => {
      mockGithubGet.mockResolvedValue({
        total_count: 1,
        workflows: [
          {
            id: 123,
            name: 'Legacy Sports CI Orchestrator',
            path: '.github/workflows/ci-orchestrator.yml',
          },
        ],
      });
      mockGithubPost.mockResolvedValue(undefined);

      const result = await dispatchWorkflow({
        workflow: 'Legacy Sports CI Orchestrator',
        ref: 'my-branch',
      });

      expect(mockGithubPost).toHaveBeenCalledWith(
        '/actions/workflows/ci-orchestrator.yml/dispatches',
        { ref: 'my-branch' },
      );
      expect(result.isError).toBeUndefined();
    });

    it('surfaces the resolver "no workflow found" error without ever calling dispatch', async () => {
      mockGithubGet.mockResolvedValue({
        total_count: 1,
        workflows: [
          {
            id: 1,
            name: 'Some Other Workflow',
            path: '.github/workflows/other.yml',
          },
        ],
      });

      const result = await dispatchWorkflow({
        workflow: 'Totally Unknown Workflow',
        ref: 'my-branch',
      });

      expect(mockGithubPost).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No workflow found with name');
    });
  });

  describe('OIDC plan-role main-only workflows (LS-9029)', () => {
    it('fails fast without dispatching when ref is a non-main branch', async () => {
      const result = await dispatchWorkflow({
        workflow: 'check-migrations-applied.yml',
        ref: 'claude/some-feature-branch',
      });

      expect(mockGithubPost).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Refusing to dispatch');
      expect(result.content[0].text).toContain('AssumeRoleWithWebIdentity');
      expect(result.content[0].text).toContain('worktree_commit');
    });

    it('allows dispatch when ref is main', async () => {
      mockGithubPost.mockResolvedValue(undefined);

      const result = await dispatchWorkflow({
        workflow: 'check-migrations-applied.yml',
        ref: 'main',
      });

      expect(mockGithubPost).toHaveBeenCalled();
      expect(result.isError).toBeUndefined();
    });

    it('allows dispatch of workflows not on the gated list to a feature branch', async () => {
      mockGithubPost.mockResolvedValue(undefined);

      const result = await dispatchWorkflow({
        workflow: 'ci.yml',
        ref: 'my-branch',
      });

      expect(mockGithubPost).toHaveBeenCalled();
      expect(result.isError).toBeUndefined();
    });
  });

  it('surfaces other errors without throwing', async () => {
    mockGithubPost.mockRejectedValue(new Error('GitHub API 500: oops'));

    const result = await dispatchWorkflow({ workflow: 'ci.yml' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Failed to dispatch workflow "ci.yml"',
    );
  });

  describe('Lambda-remaining-time clamping (LS-8429 regression)', () => {
    afterEach(() => {
      setLambdaContext(undefined);
    });

    it('gives up locating the run once the Lambda-derived deadline passes, even before FIND_RUN_MAX_ATTEMPTS is reached', async () => {
      mockGithubPost.mockResolvedValue(undefined);
      mockGithubGet.mockResolvedValue({ workflow_runs: [] });
      // 9s left minus the 5s response margin -> a 4s effective budget, too
      // short for even one 3s FIND_RUN_POLL_INTERVAL_MS retry after the
      // first attempt. Without deadline-awareness in findNewRun this would
      // still burn through all 4 attempts (~9s) regardless of how little
      // Lambda time was actually left -- reproducing the SIGKILL.
      setLambdaContext(fakeContext(9_000));

      jest.useFakeTimers();
      const resultPromise = dispatchWorkflow({
        workflow: 'ci.yml',
        ref: 'my-branch',
        waitForCompletion: true,
      });
      await jest.runAllTimersAsync();
      const result = await resultPromise;
      jest.useRealTimers();

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Could not locate the triggered run',
      );
      expect(mockGithubGet.mock.calls.length).toBeLessThan(4);
    });
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
      mockGithubGet.mockImplementation((path: string) => {
        if (path.includes('/workflows/')) {
          return Promise.resolve(
            findRunResponse({
              id: runId,
              status: 'in_progress',
              conclusion: null,
            }),
          );
        }
        pollCount++;
        return Promise.resolve({
          id: runId,
          status: pollCount >= 2 ? 'completed' : 'in_progress',
          conclusion: pollCount >= 2 ? 'success' : null,
          html_url: `https://github.com/bkrupa/legacy-sports/actions/runs/${runId}`,
          run_number: 9,
        });
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
      mockGithubGet.mockImplementation((path: string) => {
        if (path.includes('/workflows/')) {
          return Promise.resolve(
            findRunResponse({
              id: runId,
              status: 'in_progress',
              conclusion: null,
            }),
          );
        }
        return Promise.resolve({
          id: runId,
          status: 'in_progress',
          conclusion: null,
          html_url: `https://github.com/bkrupa/legacy-sports/actions/runs/${runId}`,
          run_number: 3,
        });
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
