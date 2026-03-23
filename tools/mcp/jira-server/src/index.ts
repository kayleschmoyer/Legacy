import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { checkBlockers } from './tools/check-blockers.js';
import { createTicket } from './tools/create-ticket.js';
import { editTicket } from './tools/edit-ticket.js';
import { getComments } from './tools/get-comments.js';
import { linkIssues } from './tools/link-issues.js';
import { listChildren } from './tools/list-children.js';
import { deleteTicket } from './tools/delete-ticket.js';
import { search } from './tools/search.js';
import { setParent } from './tools/set-parent.js';
import { transition, VALID_STATUSES } from './tools/transition.js';
import { view } from './tools/view.js';
import { bulkTransition } from './tools/bulk-transition.js';
import { tryGetJiraCredentials } from './netrc.js';

// Check credentials at startup — warn if missing but don't exit.
// The jira_auth_status tool lets agents decide whether to use this server
// or fall back to Claude's built-in Atlassian integration.
const startupCreds = await tryGetJiraCredentials();
if (!startupCreds) {
  process.stderr.write(
    '[legacy-sports-jira] No Jira credentials found. Tools requiring direct API access will fail. ' +
      'Agent should call jira_auth_status and fall back to built-in Atlassian tools.\n',
  );
} else {
  process.stderr.write(
    `[legacy-sports-jira] Auth: ${startupCreds.type === 'oauth' ? 'OAuth 2.0 (service account)' : 'Basic Auth'}\n`,
  );
}

const server = new McpServer({
  name: 'legacy-sports-jira',
  version: '1.0.0',
});

// --- jira_auth_status ---
server.tool(
  'jira_auth_status',
  'Check if Jira API credentials are configured. Call first in any Jira workflow. If false, use mcp__claude_ai_Atlassian__* instead.',
  {},
  async () => {
    const creds = await tryGetJiraCredentials();

    let source: string | null = null;
    let authMethod: string | null = null;
    if (creds) {
      authMethod = creds.type;
      if (creds.type === 'oauth') {
        source = 'env (OAuth 2.0)';
      } else {
        const emailFromEnv = process.env['JIRA_EMAIL'];
        const tokenFromEnv = process.env['JIRA_API_TOKEN'];
        source = emailFromEnv && tokenFromEnv ? 'env' : 'netrc';
      }
    }

    const result = {
      configured: creds !== null,
      authMethod,
      source,
      fallback: creds
        ? null
        : 'Use built-in Atlassian MCP tools (mcp__claude_ai_Atlassian__*) for Jira operations.',
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
);

// --- jira_check_blockers ---
server.tool(
  'jira_check_blockers',
  '3-way dependency check: STOP if blocker not ready, use blocker branch if In Review, base off main if Done/no blockers.',
  {
    key: z.string().describe('Ticket key to check'),
  },
  async (params) => checkBlockers(params),
);

// --- jira_create_ticket ---
server.tool(
  'jira_create_ticket',
  'Create a Jira ticket with proper defaults.',
  {
    summary: z.string().describe('Ticket summary / title'),
    type: z
      .enum(['Task', 'Bug', 'Story', 'Epic'])
      .default('Task')
      .describe('Issue type (default: Task)'),
    description: z.string().optional().describe('Ticket description'),
    parent: z.string().optional().describe('Parent epic key'),
    sprint: z
      .string()
      .regex(/^(?:current|\d+)$/, 'Must be "current" or a numeric sprint ID')
      .optional()
      .describe('"current" for active sprint, or numeric sprint ID'),
  },
  async (params) => createTicket(params),
);

// --- jira_edit_ticket ---
server.tool(
  'jira_edit_ticket',
  'Update fields on a ticket. Provide at least one field.',
  {
    key: z.string().describe('Ticket key'),
    summary: z.string().optional().describe('New summary/title'),
    description: z.string().optional().describe('New description'),
    type: z
      .enum(['Task', 'Bug', 'Story'])
      .optional()
      .describe('Change issue type'),
  },
  async (params) => editTicket(params),
);

// --- jira_get_comments ---
server.tool(
  'jira_get_comments',
  'Fetch all comments on a ticket, ordered by creation date.',
  {
    key: z.string().describe('Ticket key'),
  },
  async (params) => getComments(params),
);

// --- jira_link_issues ---
server.tool(
  'jira_link_issues',
  'Create a link between two tickets. For "Blocks": inwardKey is blocked by outwardKey.',
  {
    inwardKey: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe('The blocked ticket (reads inward phrase "is blocked by")'),
    outwardKey: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe('The blocker ticket (reads outward phrase "blocks")'),
    linkType: z
      .string()
      .min(1, 'Link type must be a non-empty string')
      .describe('Link type: "Blocks", "Relates", "Cloners", "Duplicate"'),
  },
  async (params) => linkIssues(params),
);

// --- jira_list_children ---
server.tool(
  'jira_list_children',
  'List child tickets of an epic or story. Optionally filter by status.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe('Parent ticket key'),
    status: z
      .string()
      .optional()
      .describe('Filter by status (e.g. "To Do", "Done")'),
  },
  async (params) => listChildren(params),
);

// --- jira_search ---
server.tool(
  'jira_search',
  'Search Jira issues using JQL.',
  {
    jql: z.string().describe('JQL query string'),
    maxResults: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(50)
      .describe('Max results (default: 50, max: 100)'),
  },
  async (params) => search(params),
);

// --- jira_set_parent ---
server.tool(
  'jira_set_parent',
  'Set or change the parent epic of a ticket via REST API.',
  {
    key: z.string().describe('Ticket key to update'),
    parent: z.string().describe('Parent epic key'),
  },
  async (params) => setParent(params),
);

// --- jira_transition ---
server.tool(
  'jira_transition',
  'Transition a ticket to a new status. On Done, warns about open subtasks; use cascade=true to auto-transition them.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-1137)',
      )
      .describe('Ticket key'),
    status: z
      .enum(['In Progress', 'In Review', 'Done'])
      .describe('Target status'),
    cascade: z
      .boolean()
      .default(false)
      .describe('Auto-transition open subtasks to Done (default: false)'),
  },
  async (params) => transition(params),
);

// --- jira_view ---
server.tool(
  'jira_view',
  'View ticket details including linked blockers.',
  {
    key: z.string().describe('Ticket key'),
  },
  async (params) => view(params),
);

// --- jira_bulk_transition ---
server.tool(
  'jira_bulk_transition',
  'Transition multiple Jira tickets to a new status in one call. Returns per-key success/failure results. Use for batch operations like closing all subtasks of a done parent.',
  {
    keys: z
      .array(z.string())
      .min(1)
      .max(50)
      .describe(
        'Array of Jira ticket keys to transition (e.g. ["LS-1410", "LS-1413"])',
      ),
    status: z.enum(VALID_STATUSES).describe('Target status for all tickets'),
  },
  async (params) => bulkTransition(params),
);

// --- jira_delete_ticket ---
server.tool(
  'jira_delete_ticket',
  'Delete a Jira ticket. Use with caution — this is irreversible.',
  {
    key: z.string().describe('Jira ticket key to delete, e.g. LS-1528'),
    confirm: z
      .literal(true)
      .describe(
        'Must be set to true to confirm deletion. This operation is irreversible.',
      ),
  },
  async (params) => deleteTicket(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
