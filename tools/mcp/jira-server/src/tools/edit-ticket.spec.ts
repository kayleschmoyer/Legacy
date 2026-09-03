import { editTicket } from './edit-ticket';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
}));

jest.mock('@legacy-sports/logging/server', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

interface MockJiraRequestOpts {
  method: string;
  path?: string;
  body?: unknown;
}

const { jiraRequest: mockJiraRequest } = jest.requireMock<{
  jiraRequest: jest.Mock<Promise<unknown>, [MockJiraRequestOpts]>;
}>('../jira-api');

function parse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('editTicket — labels', () => {
  it('adds a new label, preserving the existing ones', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; body?: unknown }) => {
        if (opts.method === 'GET') {
          return Promise.resolve({ fields: { labels: ['existing'] } });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await editTicket({ key: 'LS-1', addLabels: ['new-one'] });
    const data = parse(result);

    expect(result.isError).toBeUndefined();
    expect(data['success']).toBe(true);
    expect(data['labels']).toEqual(['existing', 'new-one']);

    const put = mockJiraRequest.mock.calls.find(
      ([opts]) => opts.method === 'PUT',
    );
    if (!put) throw new Error('expected a PUT call');
    expect(put[0].body).toEqual({
      update: { labels: [{ add: 'new-one' }] },
    });
  });

  it('removes a label, preserving the others', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; body?: unknown }) => {
        if (opts.method === 'GET') {
          return Promise.resolve({
            fields: { labels: ['keep-me', 'drop-me'] },
          });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await editTicket({
      key: 'LS-1',
      removeLabels: ['drop-me'],
    });
    const data = parse(result);

    expect(result.isError).toBeUndefined();
    expect(data['success']).toBe(true);
    expect(data['labels']).toEqual(['keep-me']);

    const put = mockJiraRequest.mock.calls.find(
      ([opts]) => opts.method === 'PUT',
    );
    if (!put) throw new Error('expected a PUT call');
    expect(put[0].body).toEqual({
      update: { labels: [{ remove: 'drop-me' }] },
    });
  });

  it('is a no-op when adding an already-present label and removing a label that is absent', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; body?: unknown }) => {
        if (opts.method === 'GET') {
          return Promise.resolve({ fields: { labels: ['already-here'] } });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await editTicket({
      key: 'LS-1',
      addLabels: ['already-here'],
      removeLabels: ['not-here'],
    });
    const data = parse(result);

    expect(result.isError).toBeUndefined();
    expect(data['success']).toBe(true);
    expect(data['labels']).toEqual(['already-here']);

    // Resulting state is unchanged, so no PUT should be issued.
    expect(
      mockJiraRequest.mock.calls.some(([opts]) => opts.method === 'PUT'),
    ).toBe(false);

    // No real change happened, so 'labels' must not appear in updatedFields.
    expect(data['updatedFields']).toEqual([]);
    expect(data['message']).toContain('No changes to LS-1');
  });

  it('combines label changes with other field updates in a single PUT', async () => {
    mockJiraRequest.mockImplementation(
      (opts: { method: string; body?: unknown }) => {
        if (opts.method === 'GET') {
          return Promise.resolve({ fields: { labels: [] } });
        }
        return Promise.resolve(undefined);
      },
    );

    const result = await editTicket({
      key: 'LS-1',
      summary: 'New summary',
      addLabels: ['human-action'],
    });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(data['updatedFields']).toEqual(['summary', 'labels']);
    expect(data['labels']).toEqual(['human-action']);

    const put = mockJiraRequest.mock.calls.find(
      ([opts]) => opts.method === 'PUT',
    );
    if (!put) throw new Error('expected a PUT call');
    expect(put[0].body).toEqual({
      fields: { summary: 'New summary' },
      update: { labels: [{ add: 'human-action' }] },
    });
  });

  it('returns an error and performs no PUT when the labels GET fails', async () => {
    mockJiraRequest.mockImplementation((opts: { method: string }) => {
      if (opts.method === 'GET') {
        return Promise.reject(new Error('Jira API GET failed (404)'));
      }
      return Promise.resolve(undefined);
    });

    const result = await editTicket({ key: 'LS-1', addLabels: ['x'] });
    const data = parse(result);

    expect(result.isError).toBe(true);
    expect(data['success']).toBe(false);
    expect(data['error']).toContain('Failed to read current labels');
    expect(
      mockJiraRequest.mock.calls.some(([opts]) => opts.method === 'PUT'),
    ).toBe(false);
  });
});

describe('editTicket — existing behavior unaffected', () => {
  it('still rejects a call with no fields provided', async () => {
    const result = await editTicket({ key: 'LS-1' });
    const data = parse(result);

    expect(result.isError).toBe(true);
    expect(data['success']).toBe(false);
    expect(mockJiraRequest).not.toHaveBeenCalled();
  });

  it('updates summary without touching labels', async () => {
    mockJiraRequest.mockResolvedValue(undefined);

    const result = await editTicket({ key: 'LS-1', summary: 'Renamed' });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(data['labels']).toBeUndefined();
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1',
      body: { fields: { summary: 'Renamed' } },
    });
  });
});

describe('editTicket — assignee (LS-9607)', () => {
  it('assigns via assigneeAccountId with no status transition call', async () => {
    mockJiraRequest.mockResolvedValue(undefined);

    const result = await editTicket({
      key: 'LS-1',
      assigneeAccountId: 'acct-1',
    });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(data['updatedFields']).toEqual(['assignee']);
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1/assignee',
      body: { accountId: 'acct-1' },
    });
    // No status-transition endpoint touched.
    expect(
      mockJiraRequest.mock.calls.some(([opts]) =>
        (opts.path ?? '').includes('/transitions'),
      ),
    ).toBe(false);
  });

  it('unassigns when assignee is passed as an empty string', async () => {
    mockJiraRequest.mockResolvedValue(undefined);

    const result = await editTicket({ key: 'LS-1', assignee: '' });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(data['updatedFields']).toEqual(['assignee']);
    expect(data['assignee']).toBeNull();
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1/assignee',
      body: { accountId: null },
    });
  });

  it('unassigns when assignee is passed as null', async () => {
    mockJiraRequest.mockResolvedValue(undefined);

    const result = await editTicket({ key: 'LS-1', assignee: null });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1/assignee',
      body: { accountId: null },
    });
  });

  it('combines an assignee change with another field update in one call', async () => {
    mockJiraRequest.mockResolvedValue(undefined);

    const result = await editTicket({
      key: 'LS-1',
      summary: 'Renamed',
      assigneeAccountId: 'acct-1',
    });
    const data = parse(result);

    expect(data['success']).toBe(true);
    expect(data['updatedFields']).toEqual(['summary', 'assignee']);
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1',
      body: { fields: { summary: 'Renamed' } },
    });
    expect(mockJiraRequest).toHaveBeenCalledWith({
      method: 'PUT',
      path: '/rest/api/3/issue/LS-1/assignee',
      body: { accountId: 'acct-1' },
    });
  });

  it('accepts an assignee-only request without the "at least one field" error', async () => {
    mockJiraRequest.mockResolvedValue(undefined);

    const result = await editTicket({
      key: 'LS-1',
      assigneeAccountId: 'acct-1',
    });

    expect(result.isError).toBeUndefined();
  });
});
