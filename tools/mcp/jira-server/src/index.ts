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
import { bulkCreate } from './tools/bulk-create.js';
import { getBucketEpic, setBucketEpic } from './tools/bucket-epic.js';
import { claimTicket } from './tools/claim-ticket.js';
import { getTransitions } from './tools/get-transitions.js';
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
    context: z
      .string()
      .optional()
      .describe(
        'Why this work is being done — the user problem, business need, or technical debt that motivated the ticket',
      ),
    risk: z
      .string()
      .optional()
      .describe(
        'Risk level (Low/Medium/High) with reasoning — e.g. "Medium — modifies business logic in 3 files"',
      ),
    planningNotes: z
      .string()
      .optional()
      .describe(
        'Relevant files, constraints, and dependencies discovered during planning',
      ),
    parent: z.string().optional().describe('Parent epic key'),
    sprint: z
      .string()
      .regex(/^(?:current|\d+)$/, 'Must be "current" or a numeric sprint ID')
      .optional()
      .describe('"current" for active sprint, or numeric sprint ID'),
  },
  async (params) => createTicket(params),
);

// --- jira_bulk_create_tickets ---
const ticketSchema = z.object({
  summary: z.string().describe('Ticket summary / title'),
  type: z
    .enum(['Task', 'Bug', 'Story', 'Epic'])
    .default('Task')
    .describe('Issue type (default: Task)'),
  description: z.string().optional().describe('Ticket description'),
  context: z
    .string()
    .optional()
    .describe(
      'Why this work is being done — the user problem, business need, or technical debt that motivated the ticket',
    ),
  risk: z
    .string()
    .optional()
    .describe(
      'Risk level (Low/Medium/High) with reasoning — e.g. "Medium — modifies business logic in 3 files"',
    ),
  planningNotes: z
    .string()
    .optional()
    .describe(
      'Relevant files, constraints, and dependencies discovered during planning',
    ),
  parent: z
    .string()
    .optional()
    .describe(
      'Parent epic key (e.g. "LS-####" — use jira_get_bucket_epic to resolve the current bucket epic key)',
    ),
  sprint: z
    .string()
    .regex(/^(?:current|\d+)$/, 'Must be "current" or a numeric sprint ID')
    .optional()
    .describe('"current" for active sprint, or numeric sprint ID'),
});

server.tool(
  'jira_bulk_create_tickets',
  'Create up to 50 Jira tickets in one call. Returns per-ticket success/failure. Use when filing multiple tickets (e.g. MCP gap audits, E2E coverage gaps) to avoid N serial API round-trips.',
  {
    tickets: z.preprocess((val) => {
      if (typeof val !== 'string') return val; // already array — let Zod validate it
      const trimmed = val.trimStart();
      if (!trimmed.startsWith('[')) {
        // Not a JSON array string — return as-is and let z.array validation fail with a clear message
        return val;
      }
      try {
        return JSON.parse(val);
      } catch {
        // Return the original string on invalid JSON so z.array() rejects it
        // with a type error rather than letting a thrown exception escape the
        // preprocess pipeline (which can bypass Zod's error handling).
        return val;
      }
    }, z.array(ticketSchema).min(1).max(50).describe('Array of ticket objects to create. Each ticket must have a summary. Type defaults to Task. Pass sprint: "current" to add to the active sprint.')),
  },
  async (params) => bulkCreate(params),
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
    sprint: z
      .string()
      .regex(/^(?:current|\d+)$/)
      .optional()
      .describe('"current" for active sprint, or numeric sprint ID'),
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
  'List child tickets of an epic or story. Returns paginated results (default 25 per page). Pass pageToken=<nextPageToken> from a previous response to fetch the next page.',
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
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(100)
      .default(25)
      .describe('Max results per page (default: 25, max: 100)'),
    pageToken: z
      .string()
      .optional()
      .describe('Cursor token from a previous response to fetch the next page'),
  },
  async (params) => listChildren(params),
);

// --- jira_search ---
server.tool(
  'jira_search',
  'Search Jira issues using JQL. Returns compact results (key, summary, status, type, assignee, priority) — no metadata blobs. Prefer this over Atlassian plugin search tools to avoid context overflow. Default maxResults is 15; raise only when you know the result set is small. Use compact=true for large result sets (e.g. listing all children of an epic) to get a minimal flat array of {key, summary, status} — typically under 2 KB for 50 issues.',
  {
    jql: z.string().describe('JQL query string'),
    maxResults: z.coerce
      .number()
      .int()
      .positive()
      .max(50)
      .default(15)
      .describe('Max results (default: 15, max: 50)'),
    compact: z
      .boolean()
      .default(false)
      .describe(
        'When true, returns a minimal flat JSON array of {key, summary, status} — no envelope, no extra fields. Use for large result sets like epic children to avoid context overflow.',
      ),
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
  'Transition one or more tickets to a new status. Accepts a single key or an array of keys. ' +
    'When using a single key, cascade=true auto-transitions open subtasks to Done. ' +
    'On Done, warns about open subtasks.',
  {
    key: z
      .preprocess(
        (v) => {
          if (typeof v === 'string') {
            try {
              const parsed = JSON.parse(v);
              if (Array.isArray(parsed)) return parsed;
            } catch {
              // not JSON — treat as single key string
            }
          }
          return v;
        },
        z.union([
          z
            .string()
            .regex(
              /^[A-Z][A-Z0-9_]+-\d+$/,
              'Must be a valid Jira issue key (e.g., LS-1137)',
            ),
          z
            .array(
              z
                .string()
                .regex(
                  /^[A-Z][A-Z0-9_]+-\d+$/,
                  'Each key must be a valid Jira issue key (e.g., LS-1137)',
                ),
            )
            .min(1)
            .max(50),
        ]),
      )
      .describe('Ticket key (string) or array of ticket keys'),
    status: z.enum(VALID_STATUSES).describe('Target status'),
    cascade: z
      .boolean()
      .default(false)
      .describe(
        'Auto-transition open subtasks to Done (default: false). Only applies when key is a single string.',
      ),
  },
  async (params) => {
    if (Array.isArray(params.key)) {
      if (params.cascade) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'cascade=true is not supported when transitioning multiple keys. Set cascade=false or pass a single key.',
            },
          ],
        };
      }
      return bulkTransition({ keys: params.key, status: params.status });
    }
    return transition({
      key: params.key,
      status: params.status,
      cascade: params.cascade,
    });
  },
);

// --- jira_get_transitions ---
server.tool(
  'jira_get_transitions',
  'List available workflow transitions for a Jira issue. Returns [{id, name, to: {name, statusCategory}}]. ' +
    'Use this instead of mcp__*__getTransitionsForJiraIssue (Atlassian plugin) — that tool has a known bug ' +
    'where it may return issue data instead of a transitions array.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe('Ticket key'),
  },
  async (params) => getTransitions(params),
);

// --- jira_claim_ticket ---
server.tool(
  'jira_claim_ticket',
  'Atomically read, validate, and claim a Jira ticket. ' +
    'Fetches ticket details, checks blockers, warns on open children, then transitions to "In Progress". ' +
    'Returns action: "PROCEED" (claimed), "STOP" (blocked/done/in-review/no-transition), or "ALREADY_CLAIMED" (already In Progress). ' +
    'Use this instead of separate jira_view + jira_transition calls at the start of a ticket workflow.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-1234)',
      )
      .describe('Ticket key to claim'),
  },
  async (params) => claimTicket(params),
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

// --- jira_delete_ticket ---
server.tool(
  'jira_delete_ticket',
  'Close a Jira ticket by transitioning to "Won\'t Do" (or "Done") with a comment. Use when a ticket is a duplicate or no longer needed.',
  {
    key: z.string().describe('Jira ticket key to close, e.g. LS-1528'),
    confirm: z
      .literal(true)
      .describe('Must be set to true to confirm closure.'),
    reason: z
      .string()
      .optional()
      .describe(
        'Reason for closing. Defaults to "Closed via automation — duplicate or no longer needed."',
      ),
  },
  async (params) => deleteTicket(params),
);

// --- jira_get_bucket_epic ---
server.tool(
  'jira_get_bucket_epic',
  'Get the current bucket epic for "client-bugs" or "mcp-gaps" from Jira project property. Returns a JSON object with success, bucket, key, cached (boolean), and updatedAt (ISO string or null). Cached 5 minutes.',
  {
    bucket: z
      .enum(['client-bugs', 'mcp-gaps'])
      .describe('Which bucket epic to look up'),
  },
  async (params) => getBucketEpic(params),
);

// --- jira_set_bucket_epic ---
server.tool(
  'jira_set_bucket_epic',
  'Set the current bucket epic key for "client-bugs" or "mcp-gaps". Writes to Jira project property. Requires project admin credentials.',
  {
    bucket: z.enum(['client-bugs', 'mcp-gaps']),
    epicKey: z.string().describe('Jira issue key, e.g. "LS-2501"'),
  },
  async (params) => setBucketEpic(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
