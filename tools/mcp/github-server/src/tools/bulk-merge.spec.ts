jest.mock('../github-api', () => ({ githubRest: jest.fn() }));
jest.mock('../auth', () => ({ getRepoOwnerName: jest.fn() }));
jest.mock('./manage-labels', () => ({ fetchPrLabels: jest.fn() }));

import { bulkMerge } from './bulk-merge';
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

interface BulkMergeResultBody {
  succeeded: Array<Record<string, unknown>>;
  failed: Array<Record<string, unknown>>;
}

function parse(result: {
  content: Array<{ type: string; text: string }>;
}): BulkMergeResultBody {
  return JSON.parse(result.content[0].text) as BulkMergeResultBody;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.mockResolvedValue({ owner: 'o', name: 'r' });
});

describe('bulkMerge — queue strategy', () => {
  it('applies the merge-when-ready label and reports success only after verifying it took', async () => {
    mockRest.mockResolvedValueOnce(undefined); // POST labels
    mockFetchPrLabels.mockResolvedValueOnce([
      'bot:ready-for-review',
      'merge-when-ready',
    ]);

    const result = await bulkMerge({ items: [{ number: 7525 }] });

    expect(result.isError).toBeUndefined();
    expect(mockRest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/repos/o/r/issues/7525/labels',
        body: { labels: ['merge-when-ready'] },
      }),
    );
    const body = parse(result);
    expect(body.succeeded[0]).toMatchObject({
      number: 7525,
      strategy: 'queue',
    });
    expect(body.succeeded[0].message).toContain('merge-when-ready');
  });

  it('reports a per-item failure (not a whole-batch throw) when the label was applied but is not actually present afterward (LS-9851/LS-9947 repro)', async () => {
    mockRest.mockResolvedValueOnce(undefined); // POST labels "succeeds"
    mockFetchPrLabels.mockResolvedValueOnce(['bot:ready-for-review']); // but the label never took

    const result = await bulkMerge({ items: [{ number: 7525 }] });

    expect(result.isError).toBe(true);
    const body = parse(result);
    expect(body.succeeded).toEqual([]);
    expect(body.failed[0]).toMatchObject({ index: 0, key: 7525 });
    expect(body.failed[0].error).toContain('did not take effect');
    expect(body.failed[0].error).toContain('strategy: "direct"');
  });

  it('reports PR-not-found as a per-item failure on a 404 from the label POST', async () => {
    mockRest.mockRejectedValueOnce(new Error('Not Found (404)'));

    const result = await bulkMerge({ items: [{ number: 999 }] });

    expect(result.isError).toBe(true);
    const body = parse(result);
    expect(body.failed).toEqual([
      { index: 0, key: 999, error: 'PR #999 not found.' },
    ]);
    expect(mockFetchPrLabels).not.toHaveBeenCalled();
  });

  it('processes a mixed batch, isolating one item verification failure from the rest', async () => {
    mockRest
      .mockResolvedValueOnce(undefined) // PR 1: POST labels
      .mockResolvedValueOnce(undefined); // PR 2: POST labels
    mockFetchPrLabels
      .mockResolvedValueOnce(['merge-when-ready']) // PR 1: took
      .mockResolvedValueOnce([]); // PR 2: did not take

    const result = await bulkMerge({ items: [{ number: 1 }, { number: 2 }] });

    expect(result.isError).toBe(true);
    const body = parse(result);
    expect(body.succeeded).toHaveLength(1);
    expect(body.succeeded[0]).toMatchObject({ number: 1, strategy: 'queue' });
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]).toMatchObject({ index: 1, key: 2 });
  });
});

describe('bulkMerge — direct strategy', () => {
  it('calls REST merge for direct strategy', async () => {
    mockRest.mockResolvedValueOnce({
      sha: 'abc',
      merged: true,
      message: 'merged',
    });

    const result = await bulkMerge({
      items: [{ number: 7, strategy: 'direct' }],
    });

    expect(result.isError).toBeUndefined();
    expect(mockRest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        path: '/repos/o/r/pulls/7/merge',
      }),
    );
    const body = parse(result);
    expect(body.succeeded[0]).toMatchObject({
      number: 7,
      strategy: 'direct',
      sha: 'abc',
      merged: true,
    });
  });
});
