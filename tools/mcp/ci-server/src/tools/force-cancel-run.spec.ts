import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  githubPost: jest.fn(),
}));

import { forceCancelRun } from './force-cancel-run.js';
import * as githubApi from '../github-api.js';

const mockGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string) => Promise<unknown>
>;
const mockPost = githubApi.githubPost as unknown as jest.MockedFunction<
  (path: string, body?: unknown) => Promise<unknown>
>;

function parseBody(text: string): Record<string, unknown> {
  return JSON.parse(text) as Record<string, unknown>;
}

describe('forceCancelRun', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('rejects a non-positive runId before any network call', async () => {
    const result = await forceCancelRun({
      runId: -1,
      confirmNormalCancelFailed: true,
    });

    expect(result.isError).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('refuses to run without confirmNormalCancelFailed', async () => {
    const result = await forceCancelRun({ runId: 123 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/confirmNormalCancelFailed/);
    expect(result.content[0].text).toMatch(/ci_cancel_run/);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('refuses to run when confirmNormalCancelFailed is explicitly false', async () => {
    const result = await forceCancelRun({
      runId: 123,
      confirmNormalCancelFailed: false,
    });

    expect(result.isError).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('short-circuits when the run has already completed', async () => {
    mockGet.mockResolvedValueOnce({
      id: 1,
      status: 'completed',
      conclusion: 'success',
    });

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    const payload = parseBody(result.content[0].text);
    expect(payload.status).toBe('already-completed');
    expect(payload.conclusion).toBe('success');
  });

  it('force-cancels and confirms the run actually terminated', async () => {
    mockGet
      .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null })
      .mockResolvedValueOnce({
        id: 1,
        status: 'completed',
        conclusion: 'cancelled',
      });
    mockPost.mockResolvedValueOnce(undefined);

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
    });

    expect(mockPost).toHaveBeenCalledWith('/actions/runs/1/force-cancel');
    expect(result.isError).toBeUndefined();
    const payload = parseBody(result.content[0].text);
    expect(payload.status).toBe('terminated');
    expect(payload.conclusion).toBe('cancelled');
  });

  it('reports completed-otherwise when the run finished on its own without being cancelled', async () => {
    mockGet
      .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null })
      .mockResolvedValueOnce({
        id: 1,
        status: 'completed',
        conclusion: 'success',
      });
    mockPost.mockResolvedValueOnce(undefined);

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
    });

    const payload = parseBody(result.content[0].text);
    expect(payload.status).toBe('completed-otherwise');
    expect(payload.conclusion).toBe('success');
  });

  it('reports "cancelling" (never a false success) when the poll budget is spent before the run terminates', async () => {
    mockGet
      .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null })
      .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null });
    mockPost.mockResolvedValueOnce(undefined);

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
      maxWaitSeconds: 0,
    });

    expect(result.isError).toBeUndefined();
    const payload = parseBody(result.content[0].text);
    expect(payload.status).toBe('cancelling');
    expect(payload.hint).toMatch(/confirmNormalCancelFailed/);
  });

  it('surfaces a 409 (already completed) from the force-cancel POST as a clear error', async () => {
    mockGet.mockResolvedValueOnce({
      id: 1,
      status: 'queued',
      conclusion: null,
    });
    mockPost.mockRejectedValueOnce(
      new Error('GitHub API 409: Conflict — run already completed'),
    );

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/already completed/i);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('surfaces a non-409 force-cancel POST error without throwing', async () => {
    mockGet.mockResolvedValueOnce({
      id: 1,
      status: 'queued',
      conclusion: null,
    });
    mockPost.mockRejectedValueOnce(new Error('GitHub API 403: forbidden'));

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Force-cancel request failed for run 1',
    );
  });

  it('confirms actual termination of a wedged run across multiple poll iterations (LS-9710 incident shape)', async () => {
    // Simulates the real incident this ticket fixes: a job queued for a
    // self-hosted runner that has already shut down stays "queued" through
    // several poll iterations even after force-cancel is accepted, then
    // finally reports terminated once GitHub actually evicts it — proving
    // the tool confirms termination via polling rather than trusting the
    // POST response, and doesn't stop polling after just one re-fetch.
    jest.useFakeTimers();
    try {
      mockGet
        .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null }) // pre-flight check
        .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null }) // poll #1
        .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null }) // poll #2
        .mockResolvedValueOnce({
          id: 1,
          status: 'completed',
          conclusion: 'cancelled',
        }); // poll #3
      mockPost.mockResolvedValueOnce(undefined);

      const resultPromise = forceCancelRun({
        runId: 1,
        confirmNormalCancelFailed: true,
        maxWaitSeconds: 20,
      });

      await jest.advanceTimersByTimeAsync(3000);
      await jest.advanceTimersByTimeAsync(3000);

      const result = await resultPromise;

      expect(mockGet).toHaveBeenCalledTimes(4);
      expect(result.isError).toBeUndefined();
      const payload = parseBody(result.content[0].text);
      expect(payload.status).toBe('terminated');
      expect(payload.conclusion).toBe('cancelled');
    } finally {
      jest.useRealTimers();
    }
  });

  it('surfaces a polling failure after force-cancel without throwing', async () => {
    mockGet
      .mockResolvedValueOnce({ id: 1, status: 'queued', conclusion: null })
      .mockRejectedValueOnce(
        new Error('GitHub API 500: Internal Server Error'),
      );
    mockPost.mockResolvedValueOnce(undefined);

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/confirming its termination failed/);
    expect(result.content[0].text).toMatch(/GitHub API 500/);
  });

  it('surfaces a lookup failure before force-cancelling without throwing', async () => {
    mockGet.mockRejectedValueOnce(new Error('GitHub API 404: Not Found'));

    const result = await forceCancelRun({
      runId: 1,
      confirmNormalCancelFailed: true,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/before force-cancelling/);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
