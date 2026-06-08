import { createTicket } from './create-ticket';

// createTicket talks to Jira via jiraRequest and resolves credentials for the
// browse URL. Mock those boundaries so the test stays hermetic and asserts the
// exact payload sent to the create API.
jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
  getSiteUrl: jest.fn(() => 'https://bkrupa.atlassian.net'),
}));

jest.mock('../netrc', () => ({
  getJiraCredentials: jest.fn(async () => ({ type: 'basic' })),
}));

// get-active-sprint pulls in the wider API chain; mock it so importing
// create-ticket stays cheap and the no-sprint path needs no setup.
jest.mock('./get-active-sprint', () => ({
  getActiveSprintId: jest.fn(async () => null),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

interface CreateBody {
  fields: { issuetype: { name: string }; parent?: { key: string } };
}

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

/** Return the body sent to the POST /issue create call. */
function createBody(): CreateBody {
  const call = (
    mockJiraRequest.mock.calls as Array<
      [{ method: string; path: string; body?: CreateBody }]
    >
  ).find(
    ([opts]) => opts.method === 'POST' && opts.path === '/rest/api/3/issue',
  );
  if (!call?.[0].body) throw new Error('no create POST call captured');
  return call[0].body;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockJiraRequest.mockImplementation(
    (opts: { method: string; path: string }) => {
      if (opts.method === 'POST' && opts.path === '/rest/api/3/issue') {
        return Promise.resolve({
          key: 'LS-100',
          self: 'https://bkrupa.atlassian.net/rest/api/3/issue/100',
        });
      }
      return Promise.resolve(undefined);
    },
  );
});

describe('createTicket — issuetype mapping (LS-7852)', () => {
  it.each(['Task', 'Bug', 'Story', 'Epic'])(
    'sends issuetype.name === requested type "%s"',
    async (type) => {
      const result = await createTicket({ summary: 'A ticket', type });

      expect(parse(result)['success']).toBe(true);
      expect(createBody().fields.issuetype).toEqual({ name: type });
    },
  );

  it('creates an Epic in one call — no follow-up edit/promote needed', async () => {
    await createTicket({ summary: 'An epic', type: 'Epic' });

    // Exactly one create POST and no PUT (which would indicate a promote step).
    const calls = mockJiraRequest.mock.calls as Array<
      [{ method: string; path: string }]
    >;
    expect(calls.filter(([o]) => o.method === 'POST')).toHaveLength(1);
    expect(calls.filter(([o]) => o.method === 'PUT')).toHaveLength(0);
    expect(createBody().fields.issuetype).toEqual({ name: 'Epic' });
  });

  it('defaults to Task when no type is provided', async () => {
    await createTicket({ summary: 'No type' });

    expect(createBody().fields.issuetype).toEqual({ name: 'Task' });
  });

  it('accepts `issueType` as an alias for `type` (historical agent footgun)', async () => {
    // Agents historically passed `issueType: "Epic"`, which was dropped and the
    // ticket silently fell back to Task. The alias keeps it deterministic.
    await createTicket({ summary: 'Aliased', issueType: 'Epic' });

    expect(createBody().fields.issuetype).toEqual({ name: 'Epic' });
  });

  it('prefers explicit `type` over the `issueType` alias when both are given', async () => {
    await createTicket({ summary: 'Both', type: 'Story', issueType: 'Epic' });

    expect(createBody().fields.issuetype).toEqual({ name: 'Story' });
  });

  it('passes a parent through at create time (e.g. child under an epic)', async () => {
    await createTicket({ summary: 'Child', type: 'Story', parent: 'LS-7853' });

    expect(createBody().fields.parent).toEqual({ key: 'LS-7853' });
  });
});
