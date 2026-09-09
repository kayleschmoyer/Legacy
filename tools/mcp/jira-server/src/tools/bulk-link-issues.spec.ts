import { bulkLinkIssues } from './bulk-link-issues';
import { __resetLinkTypeCacheForTests } from './link-types';

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock;
}>('../jira-api');

interface LinkBody {
  type: { name: string };
  inwardIssue: { key: string };
  outwardIssue: { key: string };
}

interface ParsedBulkLinkResult {
  success: boolean;
  total: number;
  succeeded: Array<{ inwardKey: string; outwardKey: string }>;
  failed: Array<{ inwardKey: string; error: string }>;
}

function parseResult(result: {
  content: ReadonlyArray<unknown>;
}): ParsedBulkLinkResult {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text) as ParsedBulkLinkResult;
}

const LINK_TYPES = {
  issueLinkTypes: [
    { id: '10000', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
    {
      id: '10001',
      name: 'Relates',
      inward: 'relates to',
      outward: 'relates to',
    },
  ],
};

/** GET calls (link-type discovery) succeed; every POST is queued in order. */
function mockWithPostQueue(...postResults: Array<unknown>): void {
  let postIndex = 0;
  mockJiraRequest.mockImplementation((opts: { method: string }) => {
    if (opts.method === 'GET') return Promise.resolve(LINK_TYPES);
    const result = postResults[postIndex];
    postIndex += 1;
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetLinkTypeCacheForTests();
});

describe('bulkLinkIssues', () => {
  it('preserves the per-link param swap so each link reads "inwardKey is blocked by outwardKey"', async () => {
    mockWithPostQueue(undefined, undefined);

    await bulkLinkIssues({
      links: [
        { inwardKey: 'LS-100', outwardKey: 'LS-200', linkType: 'Blocks' },
        { inwardKey: 'LS-300', outwardKey: 'LS-400', linkType: 'Relates' },
      ],
    });

    const postCalls = mockJiraRequest.mock.calls.filter(
      ([c]) => (c as { method: string }).method === 'POST',
    );
    expect(postCalls).toHaveLength(2);
    const bodies = postCalls.map(([c]) => (c as { body: LinkBody }).body);
    expect(bodies).toContainEqual({
      type: { name: 'Blocks' },
      inwardIssue: { key: 'LS-200' },
      outwardIssue: { key: 'LS-100' },
    });
    expect(bodies).toContainEqual({
      type: { name: 'Relates' },
      inwardIssue: { key: 'LS-400' },
      outwardIssue: { key: 'LS-300' },
    });
  });

  it('records self-link attempts as failures without calling Jira', async () => {
    mockWithPostQueue(undefined);

    const result = await bulkLinkIssues({
      links: [
        { inwardKey: 'LS-1', outwardKey: 'LS-1', linkType: 'Blocks' },
        { inwardKey: 'LS-2', outwardKey: 'LS-3', linkType: 'Blocks' },
      ],
    });

    const postCalls = mockJiraRequest.mock.calls.filter(
      ([c]) => (c as { method: string }).method === 'POST',
    );
    expect(postCalls).toHaveLength(1);
    const parsed = parseResult(result);
    expect(parsed.failed[0].error).toMatch(/Cannot link an issue to itself/);
    expect(parsed.succeeded).toHaveLength(1);
  });

  it('reports partial failure when a single Jira call rejects', async () => {
    mockWithPostQueue(undefined, new Error('403 Forbidden'));

    const result = await bulkLinkIssues({
      links: [
        { inwardKey: 'LS-1', outwardKey: 'LS-2', linkType: 'Blocks' },
        { inwardKey: 'LS-3', outwardKey: 'LS-4', linkType: 'Blocks' },
      ],
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.succeeded).toHaveLength(1);
    expect(parsed.failed[0].error).toContain('403 Forbidden');
  });

  it('fails only the unresolvable links, listing available types, when a linkType has no match', async () => {
    mockWithPostQueue(undefined);

    const result = await bulkLinkIssues({
      links: [
        { inwardKey: 'LS-1', outwardKey: 'LS-2', linkType: 'Blocks' },
        {
          inwardKey: 'LS-3',
          outwardKey: 'LS-4',
          linkType: 'completely unrelated type',
        },
      ],
    });

    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.succeeded).toHaveLength(1);
    expect(parsed.failed[0].error).toContain('Blocks, Relates');
    const postCalls = mockJiraRequest.mock.calls.filter(
      ([c]) => (c as { method: string }).method === 'POST',
    );
    expect(postCalls).toHaveLength(1);
  });

  it('falls back to forwarding literal linkTypes when link-type discovery fails', async () => {
    mockJiraRequest.mockImplementation((opts: { method: string }) => {
      if (opts.method === 'GET') {
        return Promise.reject(new Error('network error'));
      }
      return Promise.resolve(undefined);
    });

    const result = await bulkLinkIssues({
      links: [{ inwardKey: 'LS-1', outwardKey: 'LS-2', linkType: 'Blocks' }],
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed.succeeded).toHaveLength(1);
  });

  it('caps at 50 links per call', async () => {
    const links = Array.from({ length: 51 }, (_, i) => ({
      inwardKey: `LS-${i + 1}`,
      outwardKey: `LS-${i + 1000}`,
      linkType: 'Blocks',
    }));
    const result = await bulkLinkIssues({ links });
    expect(result.isError).toBe(true);
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });
});
