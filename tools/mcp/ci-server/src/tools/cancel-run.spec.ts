import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
  githubPost: jest.fn(),
}));

import { cancelRun } from './cancel-run.js';
import * as githubApi from '../github-api.js';

const mockGithubGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string) => Promise<unknown>
>;
const mockGithubPost = githubApi.githubPost as unknown as jest.MockedFunction<
  (path: string, body?: unknown) => Promise<unknown>
>;

describe('cancelRun', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
    mockGithubPost.mockReset();
  });

  it('posts the cancel endpoint then re-fetches to report the actual status', async () => {
    mockGithubPost.mockResolvedValue(undefined);
    mockGithubGet.mockResolvedValue({
      id: 123,
      status: 'cancel_in_progress',
      conclusion: null,
    });

    const result = await cancelRun({ runId: 123 });

    expect(mockGithubPost).toHaveBeenCalledWith('/actions/runs/123/cancel');
    expect(mockGithubGet).toHaveBeenCalledWith('/actions/runs/123');
    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text) as {
      runId: number;
      status: string;
      conclusion: string | null;
    };
    expect(payload.runId).toBe(123);
    expect(payload.status).toBe('cancel_in_progress');
    expect(payload.conclusion).toBeNull();
  });

  it('surfaces a 409 (already completed) as a clear, non-crashing error', async () => {
    mockGithubPost.mockRejectedValue(
      new Error('GitHub API 409: Conflict — run already completed'),
    );

    const result = await cancelRun({ runId: 456 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/already completed/i);
    expect(mockGithubGet).not.toHaveBeenCalled();
  });

  it('surfaces a non-409 error without throwing', async () => {
    mockGithubPost.mockRejectedValue(new Error('GitHub API 403: forbidden'));

    const result = await cancelRun({ runId: 789 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Failed to cancel workflow run 789',
    );
    expect(mockGithubGet).not.toHaveBeenCalled();
  });

  it('rejects a non-positive runId before any network call', async () => {
    const result = await cancelRun({ runId: -1 });

    expect(result.isError).toBe(true);
    expect(mockGithubPost).not.toHaveBeenCalled();
    expect(mockGithubGet).not.toHaveBeenCalled();
  });

  it('rejects a non-integer runId before any network call', async () => {
    const result = await cancelRun({ runId: 1.5 });

    expect(result.isError).toBe(true);
    expect(mockGithubPost).not.toHaveBeenCalled();
  });
});
