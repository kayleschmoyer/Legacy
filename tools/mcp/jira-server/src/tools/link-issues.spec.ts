import { linkIssues } from './link-issues';
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

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

describe('linkIssues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetLinkTypeCacheForTests();
  });

  it('swaps inwardKey/outwardKey when forwarding to Jira REST so the link reads "inwardKey is blocked by outwardKey"', async () => {
    // Public contract: inwardKey = blocked, outwardKey = blocker.
    // Jira's REST POST inverts these — `inwardIssue` is the blocker, `outwardIssue` is the blocked.
    // So the body must carry the params swapped from the caller-facing names.
    mockJiraRequest.mockImplementation((opts: { method: string }) =>
      Promise.resolve(opts.method === 'GET' ? LINK_TYPES : undefined),
    );

    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-200',
      linkType: 'Blocks',
    });

    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/rest/api/3/issueLink',
      body: {
        type: { name: 'Blocks' },
        inwardIssue: { key: 'LS-200' }, // outwardKey (blocker) → inwardIssue per Jira semantics
        outwardIssue: { key: 'LS-100' }, // inwardKey (blocked) → outwardIssue per Jira semantics
      },
    });

    expect(result.isError).toBeFalsy();
    const data = parse(result);
    expect(data.success).toBe(true);
    expect(data.inwardKey).toBe('LS-100');
    expect(data.outwardKey).toBe('LS-200');
  });

  it('resolves a lowercase/miscased link type to the canonical name before posting', async () => {
    mockJiraRequest.mockImplementation((opts: { method: string }) =>
      opts.method === 'GET'
        ? Promise.resolve(LINK_TYPES)
        : Promise.resolve(undefined),
    );

    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-200',
      linkType: 'blocks',
    });

    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/rest/api/3/issueLink',
      body: {
        type: { name: 'Blocks' },
        inwardIssue: { key: 'LS-200' },
        outwardIssue: { key: 'LS-100' },
      },
    });
    expect(result.isError).toBeFalsy();
    const data = parse(result);
    expect(data.linkType).toBe('Blocks');
  });

  it('returns a helpful error listing available types when the link type cannot be resolved', async () => {
    mockJiraRequest.mockImplementation((opts: { method: string }) =>
      Promise.resolve(opts.method === 'GET' ? LINK_TYPES : undefined),
    );

    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-200',
      linkType: 'completely unrelated type',
    });

    expect(result.isError).toBe(true);
    const data = parse(result);
    expect(data.success).toBe(false);
    expect(data.availableLinkTypes).toEqual(['Blocks', 'Relates']);
    // POST should never have been attempted for an unresolved link type.
    expect(mockJiraRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to forwarding the literal linkType when link-type discovery fails', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET') {
          return Promise.reject(new Error('network error'));
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-200',
      linkType: 'Blocks',
    });

    expect(result.isError).toBeFalsy();
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/rest/api/3/issueLink',
      body: {
        type: { name: 'Blocks' },
        inwardIssue: { key: 'LS-200' },
        outwardIssue: { key: 'LS-100' },
      },
    });
  });

  it('returns an error and does not POST when inwardKey equals outwardKey', async () => {
    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-100',
      linkType: 'Blocks',
    });

    expect(mockJiraRequest).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const data = parse(result);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Cannot link an issue to itself');
  });

  it('returns isError when the Jira REST call fails', async () => {
    mockJiraRequest.mockImplementation((opts: { method: string }) => {
      if (opts.method === 'GET') return Promise.resolve(LINK_TYPES);
      return Promise.reject(new Error('403 Forbidden'));
    });

    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-200',
      linkType: 'Blocks',
    });

    expect(result.isError).toBe(true);
    const data = parse(result);
    expect(data.success).toBe(false);
    expect(data.error).toContain('403 Forbidden');
  });
});
