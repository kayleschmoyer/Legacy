import { z } from 'zod';
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

function parseJson(result: { content: Array<{ type: string }> }) {
  return JSON.parse(text(result)) as Record<string, unknown>;
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

function thinIssue(key: string) {
  return {
    key,
    fields: {
      summary: `Summary for ${key}`,
      status: { name: 'To Do' },
      issuetype: { name: 'Task' },
      description: null,
      assignee: null,
      reporter: { displayName: 'Reporter' },
      issuelinks: [],
      labels: [],
      priority: { name: 'Medium' },
      created: '2026-01-01T00:00:00.000-0400',
      updated: '2026-01-02T00:00:00.000-0400',
    },
  };
}

describe('view', () => {
  describe('single-key', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockJiraRequest.mockResolvedValue(issue);
      mockSearchJqlAll.mockResolvedValue(children);
    });

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
      const parsed = parseJson(result);
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
        children: { total: 2, toDo: 0, inProgress: 1, inReview: 0, done: 1 },
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
      expect(md.length).toBeLessThan(json.length);
    });

    it('returns isError on API failure for single key', async () => {
      jest.clearAllMocks();
      mockSearchJqlAll.mockResolvedValueOnce([]);
      mockJiraRequest.mockRejectedValueOnce(new Error('404 Not Found'));

      const result = await view({ key: 'LS-999', format: 'json' });

      expect(result.isError).toBe(true);
      const block = result.content[0] as { type: string; text: string };
      expect(block.text).toContain('LS-999');
      expect(block.text).toContain('404 Not Found');
    });
  });

  describe('batch path (keys[])', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // No children for thin fixtures — keep batch JSON predictable.
      mockSearchJqlAll.mockResolvedValue([]);
    });

    it('returns both tickets in one call (happy path)', async () => {
      mockJiraRequest
        .mockResolvedValueOnce(thinIssue('LS-1'))
        .mockResolvedValueOnce(thinIssue('LS-2'));

      const result = await view({ keys: ['LS-1', 'LS-2'] });

      expect(result.isError).toBeUndefined();
      const data = parseJson(result) as {
        tickets: Record<string, { key: string }>;
        missing: string[];
      };
      expect(Object.keys(data.tickets).sort()).toEqual(['LS-1', 'LS-2']);
      expect(data.tickets['LS-1']?.key).toBe('LS-1');
      expect(data.tickets['LS-2']?.key).toBe('LS-2');
      expect(data.missing).toEqual([]);
    });

    it('isolates per-key failures into missing[] without failing the whole call', async () => {
      mockJiraRequest
        .mockResolvedValueOnce(thinIssue('LS-1'))
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce(thinIssue('LS-3'));

      const result = await view({ keys: ['LS-1', 'LS-NOPE', 'LS-3'] });

      expect(result.isError).toBeUndefined();
      const data = parseJson(result) as {
        tickets: Record<string, { key: string }>;
        missing: string[];
      };
      expect(Object.keys(data.tickets).sort()).toEqual(['LS-1', 'LS-3']);
      expect(data.missing).toEqual(['LS-NOPE']);
    });

    it('handles a single-element keys array', async () => {
      mockJiraRequest.mockResolvedValueOnce(thinIssue('LS-1'));

      const result = await view({ keys: ['LS-1'] });

      const data = parseJson(result) as {
        tickets: Record<string, unknown>;
        missing: string[];
      };
      expect(Object.keys(data.tickets)).toEqual(['LS-1']);
      expect(data.missing).toEqual([]);
    });

    it('returns all-missing when every key fails', async () => {
      mockJiraRequest
        .mockRejectedValueOnce(new Error('404'))
        .mockRejectedValueOnce(new Error('500'));

      const result = await view({ keys: ['LS-A', 'LS-B'] });

      expect(result.isError).toBeUndefined();
      const data = parseJson(result) as {
        tickets: Record<string, unknown>;
        missing: string[];
      };
      expect(data.tickets).toEqual({});
      expect(data.missing).toEqual(['LS-A', 'LS-B']);
    });

    it('batch output is minified (no pretty-print whitespace)', async () => {
      mockJiraRequest.mockResolvedValueOnce(thinIssue('LS-1'));
      const out = text(await view({ keys: ['LS-1'] }));
      expect(out).not.toContain('\n');
      expect(out.startsWith('{')).toBe(true);
    });

    it('rejects oversize arrays at the schema layer (>50 keys)', () => {
      // Mirrors the zod schema registered for `jira_view` in index.ts. Kept
      // local so view.spec.ts can verify validation independently of the MCP
      // server wiring.
      const keysSchema = z.array(z.string()).min(1).max(50);
      const oversize = Array.from({ length: 51 }, (_, i) => `LS-${i + 1}`);

      expect(keysSchema.safeParse(oversize).success).toBe(false);
      expect(keysSchema.safeParse(oversize.slice(0, 50)).success).toBe(true);
      expect(keysSchema.safeParse([]).success).toBe(false);
    });
  });
});
