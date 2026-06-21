import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubPost: jest.fn(),
}));

import { rerunBatch } from './rerun-batch.js';
import * as githubApi from '../github-api.js';

const mockGithubPost = githubApi.githubPost as unknown as jest.MockedFunction<
  (path: string, body?: unknown) => Promise<unknown>
>;

interface BatchPayload {
  success: boolean;
  total: number;
  succeeded: Array<{ index: number; runId: number; scope: string }>;
  failed: Array<{ index: number; runId?: number; error: string }>;
  error?: string;
}

function parse(text: string): BatchPayload {
  return JSON.parse(text) as BatchPayload;
}

describe('rerunBatch', () => {
  beforeEach(() => {
    mockGithubPost.mockReset();
    mockGithubPost.mockResolvedValue(undefined);
  });

  it('reruns every run and reports them under succeeded', async () => {
    const result = await rerunBatch({ runIds: [101, 102, 103] });

    expect(result.isError).toBeUndefined();
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.total).toBe(3);
    expect(payload.succeeded).toHaveLength(3);
    expect(payload.failed).toHaveLength(0);
    // Each succeeded item carries its input index + runId for mapping back.
    expect(payload.succeeded.map((s) => s.runId).sort()).toEqual([
      101, 102, 103,
    ]);
    expect(mockGithubPost).toHaveBeenCalledWith(
      '/actions/runs/101/rerun-failed-jobs',
      undefined,
    );
  });

  it('isolates a single run failure without failing the whole call', async () => {
    mockGithubPost.mockImplementation((path: string) => {
      if (path.includes('/202/')) {
        return Promise.reject(new Error('GitHub API 403: forbidden'));
      }
      return Promise.resolve(undefined);
    });

    const result = await rerunBatch({ runIds: [201, 202, 203] });

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.total).toBe(3);
    expect(payload.succeeded).toHaveLength(2);
    expect(payload.failed).toHaveLength(1);
    expect(payload.failed[0].runId).toBe(202);
    expect(payload.failed[0].index).toBe(1);
    expect(payload.failed[0].error).toContain('202');
  });

  it('passes failedOnly: false through to rerun the entire run', async () => {
    await rerunBatch({ runIds: [301], failedOnly: false });

    expect(mockGithubPost).toHaveBeenCalledWith(
      '/actions/runs/301/rerun',
      undefined,
    );
  });

  it('rejects an empty array with a whole-call error', async () => {
    const result = await rerunBatch({ runIds: [] });

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/empty/i);
    expect(mockGithubPost).not.toHaveBeenCalled();
  });

  it('classifies a non-JSON success body as a per-item failure (consistent succeeded shape)', async () => {
    // Force the rerun() success path to return non-JSON text by making it call
    // the rerun-failed-jobs endpoint successfully, then patch the JSON.stringify
    // output indirectly via a custom runOne shape. The simplest way to drive
    // the catch path is to wrap runBatch directly — but here we trigger it
    // through rerunBatch by stubbing githubPost to succeed and then monkey-
    // patching JSON.parse for this single call. We mock rerun's content
    // instead: jest.isolateModules + a one-off mock of ../batch's runBatch is
    // overkill. Easiest: call runBatch directly with a runOne that returns a
    // plain-text success body.
    const { runBatch } = await import('../batch.js');
    const result = await runBatch([7], () =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: 'not json' }],
      }),
    );

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.succeeded).toHaveLength(0);
    expect(payload.failed).toHaveLength(1);
    expect(payload.failed[0].runId).toBe(7);
    expect(payload.failed[0].error).toMatch(/Unexpected non-JSON response/);
  });

  it('rejects an over-limit batch before doing any work', async () => {
    const runIds = Array.from({ length: 51 }, (_, i) => i + 1);

    const result = await rerunBatch({ runIds });

    expect(result.isError).toBe(true);
    const payload = parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Too many items \(51\)/);
    expect(mockGithubPost).not.toHaveBeenCalled();
  });
});
