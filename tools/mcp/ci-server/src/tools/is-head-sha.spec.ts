import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../github-api.js', () => ({
  githubGet: jest.fn(),
}));

import { isHeadSha } from './is-head-sha.js';
import * as githubApi from '../github-api.js';

const mockGet = githubApi.githubGet as unknown as jest.MockedFunction<
  (path: string) => Promise<unknown>
>;

function textOf(result: Awaited<ReturnType<typeof isHeadSha>>): unknown {
  const [first] = result.content;
  return JSON.parse(first.text);
}

describe('isHeadSha', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('reports isCurrent true and superseded false when the sha matches the PR head', async () => {
    mockGet.mockResolvedValue({ head: { sha: 'abc123' }, state: 'open' });

    const result = await isHeadSha({ prNumber: 42, sha: 'abc123' });

    expect(mockGet).toHaveBeenCalledWith('/pulls/42');
    expect(result.isError).toBeUndefined();
    expect(textOf(result)).toEqual({
      prNumber: 42,
      sha: 'abc123',
      currentHeadSha: 'abc123',
      isCurrent: true,
      superseded: false,
      prState: 'open',
    });
  });

  it('reports isCurrent false and superseded true when the sha has been replaced by a later push', async () => {
    mockGet.mockResolvedValue({ head: { sha: 'def456' }, state: 'open' });

    const result = await isHeadSha({ prNumber: 42, sha: 'abc123' });

    expect(textOf(result)).toEqual({
      prNumber: 42,
      sha: 'abc123',
      currentHeadSha: 'def456',
      isCurrent: false,
      superseded: true,
      prState: 'open',
    });
  });

  it('returns an error result when the API call fails', async () => {
    mockGet.mockRejectedValue(new Error('not found'));

    const result = await isHeadSha({ prNumber: 42, sha: 'abc123' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
