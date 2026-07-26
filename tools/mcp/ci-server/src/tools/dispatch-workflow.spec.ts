import { describe, expect, it, jest, beforeEach } from '@jest/globals';

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
});
