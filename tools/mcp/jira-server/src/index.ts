import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createTicket } from './tools/create-ticket.js';
import { transition } from './tools/transition.js';
import { view } from './tools/view.js';
import { checkBlockers } from './tools/check-blockers.js';
import { setParent } from './tools/set-parent.js';
import { getComments } from './tools/get-comments.js';
import { listChildren } from './tools/list-children.js';
import { getAtlassianCredentials } from './netrc.js';

// Validate credentials at startup so the server fails fast with a clear
// error instead of silently starting with every tool call failing.
try {
  await getAtlassianCredentials();
} catch (error) {
  const msg =
    error instanceof Error ? error.message : 'Unknown credential error';
  process.stderr.write(`[legacy-sports-jira] ${msg}\n`);
  process.exit(1);
}

const server = new McpServer({
  name: 'legacy-sports-jira',
  version: '1.0.0',
});

// --- jira_create_ticket ---
server.tool(
  'jira_create_ticket',
  'Create a Jira ticket with proper defaults. Avoids the acli --json duplication bug.',
  {
    summary: z.string().describe('Ticket summary / title'),
    type: z
      .enum(['Task', 'Bug', 'Story'])
      .default('Task')
      .describe('Issue type (default: Task)'),
    description: z
      .string()
      .optional()
      .describe('Ticket description (optional)'),
    parent: z
      .string()
      .optional()
      .describe('Parent epic key, e.g. LS-640 (optional)'),
    sprint: z
      .string()
      .regex(/^(?:current|\d+)$/, 'Must be "current" or a numeric sprint ID')
      .optional()
      .describe(
        'Sprint to add the ticket to. Use "current" to auto-detect the active sprint, or pass a numeric sprint ID. Omit to leave unassigned.',
      ),
  },
  async (params) => createTicket(params),
);

// --- jira_transition ---
server.tool(
  'jira_transition',
  'Transition a Jira ticket to a new status. Validates the status string.',
  {
    key: z.string().describe('Jira ticket key, e.g. LS-1137'),
    status: z
      .enum(['In Progress', 'In Review', 'Done'])
      .describe('Target status'),
  },
  async (params) => transition(params),
);

// --- jira_view ---
server.tool(
  'jira_view',
  'View ticket details in a structured format, including linked blockers.',
  {
    key: z.string().describe('Jira ticket key, e.g. LS-1137'),
  },
  async (params) => view(params),
);

// --- jira_check_blockers ---
server.tool(
  'jira_check_blockers',
  "Check if a ticket's blockers are resolved. Implements the 3-way dependency check: STOP if blocker not ready, use blocker branch if In Review, base off main if Done/no blockers.",
  {
    key: z.string().describe('Jira ticket key to check blockers for'),
  },
  async (params) => checkBlockers(params),
);

// --- jira_set_parent ---
server.tool(
  'jira_set_parent',
  'Set or change the parent epic of an existing ticket via Jira REST API (acli cannot do this).',
  {
    key: z.string().describe('Jira ticket key to update'),
    parent: z.string().describe('Parent epic key to set, e.g. LS-640'),
  },
  async (params) => setParent(params),
);

// --- jira_get_comments ---
server.tool(
  'jira_get_comments',
  'Fetch all comments on a Jira ticket, ordered by creation date. Returns author, plain-text body, and timestamps for each comment.',
  {
    key: z.string().describe('Jira ticket key, e.g. LS-1137'),
  },
  async (params) => getComments(params),
);

// --- jira_list_children ---
server.tool(
  'jira_list_children',
  'List child tickets of an epic or story. Returns key, summary, status, type, priority, and created date for each child. Optionally filter by status.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe('Parent ticket key, e.g. LS-1455 (epic or story)'),
    status: z
      .string()
      .optional()
      .describe(
        'Filter children by status (e.g. "To Do", "In Progress", "In Review", "Done"). Omit to return all.',
      ),
  },
  async (params) => listChildren(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
