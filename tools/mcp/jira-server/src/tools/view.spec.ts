import { view } from './view';

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
) as { searchJqlAll: jest.Mock };

function text(result: { content: Array<{ type: string }> }): string {
  const block = result.content[0] as { type: string; text: string };
  return block.text;
}

const issue = {
  key: 'LS-9000',
  fields: {
    summary: 'Add markdown output to jira_view',
    status: { name: 'In Progress' },
    issuetype: { name: 'Task' },
    description: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Body paragraph one.' }],
        },
      ],
    },
    assignee: { displayName: 'Brad Krupa' },
    reporter: { displayName: 'Brad Krupa' },
    parent: { key: 'LS-2981', fields: { summary: 'mcp-gaps bucket' } },
    issuelinks: [
      {
        type: { name: 'Blocks', inward: 'is blocked by' },
        inwardIssue: {
          key: 'LS-1234',
          fields: { summary: 'Upstream fix', status: { name: 'Done' } },
        },
      },
    ],
    labels: ['mcp-gap'],
    priority: { name: 'Medium' },
    created: '2026-06-20T00:00:00.000-0400',
    updated: '2026-06-20T00:00:00.000-0400',
  },
};

const children = [
  {
    key: 'LS-2345',
    fields: { summary: 'Child task', status: { name: 'In Progress' } },
  },
  {
    key: 'LS-2346',
    fields: { summary: 'Other child', status: { name: 'Done' } },
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockJiraRequest.mockResolvedValue(issue);
  mockSearchJqlAll.mockResolvedValue(children);
});

describe('view', () => {
  it('defaults to markdown output matching the card shape', async () => {
    const result = await view({ key: 'LS-9000' });
    expect(text(result)).toMatchInlineSnapshot(`
"## [LS-9000] Add markdown output to jira_view

**Status:** In Progress · **Type:** Task · **Priority:** Medium · **Assignee:** Brad Krupa
**Parent:** LS-2981 (mcp-gaps bucket)
**Labels:** mcp-gap

### Description
Body paragraph one.

### Blockers
- LS-1234 — Upstream fix [Done]

### Children
- LS-2345 — Child task [In Progress]
- LS-2346 — Other child [Done]"
`);
  });

  it('renders empty sections when there are no blockers or children', async () => {
    mockJiraRequest.mockResolvedValueOnce({
      ...issue,
      fields: { ...issue.fields, issuelinks: [], parent: undefined },
    });
    mockSearchJqlAll.mockResolvedValueOnce([]);

    const out = text(await view({ key: 'LS-9001' }));
    expect(out).toContain('### Blockers\n_None._');
    expect(out).toContain('### Children\n_None._');
    expect(out).not.toContain('**Parent:**');
  });

  it('format: "json" returns the legacy JSON shape', async () => {
    const result = await view({ key: 'LS-9000', format: 'json' });
    const parsed = JSON.parse(text(result));
    expect(parsed).toEqual({
      key: 'LS-9000',
      summary: 'Add markdown output to jira_view',
      status: 'In Progress',
      type: 'Task',
      priority: 'Medium',
      description: 'Body paragraph one.',
      assignee: 'Brad Krupa',
      reporter: 'Brad Krupa',
      parent: 'LS-2981',
      labels: ['mcp-gap'],
      created: '2026-06-20T00:00:00.000-0400',
      updated: '2026-06-20T00:00:00.000-0400',
      blockers: [{ key: 'LS-1234', type: 'blocked-by' }],
      children: {
        total: 2,
        toDo: 0,
        inProgress: 1,
        inReview: 0,
        done: 1,
      },
    });
  });

  it('format: "json" is minified (no pretty-print whitespace)', async () => {
    const out = text(await view({ key: 'LS-9000', format: 'json' }));
    // Standard: single-ticket responses are minified JSON, never
    // JSON.stringify(x, null, 2). Indentation would show up as newlines.
    expect(out).not.toContain('\n');
    expect(out.startsWith('{')).toBe(true);
  });

  it('markdown output is smaller than the minified JSON for the same ticket', async () => {
    const md = text(await view({ key: 'LS-9000' }));
    const json = text(await view({ key: 'LS-9000', format: 'json' }));
    // The default markdown card stays the most compact representation even after
    // the json branch was minified (LS-8023): it drops repeated JSON keys and
    // punctuation, so it remains the smaller of the two on a representative
    // ticket.
    expect(md.length).toBeLessThan(json.length);
  });
});
