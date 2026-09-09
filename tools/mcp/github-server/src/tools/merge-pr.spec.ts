jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('./manage-labels', () => ({ fetchPrLabels: jest.fn() }));

import { mergePR } from './merge-pr';
import { fetchPrLabels } from './manage-labels';
import { githubRest } from '../github-api';
import { getRepoOwnerName } from '../auth';

const mockRest = githubRest as jest.MockedFunction<typeof githubRest>;
const mockRepo = getRepoOwnerName as jest.MockedFunction<
  typeof getRepoOwnerName
>;
const mockFetchPrLabels = fetchPrLabels as jest.MockedFunction<
  typeof fetchPrLabels
>;

interface MergeResultBody {
  success?: boolean;
  prNumber?: number;
  strategy?: string;
  output?: string;
  sha?: string;
  merged?: boolean;
}

function parse(result: {
  content: Array<{ type: string; text: string }>;
}): MergeResultBody {
  return JSON.parse(result.content[0].text) as MergeResultBody;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.mockResolvedValue({ owner: 'o', name: 'r' });
});

describe('mergePR — queue strategy', () => {
  it('applies the merge-when-ready label and reports success only after verifying it took', async () => {
    mockRest.mockResolvedValueOnce(undefined); // POST labels
    mockFetchPrLabels.mockResolvedValueOnce([
      'bot:ready-for-review',
      'merge-when-ready',
    ]);

    const result = await mergePR({ number: 7525, strategy: 'queue' });

    expect(result.isError).toBeUndefined();
    expect(mockRest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/repos/o/r/issues/7525/labels',
        body: { labels: ['merge-when-ready'] },
      }),
    );
    const body = parse(result);
    expect(body).toMatchObject({
      success: true,
      prNumber: 7525,
      strategy: 'queue',
    });
    expect(body.output).toContain('merge-when-ready');
  });

  it('does NOT report success when the label was applied but is not actually present afterward (LS-9851 repro)', async () => {
    mockRest.mockResolvedValueOnce(undefined); // POST labels "succeeds"
    mockFetchPrLabels.mockResolvedValueOnce(['bot:ready-for-review']); // but the label never took

    const result = await mergePR({ number: 7525, strategy: 'queue' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('did not take effect');
    expect(result.content[0].text).toContain('strategy: "direct"');
  });

  it('reports PR-not-found on a 404 from the label POST', async () => {
    mockRest.mockRejectedValueOnce(new Error('Not Found (404)'));

    const result = await mergePR({ number: 999, strategy: 'queue' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('PR #999 not found.');
    expect(mockFetchPrLabels).not.toHaveBeenCalled();
  });

  it('surfaces a clear error for a non-404 failure', async () => {
    mockRest.mockRejectedValueOnce(new Error('Server Error (500)'));

    const result = await mergePR({ number: 7525, strategy: 'queue' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Server Error (500)');
  });
});

describe('mergePR — direct strategy', () => {
  it('merges via REST PUT and reports the sha', async () => {
    mockRest.mockResolvedValueOnce({
      sha: 'abc123',
      merged: true,
      message: 'Pull Request successfully merged',
    });

    const result = await mergePR({ number: 7525, strategy: 'direct' });

    expect(result.isError).toBeUndefined();
    expect(mockRest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/repos/o/r/pulls/7525/merge',
      }),
    );
    const body = parse(result);
    expect(body).toMatchObject({
      success: true,
      prNumber: 7525,
      strategy: 'direct',
      sha: 'abc123',
      merged: true,
    });
  });
});
