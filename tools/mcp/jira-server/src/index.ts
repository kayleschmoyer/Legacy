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
import { editTicket } from './tools/edit-ticket.js';
import { linkIssues } from './tools/link-issues.js';
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
      .enum(['Task', 'Bug', 'Story', 'Epic'])
      .default('Task')
      .describe(
        'Issue type: one of "Task", "Bug", "Story", or "Epic" (default: Task)',
      ),
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
  'Transition a Jira ticket to a new status. Validates the status string. ' +
    'When transitioning to Done, warns about open subtasks. Use cascade: true to auto-transition them.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-1137)',
      )
      .describe('Jira ticket key, e.g. LS-1137'),
    status: z
      .enum(['In Progress', 'In Review', 'Done'])
      .describe('Target status'),
    cascade: z
      .boolean()
      .default(false)
      .describe(
        'When transitioning to Done, auto-transition open subtasks to Done as well. ' +
          'Without this flag, the tool warns about orphaned subtasks but does not cascade.',
      ),
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

// --- jira_edit_ticket ---
server.tool(
  'jira_edit_ticket',
  'Update fields on an existing Jira ticket. Provide at least one field to update.',
  {
    key: z.string().describe('Jira ticket key, e.g. LS-1578'),
    summary: z.string().optional().describe('New summary/title'),
    description: z.string().optional().describe('New description'),
    type: z
      .enum(['Task', 'Bug', 'Story'])
      .optional()
      .describe('Change issue type'),
  },
  async (params) => editTicket(params),
);

// --- jira_link_issues ---
server.tool(
  'jira_link_issues',
  'Create an issue link between two Jira tickets. Common link types: "Blocks" (inwardIssue "is blocked by" outwardIssue — outward is the blocker), "Relates" (bidirectional). Use to establish dependencies so jira_check_blockers can detect them.',
  {
    inwardKey: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe(
        'The issue that reads the inward phrase. For "Blocks" (inward = "is blocked by"): this is the blocked ticket — the one that depends on the other. Example: if LS-100 is blocked by LS-99, inwardKey = "LS-100".',
      ),
    outwardKey: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe(
        'The issue that reads the outward phrase. For "Blocks" (outward = "blocks"): this is the blocker — the one that must be completed first. Example: if LS-100 is blocked by LS-99, outwardKey = "LS-99". Note: jira_check_blockers reads blockers from inwardIssue on GET responses (Jira flips perspective), so links created here are correctly detected.',
      ),
    linkType: z
      .string()
      .min(1, 'Link type must be a non-empty string')
      .describe(
        'Jira link type name. Common values: "Blocks", "Relates", "Cloners", "Duplicate"',
      ),
  },
  async (params) => linkIssues(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
