import { transition } from './transition';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('../jql-search', () => ({
  searchJqlAll: jest.fn(),
}));

const { jiraRequest: mockJiraRequest } = jest.requireMock('../jira-api') as {
  jiraRequest: jest.Mock;
};

const { searchJqlAll: mockSearchJqlAll } = jest.requireMock(
  '../jql-search',
) as {
  searchJqlAll: jest.Mock;
};

function parse(result: { content: Array<{ type: string }> }) {
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

/** All POST calls made to the transitions endpoint (the actual transition). */
function transitionPosts() {
  return (
    mockJiraRequest.mock.calls as Array<
      [{ method: string; path: string; body?: { transition?: { id: string } } }]
    >
  ).filter(
    ([opts]) => opts.method === 'POST' && opts.path.endsWith('/transitions'),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchJqlAll.mockResolvedValue([]);
});

describe('transition — backward transitions', () => {
  it('moves an In Progress ticket back to To Do, choosing the dynamically-resolved transition id', async () => {
    // Workflow available to an In-Progress issue: a backward "To Do" plus a forward "Done".
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '11', name: 'Back to To Do', to: { name: 'To Do' } },
              { id: '31', name: 'Done', to: { name: 'Done' } },
            ],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await transition({ key: 'LS-1', status: 'To Do' });
    const data = parse(result);

    expect(result.isError).toBeUndefined();
    expect(data['success']).toBe(true);
    expect(data['status']).toBe('To Do');

    const posts = transitionPosts();
    expect(posts).toHaveLength(1);
    // The id must be resolved dynamically from to.name === "To Do", not hardcoded.
    expect(posts[0][0].body).toEqual({ transition: { id: '11' } });
  });

  it('moves a ticket to Backlog when a Backlog transition is available', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '5', name: 'To Backlog', to: { name: 'Backlog' } },
            ],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await transition({ key: 'LS-2', status: 'Backlog' });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(transitionPosts()[0][0].body).toEqual({ transition: { id: '5' } });
  });
});

describe('transition — dynamically-resolved statuses beyond the common set', () => {
  it("closes a ticket as Won't Do via the workflow-exposed transition", async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [
              { id: '3', name: "Won't Do", to: { name: "Won't Do" } },
              { id: '31', name: 'Done', to: { name: 'Done' } },
            ],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await transition({ key: 'LS-5', status: "Won't Do" });
    const data = parse(result);

    expect(result.isError).toBeUndefined();
    expect(data['success']).toBe(true);
    expect(data['status']).toBe("Won't Do");
    expect(transitionPosts()[0][0].body).toEqual({ transition: { id: '3' } });
  });

  it('reaches a custom workflow status not in the common list', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [{ id: '41', name: 'Freeze', to: { name: 'Frozen' } }],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await transition({ key: 'LS-6', status: 'Frozen' });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(transitionPosts()[0][0].body).toEqual({ transition: { id: '41' } });
  });
});

describe('transition — unreachable transition', () => {
  it('returns a clear, actionable error and performs no POST when the target is not reachable', async () => {
    // Issue can only move forward to Done — "To Do" is not an available target.
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await transition({ key: 'LS-3', status: 'To Do' });
    const data = parse(result);

    expect(result.isError).toBe(true);
    expect(data['success']).toBe(false);
    expect(data['error']).toContain('No transition to "To Do" available');
    // The error must surface the reachable targets so the caller can recover.
    expect(data['error']).toContain('Done');

    // No transition should have been attempted.
    expect(transitionPosts()).toHaveLength(0);
  });

  it('returns an actionable error for a status the workflow does not expose', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; path: string }) => {
        if (opts.method === 'GET' && opts.path.endsWith('/transitions')) {
          return Promise.resolve({
            transitions: [{ id: '31', name: 'Done', to: { name: 'Done' } }],
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await transition({ key: 'LS-4', status: 'Frozen' });
    const data = parse(result);

    expect(result.isError).toBe(true);
    expect(data['success']).toBe(false);
    expect(data['error']).toContain('No transition to "Frozen" available');
    expect(data['error']).toContain('Done');
    expect(transitionPosts()).toHaveLength(0);
  });

  it('rejects an empty status before calling Jira', async () => {
    const result = await transition({ key: 'LS-4', status: '  ' });
    const data = parse(result);

    expect(result.isError).toBe(true);
    expect(data['success']).toBe(false);
    expect(data['error']).toContain('non-empty');
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });
});
