import { linkIssues } from './link-issues';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

describe('linkIssues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJiraRequest.mockResolvedValue(undefined);
  });

  it('swaps inwardKey/outwardKey when forwarding to Jira REST so the link reads "inwardKey is blocked by outwardKey"', async () => {
    // Public contract: inwardKey = blocked, outwardKey = blocker.
    // Jira's REST POST inverts these — `inwardIssue` is the blocker, `outwardIssue` is the blocked.
    // So the body must carry the params swapped from the caller-facing names.
    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-200',
      linkType: 'Blocks',
    });

    expect(mockJiraRequest).toHaveBeenCalledTimes(1);
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
    const data = JSON.parse(
      (result.content[0] as { type: string; text: string }).text,
    );
    expect(data.success).toBe(true);
    expect(data.inwardKey).toBe('LS-100');
    expect(data.outwardKey).toBe('LS-200');
  });

  it('returns an error and does not POST when inwardKey equals outwardKey', async () => {
    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-100',
      linkType: 'Blocks',
    });

    expect(mockJiraRequest).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const data = JSON.parse(
      (result.content[0] as { type: string; text: string }).text,
    );
    expect(data.success).toBe(false);
    expect(data.error).toContain('Cannot link an issue to itself');
  });

  it('returns isError when the Jira REST call fails', async () => {
    mockJiraRequest.mockRejectedValue(new Error('403 Forbidden'));

    const result = await linkIssues({
      inwardKey: 'LS-100',
      outwardKey: 'LS-200',
      linkType: 'Blocks',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(
      (result.content[0] as { type: string; text: string }).text,
    );
    expect(data.success).toBe(false);
    expect(data.error).toContain('403 Forbidden');
  });
});
