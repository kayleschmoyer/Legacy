import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

import { viewRunBatch } from './view-run-batch.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string, qs?: Record<string, string>) => Promise<unknown>
>;

interface BatchPayload {
  success: boolean;
  total: number;
  succeeded: Array<{ index: number; databaseId: number; status: string }>;
  failed: Array<{ index: number; runId?: number; error: string }>;
  error?: string;
}

function parse(text: string): BatchPayload {
  return JSON.parse(text) as BatchPayload;
}

function mockRun(runId: number) {
  return {
    id: runId,
    run_number: 1,
    run_attempt: 1,
    conclusion: 'success',
    created_at: '2026-06-20T00:00:00Z',
    display_title: `run ${runId}`,
    event: 'push',
    head_branch: 'main',
    head_sha: 'abc',
    name: 'CI',
    status: 'completed',
    updated_at: '2026-06-20T00:10:00Z',
    html_url: `https://github.com/x/y/actions/runs/${runId}`,
    workflow_id: 1,
  };
}

describe('viewRunBatch', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  it('inspects every run and reports them under succeeded', async () => {
    // includeJobs defaults to true, so each run triggers a run fetch + jobs fetch.
    mockGithubGet.mockImplementation((path: string) => {
      if (path.endsWith('/jobs')) {
        return Promise.resolve({ total_count: 0, jobs: [] });
      }
      const runId = Number(path.split('/').pop());
      return Promise.resolve(mockRun(runId));
    });

    const result = await viewRunBatch({ runIds: [101, 102] });

    expect(result.isError).toBeUndefined();
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.total).toBe(2);
    expect(payload.succeeded).toHaveLength(2);
    expect(payload.succeeded.map((s) => s.databaseId).sort()).toEqual([
      101, 102,
    ]);
  });

  it('isolates a single run failure without failing the whole call', async () => {
    mockGithubGet.mockImplementation((path: string) => {
      if (path.includes('/202')) {
        return Promise.reject(new Error('GitHub API 404: not found'));
      }
      if (path.endsWith('/jobs')) {
        return Promise.resolve({ total_count: 0, jobs: [] });
      }
      const runId = Number(path.split('/').pop());
      return Promise.resolve(mockRun(runId));
    });

    const result = await viewRunBatch({
      runIds: [201, 202],
      includeJobs: true,
    });

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.total).toBe(2);
    expect(payload.succeeded).toHaveLength(1);
    expect(payload.failed).toHaveLength(1);
    expect(payload.failed[0].runId).toBe(202);
    expect(payload.failed[0].error).toContain('202');
  });

  it('skips job fetches when includeJobs is false', async () => {
    mockGithubGet.mockImplementation((path: string) => {
      const runId = Number(path.split('/').pop());
      return Promise.resolve(mockRun(runId));
    });

    await viewRunBatch({ runIds: [301], includeJobs: false });

    expect(mockGithubGet).toHaveBeenCalledTimes(1);
    expect(mockGithubGet).toHaveBeenCalledWith('/actions/runs/301');
  });

  it('rejects an over-limit batch before doing any work', async () => {
    const runIds = Array.from({ length: 51 }, (_, i) => i + 1);

    const result = await viewRunBatch({ runIds });

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Too many items \(51\)/);
    expect(mockGithubGet).not.toHaveBeenCalled();
  });
});
