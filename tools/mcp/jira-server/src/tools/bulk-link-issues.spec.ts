import { bulkLinkIssues } from './bulk-link-issues';

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

beforeEach(() => {
  jest.clearAllMocks();
  mockJiraRequest.mockResolvedValue(undefined);
});

describe('bulkLinkIssues', () => {
  it('preserves the per-link param swap so each link reads "inwardKey is blocked by outwardKey"', async () => {
    await bulkLinkIssues({
      links: [
        { inwardKey: 'LS-100', outwardKey: 'LS-200', linkType: 'Blocks' },
        { inwardKey: 'LS-300', outwardKey: 'LS-400', linkType: 'Relates' },
      ],
    });

    expect(mockJiraRequest).toHaveBeenCalledTimes(2);
    const bodies = mockJiraRequest.mock.calls.map(
      ([c]) => (c as { body: LinkBody }).body,
    );
    expect(bodies[0]).toEqual({
      type: { name: 'Blocks' },
      inwardIssue: { key: 'LS-200' },
      outwardIssue: { key: 'LS-100' },
    });
    expect(bodies[1]).toEqual({
      type: { name: 'Relates' },
      inwardIssue: { key: 'LS-400' },
      outwardIssue: { key: 'LS-300' },
    });
  });

  it('records self-link attempts as failures without calling Jira', async () => {
    const result = await bulkLinkIssues({
      links: [
        { inwardKey: 'LS-1', outwardKey: 'LS-1', linkType: 'Blocks' },
        { inwardKey: 'LS-2', outwardKey: 'LS-3', linkType: 'Blocks' },
      ],
    });

    expect(mockJiraRequest).toHaveBeenCalledTimes(1);
    const parsed = parseResult(result);
    expect(parsed.failed[0].error).toMatch(/Cannot link an issue to itself/);
    expect(parsed.succeeded).toHaveLength(1);
  });

  it('reports partial failure when a single Jira call rejects', async () => {
    mockJiraRequest.mockImplementationOnce(() => undefined);
    mockJiraRequest.mockImplementationOnce(() =>
      Promise.reject(new Error('403 Forbidden')),
    );

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
