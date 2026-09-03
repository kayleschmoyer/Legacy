import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('./github-api.js', () => ({
  githubGet: jest.fn(),
}));

import { checkStaleMergeRef } from './merge-ref-staleness.js';
import * as githubApi from './github-api.js';

const mockGithubGet = githubApi.githubGet as jest.MockedFunction<
  typeof githubApi.githubGet
>;

describe('checkStaleMergeRef', () => {
  beforeEach(() => {
    mockGithubGet.mockReset();
  });

  it('returns null for a non-pull_request-triggered run', async () => {
    mockGithubGet.mockResolvedValueOnce({
      head_sha: 'abc123',
      event: 'push',
      pull_requests: [],
    });

    const result = await checkStaleMergeRef(123);

    expect(result).toBeNull();
    expect(mockGithubGet).toHaveBeenCalledTimes(1);
  });

  it('returns null when the PR is no longer open', async () => {
    mockGithubGet
      .mockResolvedValueOnce({
        head_sha: 'abc123',
        event: 'pull_request',
        pull_requests: [{ number: 7300 }],
      })
      .mockResolvedValueOnce({
        merge_commit_sha: 'def456',
        state: 'closed',
      });

    const result = await checkStaleMergeRef(123);

    expect(result).toBeNull();
  });

  it('returns null when the current merge commit matches the run head_sha', async () => {
    mockGithubGet
      .mockResolvedValueOnce({
        head_sha: 'abc123',
        event: 'pull_request',
        pull_requests: [{ number: 7300 }],
      })
      .mockResolvedValueOnce({
        merge_commit_sha: 'abc123',
        state: 'open',
      });

    const result = await checkStaleMergeRef(123);

    expect(result).toBeNull();
  });

  it('warns when the run head_sha is stale relative to the current merge commit', async () => {
    mockGithubGet
      .mockResolvedValueOnce({
        head_sha: 'abc123def456abc123def456abc123def456abc',
        event: 'pull_request',
        pull_requests: [{ number: 7300 }],
      })
      .mockResolvedValueOnce({
        merge_commit_sha: 'fedcba987654fedcba987654fedcba987654fed',
        state: 'open',
      });

    const result = await checkStaleMergeRef(123);

    expect(result).toMatch(/refs\/pull\/7300\/merge/);
    expect(result).toMatch(/stale/i);
  });

  it('returns null (fail-open) when the lookup throws', async () => {
    mockGithubGet.mockRejectedValueOnce(new Error('network error'));

    const result = await checkStaleMergeRef(123);

    expect(result).toBeNull();
  });
});
