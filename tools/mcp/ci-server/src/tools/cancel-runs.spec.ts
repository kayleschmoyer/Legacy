import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  githubPost: jest.fn(),
}));

import { cancelRuns } from './cancel-runs.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, qs?: Record<string, string>) => Promise<unknown>
>;
const mockGithubPost = githubApi.githubPost as unknown as jest.MockedFunction<
  (path: string, body?: unknown) => Promise<unknown>
>;

interface BatchPayload {
  success: boolean;
  total: number;
  succeeded: Array<{ index: number; runId: number; status: string }>;
  failed: Array<{ index: number; runId?: number; error: string }>;
  message?: string;
}

function parse(text: string): BatchPayload {
  return JSON.parse(text) as BatchPayload;
}

function mockRun(id: number, status: string) {
  return { id, status };
}

describe('cancelRuns', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubPost.mockReset();
  });

  it('cancels only the non-completed runs for the workflow+branch', async () => {
    mockGithubGet.mockImplementation((path: string) => {
      if (path === '/actions/workflows/test.yml/runs') {
        return Promise.resolve({
          total_count: 3,
          workflow_runs: [
            mockRun(101, 'in_progress'),
            mockRun(102, 'completed'),
            mockRun(103, 'queued'),
          ],
        });
      }
      // Re-fetch after cancel (cancelRun's follow-up GET)
      const runId = Number(path.split('/').pop());
      return Promise.resolve({
        id: runId,
        status: 'cancel_in_progress',
        conclusion: null,
      });
    });
    mockGithubPost.mockResolvedValue(undefined);

    const result = await cancelRuns({ workflow: 'test.yml', branch: 'main' });

    expect(mockGithubGet).toHaveBeenCalledWith(
      '/actions/workflows/test.yml/runs',
      { branch: 'main', per_page: '100' },
    );
    expect(result.isError).toBeUndefined();
    const payload = parse(result.content[0].text);
    expect(payload.total).toBe(2);
    expect(payload.succeeded.map((s) => s.runId).sort()).toEqual([101, 103]);
    expect(mockGithubPost).toHaveBeenCalledWith('/actions/runs/101/cancel');
    expect(mockGithubPost).toHaveBeenCalledWith('/actions/runs/103/cancel');
    expect(mockGithubPost).not.toHaveBeenCalledWith('/actions/runs/102/cancel');
  });

  it('returns total: 0 with no failure when no in-flight runs are found', async () => {
    mockGithubGet.mockResolvedValue({
      total_count: 1,
      workflow_runs: [mockRun(201, 'completed')],
    });

    const result = await cancelRuns({ workflow: 'test.yml', branch: 'main' });

    expect(result.isError).toBeUndefined();
    const payload = parse(result.content[0].text);
    expect(payload.total).toBe(0);
    expect(payload.succeeded).toHaveLength(0);
    expect(payload.failed).toHaveLength(0);
    expect(payload.message).toMatch(/No in-flight runs/);
    expect(mockGithubPost).not.toHaveBeenCalled();
  });

  it('isolates a single run cancel failure without failing the whole call', async () => {
    mockGithubGet.mockImplementation((path: string) => {
      if (path === '/actions/workflows/test.yml/runs') {
        return Promise.resolve({
          total_count: 2,
          workflow_runs: [
            mockRun(301, 'in_progress'),
            mockRun(302, 'in_progress'),
          ],
        });
      }
      const runId = Number(path.split('/').pop());
      return Promise.resolve({
        id: runId,
        status: 'cancel_in_progress',
        conclusion: null,
      });
    });
    mockGithubPost.mockImplementation((path: string) => {
      if (path.includes('/302/')) {
        return Promise.reject(new Error('GitHub API 409: already completed'));
      }
      return Promise.resolve(undefined);
    });

    const result = await cancelRuns({ workflow: 'test.yml', branch: 'main' });

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.total).toBe(2);
    expect(payload.succeeded).toHaveLength(1);
    expect(payload.failed).toHaveLength(1);
    expect(payload.failed[0].runId).toBe(302);
  });

  it('surfaces a workflow-list failure as a clear whole-call error', async () => {
    mockGithubGet.mockRejectedValue(new Error('GitHub API 404: not found'));

    const result = await cancelRuns({ workflow: 'test.yml', branch: 'main' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to list runs');
    expect(mockGithubPost).not.toHaveBeenCalled();
  });
});
