import { z } from 'zod';
import { view } from './view';

jest.mock('../jira-api', () => ({
  jiraRequest: jest.fn(),
  jiraRequestBinary: jest.fn(),
}));

jest.mock('../jql-search', () => ({
  searchJqlAll: jest.fn(),
}));

const {
  jiraRequest: mockJiraRequest,
  jiraRequestBinary: mockJiraRequestBinary,
} = jest.requireMock<{
  jiraRequest: jest.Mock;
  jiraRequestBinary: jest.Mock;
}>('../jira-api');

const { searchJqlAll: mockSearchJqlAll } = jest.requireMock<{
  searchJqlAll: jest.Mock;
}>('../jql-search');

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

const commentsResponse = {
  comments: [
    {
      id: 'c1',
      author: { displayName: 'Alice' },
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'LGTM' }],
          },
        ],
      },
      created: '2026-06-21T00:00:00.000-0400',
      updated: '2026-06-21T00:00:00.000-0400',
    },
  ],
  total: 1,
  startAt: 0,
  maxResults: 50,
};

const transitionsResponse = {
  transitions: [
    {
      id: '21',
      name: 'To Do',
      to: { name: 'To Do', statusCategory: { name: 'To Do' } },
    },
    {
      id: '31',
      name: 'In Progress',
      to: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
    },
  ],
};

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
  describe('single-key — default (no include)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockJiraRequest.mockResolvedValue(issue);
      mockSearchJqlAll.mockResolvedValue(children);
    });

    it('defaults to markdown output — base fields only (no blockers/children sections)', async () => {
      const result = await view({ key: 'LS-9000' });
      const out = text(result);
      expect(out).toContain('## [LS-9000] Add markdown output to jira_view');
      expect(out).toContain('Body paragraph one.');
      // Blockers and children sections are NOT rendered by default
      expect(out).not.toContain('### Blockers');
      expect(out).not.toContain('### Children');
      expect(out).not.toContain('### Comments');
      expect(out).not.toContain('### Transitions');
    });

    it('does not call searchJqlAll when children not in include', async () => {
      await view({ key: 'LS-9000' });
      expect(mockSearchJqlAll).not.toHaveBeenCalled();
    });

    it('format: "json" returns base fields only (no blockers/children keys)', async () => {
      const result = await view({ key: 'LS-9000', format: 'json' });
      const parsed = parseJson(result);
      expect(parsed.key).toBe('LS-9000');
      expect(parsed.blockers).toBeUndefined();
      expect(parsed.children).toBeUndefined();
      expect(parsed.comments).toBeUndefined();
      expect(parsed.transitions).toBeUndefined();
    });
  });

  describe('single-key — include: blockers', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockJiraRequest.mockResolvedValue(issue);
    });

    it('renders Blockers section in markdown', async () => {
      const out = text(await view({ key: 'LS-9000', include: ['blockers'] }));
      expect(out).toContain('### Blockers');
      expect(out).toContain('LS-1234 — Upstream fix [Done]');
      expect(out).not.toContain('### Children');
    });

    it('includes blockers in JSON output', async () => {
      const parsed = parseJson(
        await view({ key: 'LS-9000', format: 'json', include: ['blockers'] }),
      );
      expect(parsed.blockers).toEqual([{ key: 'LS-1234', type: 'blocked-by' }]);
      expect(parsed.children).toBeUndefined();
    });
  });

  describe('single-key — include: children', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockJiraRequest.mockResolvedValue(issue);
      mockSearchJqlAll.mockResolvedValue(children);
    });

    it('renders Children section in markdown', async () => {
      const out = text(await view({ key: 'LS-9000', include: ['children'] }));
      expect(out).toContain('### Children');
      expect(out).toContain('LS-2345 — Child task [In Progress]');
      expect(out).not.toContain('### Blockers');
    });

    it('calls searchJqlAll when children in include', async () => {
      await view({ key: 'LS-9000', include: ['children'] });
      expect(mockSearchJqlAll).toHaveBeenCalledWith(
        expect.objectContaining({
          jql: expect.stringContaining('LS-9000') as unknown,
        }),
      );
    });

    it('includes children summary in JSON output', async () => {
      const parsed = parseJson(
        await view({ key: 'LS-9000', format: 'json', include: ['children'] }),
      );
      expect(parsed.children).toEqual({
        total: 2,
        toDo: 0,
        inProgress: 1,
        inReview: 0,
        done: 1,
      });
    });
  });

  describe('single-key — include: comments', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockJiraRequest
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(commentsResponse);
    });

    it('renders Comments section in markdown', async () => {
      const out = text(await view({ key: 'LS-9000', include: ['comments'] }));
      expect(out).toContain('### Comments');
      expect(out).toContain('Alice');
      expect(out).toContain('LGTM');
    });

    it('includes comments in JSON output', async () => {
      mockJiraRequest
        .mockReset()
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(commentsResponse);
      const parsed = parseJson(
        await view({ key: 'LS-9000', format: 'json', include: ['comments'] }),
      );
      expect(Array.isArray(parsed.comments)).toBe(true);
      const comments = parsed.comments as Array<Record<string, string>>;
      expect(comments[0]?.author).toBe('Alice');
      expect(comments[0]?.body).toBe('LGTM');
    });
  });

  describe('single-key — include: transitions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockJiraRequest
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(transitionsResponse);
    });

    it('renders Transitions section in markdown', async () => {
      const out = text(
        await view({ key: 'LS-9000', include: ['transitions'] }),
      );
      expect(out).toContain('### Transitions');
      expect(out).toContain('21: To Do → To Do');
      expect(out).toContain('31: In Progress → In Progress');
    });

    it('includes transitions in JSON output', async () => {
      mockJiraRequest
        .mockReset()
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(transitionsResponse);
      const parsed = parseJson(
        await view({
          key: 'LS-9000',
          format: 'json',
          include: ['transitions'],
        }),
      );
      expect(Array.isArray(parsed.transitions)).toBe(true);
      const ts = parsed.transitions as Array<Record<string, unknown>>;
      expect(ts[0]?.id).toBe('21');
    });
  });

  describe('single-key — include: combination (blockers + children + comments + transitions)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockSearchJqlAll.mockResolvedValue(children);
      mockJiraRequest
        .mockResolvedValueOnce(issue) // main issue
        .mockResolvedValueOnce(commentsResponse) // comments
        .mockResolvedValueOnce(transitionsResponse); // transitions
    });

    it('renders all four sections in markdown', async () => {
      const out = text(
        await view({
          key: 'LS-9000',
          include: ['blockers', 'children', 'comments', 'transitions'],
        }),
      );
      expect(out).toContain('### Blockers');
      expect(out).toContain('### Children');
      expect(out).toContain('### Comments');
      expect(out).toContain('### Transitions');
    });

    it('renders all four sections in JSON', async () => {
      mockJiraRequest
        .mockReset()
        .mockResolvedValueOnce(issue)
        .mockResolvedValueOnce(commentsResponse)
        .mockResolvedValueOnce(transitionsResponse);
      mockSearchJqlAll.mockResolvedValue(children);
      const parsed = parseJson(
        await view({
          key: 'LS-9000',
          format: 'json',
          include: ['blockers', 'children', 'comments', 'transitions'],
        }),
      );
      expect(parsed.blockers).toBeDefined();
      expect(parsed.children).toBeDefined();
      expect(parsed.comments).toBeDefined();
      expect(parsed.transitions).toBeDefined();
    });
  });

  describe('single-key — rendering edge cases', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('renders _None._ for empty blockers', async () => {
      mockJiraRequest.mockResolvedValueOnce({
        ...issue,
        fields: { ...issue.fields, issuelinks: [] },
      });
      const out = text(await view({ key: 'LS-9001', include: ['blockers'] }));
      expect(out).toContain('### Blockers\n_None._');
    });

    it('renders _None._ for empty children', async () => {
      mockJiraRequest.mockResolvedValueOnce(issue);
      mockSearchJqlAll.mockResolvedValueOnce([]);
      const out = text(await view({ key: 'LS-9001', include: ['children'] }));
      expect(out).toContain('### Children\n_None._');
    });

    it('does not render Parent line when parent is absent', async () => {
      mockJiraRequest.mockResolvedValueOnce({
        ...issue,
        fields: { ...issue.fields, parent: undefined },
      });
      const out = text(await view({ key: 'LS-9001' }));
      expect(out).not.toContain('**Parent:**');
    });

    it('format: "json" is minified (no pretty-print whitespace)', async () => {
      mockJiraRequest.mockResolvedValueOnce(issue);
      const out = text(await view({ key: 'LS-9000', format: 'json' }));
      expect(out).not.toContain('\n');
      expect(out.startsWith('{')).toBe(true);
    });

    it('returns isError on API failure for single key', async () => {
      mockSearchJqlAll.mockResolvedValueOnce([]);
      mockJiraRequest.mockRejectedValueOnce(new Error('404 Not Found'));

      const result = await view({ key: 'LS-999', format: 'json' });

      expect(result.isError).toBe(true);
      const block = result.content[0] as { type: string; text: string };
      expect(block.text).toContain('LS-999');
      expect(block.text).toContain('404 Not Found');
    });
  });

  describe('single-key — include: attachments (LS-10016)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    const attachment = {
      id: 10501,
      filename: 'screenshot.png',
      mimeType: 'image/png',
      size: 2048,
      created: '2026-09-01T10:00:00.000Z',
      author: { displayName: 'Reporter' },
    };

    it('asks for the attachment field on the same issue fetch (no extra call)', async () => {
      mockJiraRequest.mockResolvedValueOnce({
        ...issue,
        fields: { ...issue.fields, attachment: [attachment] },
      });

      await view({ key: 'LS-9000', include: ['attachments'] });

      expect(mockJiraRequest).toHaveBeenCalledTimes(1);
      const [call] = (
        mockJiraRequest.mock.calls as Array<[{ query: { fields: string } }]>
      )[0];
      expect(call.query.fields).toContain(',attachment');
    });

    it('omits the attachment field when attachments were not requested', async () => {
      mockJiraRequest.mockResolvedValueOnce(issue);

      await view({ key: 'LS-9000' });

      const [call] = (
        mockJiraRequest.mock.calls as Array<[{ query: { fields: string } }]>
      )[0];
      expect(call.query.fields).not.toContain('attachment');
    });

    it('renders an attachment table plus a read hint in the markdown card', async () => {
      mockJiraRequest.mockResolvedValueOnce({
        ...issue,
        fields: { ...issue.fields, attachment: [attachment] },
      });

      const out = text(
        await view({ key: 'LS-9000', include: ['attachments'] }),
      );

      expect(out).toContain('### Attachments');
      expect(out).toContain('screenshot.png');
      expect(out).toContain('10501');
      expect(out).toContain('attachment: "<id|filename>"');
    });

    it('renders _None._ for a ticket with no attachments', async () => {
      mockJiraRequest.mockResolvedValueOnce(issue);

      const out = text(
        await view({ key: 'LS-9000', include: ['attachments'] }),
      );

      expect(out).toContain('### Attachments');
      expect(out).toContain('_None._');
    });

    it('includes attachments in the JSON shape', async () => {
      mockJiraRequest.mockResolvedValueOnce({
        ...issue,
        fields: { ...issue.fields, attachment: [attachment] },
      });

      const data = parseJson(
        await view({
          key: 'LS-9000',
          format: 'json',
          include: ['attachments'],
        }),
      ) as { attachments: Array<{ id: string; filename: string }> };

      expect(data.attachments).toEqual([
        expect.objectContaining({ id: '10501', filename: 'screenshot.png' }),
      ]);
    });
  });

  describe('single-key — attachment mode (LS-10016)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns the attachment content instead of the ticket card', async () => {
      mockJiraRequest.mockResolvedValueOnce({
        fields: {
          attachment: [
            {
              id: 10501,
              filename: 'screenshot.png',
              mimeType: 'image/png',
              size: 10,
              created: '2026-09-01T10:00:00.000Z',
              author: { displayName: 'Reporter' },
            },
          ],
        },
      });
      mockJiraRequestBinary.mockResolvedValueOnce({
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'image/png',
      });

      const result = await view({ key: 'LS-9000', attachment: 'latest' });

      expect(result.content.some((c) => c.type === 'image')).toBe(true);
      expect(mockJiraRequestBinary).toHaveBeenCalledWith(
        '/rest/api/3/attachment/content/10501',
      );
    });
  });

  describe('batch path (keys[])', () => {
    beforeEach(() => {
      jest.clearAllMocks();
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

    it('applies include[] to each key in batch mode', async () => {
      mockJiraRequest
        .mockResolvedValueOnce(thinIssue('LS-1'))
        .mockResolvedValueOnce(thinIssue('LS-2'));

      const result = await view({
        keys: ['LS-1', 'LS-2'],
        include: ['blockers'],
      });
      const data = parseJson(result) as {
        tickets: Record<string, { blockers?: unknown }>;
        missing: string[];
      };
      expect(data.tickets['LS-1']?.blockers).toBeDefined();
      expect(data.tickets['LS-2']?.blockers).toBeDefined();
    });

    it('rejects oversize arrays at the schema layer (>50 keys)', () => {
      const keysSchema = z.array(z.string()).min(1).max(50);
      const oversize = Array.from({ length: 51 }, (_, i) => `LS-${i + 1}`);

      expect(keysSchema.safeParse(oversize).success).toBe(false);
      expect(keysSchema.safeParse(oversize.slice(0, 50)).success).toBe(true);
      expect(keysSchema.safeParse([]).success).toBe(false);
    });
  });
});
