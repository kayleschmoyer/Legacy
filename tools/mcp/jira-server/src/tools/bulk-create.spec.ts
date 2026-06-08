import { bulkCreate } from './bulk-create';

// Mock the Jira + credential boundaries so the test asserts the exact bulk
// payload without any network or auth.
jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
  getSiteUrl: jest.fn(() => 'https://bkrupa.atlassian.net'),
}));

jest.mock('../netrc', () => ({
  getJiraCredentials: jest.fn(async () => ({ type: 'basic' })),
}));

jest.mock('./get-active-sprint', () => ({
  getActiveSprintId: jest.fn(async () => null),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

interface IssueUpdate {
  fields: { issuetype: { name: string }; summary: string };
}

/** Return the issueUpdates array sent to the bulk create call. */
function issueUpdates(): IssueUpdate[] {
  const call = (
    mockJiraRequest.mock.calls as Array<
      [{ method: string; path: string; body?: { issueUpdates: IssueUpdate[] } }]
    >
  ).find(
    ([opts]) =>
      opts.method === 'POST' && opts.path === '/rest/api/3/issue/bulk',
  );
  if (!call?.[0].body) throw new Error('no bulk create POST call captured');
  return call[0].body.issueUpdates;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJiraRequest.mockImplementation(
    (opts: {
      method: string;
      path: string;
      body?: { issueUpdates: IssueUpdate[] };
    }) => {
      if (opts.method === 'POST' && opts.path === '/rest/api/3/issue/bulk') {
        const n = opts.body?.issueUpdates.length ?? 0;
        return Promise.resolve({
          issues: Array.from({ length: n }, (_, i) => ({
            id: String(100 + i),
            key: `LS-${100 + i}`,
            self: `https://bkrupa.atlassian.net/rest/api/3/issue/${100 + i}`,
          })),
          errors: [],
        });
      }
      return Promise.resolve(undefined);
    },
  );
});

describe('bulkCreate — issuetype mapping (LS-7852)', () => {
  it('maps each ticket type to its issuetype.name, including Epic', async () => {
    await bulkCreate({
      tickets: [
        { summary: 'a', type: 'Task' },
        { summary: 'b', type: 'Bug' },
        { summary: 'c', type: 'Story' },
        { summary: 'd', type: 'Epic' },
      ],
    });

    expect(issueUpdates().map((u) => u.fields.issuetype.name)).toEqual([
      'Task',
      'Bug',
      'Story',
      'Epic',
    ]);
  });

  it('defaults to Task and honours the `issueType` alias', async () => {
    await bulkCreate({
      tickets: [
        { summary: 'no-type' },
        { summary: 'aliased', issueType: 'Epic' },
      ],
    });

    expect(issueUpdates().map((u) => u.fields.issuetype.name)).toEqual([
      'Task',
      'Epic',
    ]);
  });

  it('prefers explicit `type` over the `issueType` alias', async () => {
    await bulkCreate({
      tickets: [{ summary: 'both', type: 'Story', issueType: 'Epic' }],
    });

    expect(issueUpdates()[0].fields.issuetype.name).toBe('Story');
  });
});
