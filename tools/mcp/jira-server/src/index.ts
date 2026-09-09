import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { minifiedJson } from '@legacy-sports/mcp-format';
import { z } from 'zod';
import { addComment } from './tools/add-comment.js';
import { checkBlockers } from './tools/check-blockers.js';
import { createTicket } from './tools/create-ticket.js';
import { editTicket } from './tools/edit-ticket.js';
import { linkIssues } from './tools/link-issues.js';
import { getAllDescendants } from './tools/get-all-descendants.js';
import { listChildren } from './tools/list-children.js';
import { deleteTicket } from './tools/delete-ticket.js';
import { search } from './tools/search.js';
import { setParent } from './tools/set-parent.js';
import { consolidatedTransition } from './tools/transition.js';
import { view } from './tools/view.js';
import { bulkCreate } from './tools/bulk-create.js';
import { bulkEdit } from './tools/bulk-edit.js';
import { bulkLinkIssues } from './tools/bulk-link-issues.js';
import { bulkListChildren } from './tools/bulk-list-children.js';
import { getBucketEpic, setBucketEpic } from './tools/bucket-epic.js';
import { rolloverSync } from './tools/rollover-sync.js';
import { startWork } from './tools/start-work.js';
import { jiraKeysSchema, openPrsSchema } from './schemas.js';
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
      content: [{ type: 'text', text: minifiedJson(result) }],
    };
  },
);

// --- jira_check_blockers ---
server.tool(
  'jira_check_blockers',
  '3-way dependency check: STOP if blocker not ready, use blocker branch if In Review, base off main if Done/no blockers. ' +
    'Accepts up to 50 keys in one call — pass `keys` (or a comma-separated `key`) when filtering a dispatch batch, ' +
    'so one JQL round-trip replaces N per-ticket calls and no sub-agent is needed to sweep blockers. ' +
    'Batch form returns { total, unblocked: [key], blocked: [key], results: [{key, canProceed, blockers, recommendation}], notFound? }; ' +
    'a single `key` still returns the flat { canProceed, blockers, recommendation }. ' +
    'When you are already listing tickets, prefer jira_search / jira_list_children with includeBlockers: true — ' +
    'those annotate blockers with no extra request at all.',
  {
    key: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Ticket key to check. Also accepts an array or a comma-separated list (treated as a batch).',
      ),
    keys: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('Ticket keys to check in one call (1-50).'),
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
      .optional()
      .describe(
        'Issue type (default: Task). Pass "Epic" to create an Epic in one call. Accepts `issueType` as an alias.',
      ),
    issueType: z
      .enum(['Task', 'Bug', 'Story', 'Epic'])
      .optional()
      .describe(
        'Alias for `type`, accepted for agent compatibility. Prefer `type`.',
      ),
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
    .optional()
    .describe(
      'Issue type (default: Task). Pass "Epic" to create an Epic. Accepts `issueType` as an alias.',
    ),
  issueType: z
    .enum(['Task', 'Bug', 'Story', 'Epic'])
    .optional()
    .describe(
      'Alias for `type`, accepted for agent compatibility. Prefer `type`.',
    ),
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
        return JSON.parse(val) as unknown;
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
  'Update fields on a ticket. Provide at least one field. No transition side effects.',
  {
    key: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]+-\d+$/)
      .describe('Ticket key'),
    summary: z.string().optional().describe('New summary/title'),
    description: z.string().optional().describe('New description'),
    type: z
      .enum(['Task', 'Bug', 'Story', 'Epic'])
      .optional()
      .describe('Change issue type'),
    sprint: z
      .string()
      .regex(/^(?:current|\d+)$/)
      .optional()
      .describe('"current" for active sprint, or numeric sprint ID'),
    addLabels: z
      .array(z.string())
      .optional()
      .describe('Labels to add (additive — existing labels are preserved)'),
    removeLabels: z
      .array(z.string())
      .optional()
      .describe('Labels to remove (additive — other labels are preserved)'),
    assignee: z
      .union([z.string().email(), z.literal('')])
      .optional()
      .nullable()
      .describe(
        'Assignee email. Null/"" (with assigneeAccountId also empty) unassigns. Overridden by assigneeAccountId.',
      ),
    assigneeAccountId: z
      .string()
      .optional()
      .nullable()
      .describe(
        'Assignee accountId, no lookup. Null/"" (with assignee also empty) unassigns. Takes precedence over assignee.',
      ),
  },
  async (params) => editTicket(params),
);

// --- jira_bulk_edit ---
const bulkEditTicketSchema = z.object({
  key: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9_]+-\d+$/,
      'Must be a valid Jira issue key (e.g., LS-123)',
    )
    .describe('Ticket key to edit'),
  summary: z.string().optional().describe('New summary/title'),
  description: z.string().optional().describe('New description'),
  type: z
    .enum(['Task', 'Bug', 'Story', 'Epic'])
    .optional()
    .describe('Change issue type'),
  sprint: z
    .string()
    .regex(/^(?:current|\d+)$/)
    .optional()
    .describe('"current" for active sprint, or numeric sprint ID'),
  parent: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]+-\d+$/)
    .optional()
    .describe('Parent epic key (e.g. LS-1234)'),
  assignee: z
    .union([z.string().email(), z.literal('')])
    .optional()
    .nullable()
    .describe(
      'Assignee email. Null/"" (with assigneeAccountId also empty) unassigns. Overridden by assigneeAccountId.',
    ),
  assigneeAccountId: z
    .string()
    .optional()
    .nullable()
    .describe(
      'Assignee accountId, no lookup. Null/"" (with assignee also empty) unassigns. Takes precedence over assignee.',
    ),
});

server.tool(
  'jira_bulk_edit',
  'Edit up to 50 Jira tickets in one call. Each ticket must specify `key` plus at least one field ' +
    '(summary, description, type, sprint, parent, assignee, assigneeAccountId). Returns { total, succeeded, failed } ' +
    '— one ticket erroring never fails the whole batch. No transition side effects.',
  {
    tickets: z
      .array(bulkEditTicketSchema)
      .min(1)
      .max(50)
      .describe('Array of ticket edits (1-50).'),
  },
  async (params) => bulkEdit(params),
);

// --- jira_bulk_link_issues ---
server.tool(
  'jira_bulk_link_issues',
  'Create up to 50 issue links in one call. Same per-link contract as jira_link_issues — for "Blocks", inwardKey is blocked by outwardKey. linkType is case/typo-tolerant. Returns { total, succeeded, failed } — one link erroring never fails the whole batch.',
  {
    links: z
      .array(
        z.object({
          inwardKey: z
            .string()
            .regex(
              /^[A-Z][A-Z0-9_]+-\d+$/,
              'Must be a valid Jira issue key (e.g., LS-123)',
            )
            .describe(
              'The blocked ticket (reads inward phrase "is blocked by")',
            ),
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
        }),
      )
      .min(1)
      .max(50)
      .describe('Array of link specs (1-50).'),
  },
  async (params) => bulkLinkIssues(params),
);

// --- jira_bulk_list_children ---
server.tool(
  'jira_bulk_list_children',
  'List children of up to 50 parent tickets in one call — replaces N serial jira_list_children round-trips when scanning multiple epics/stories. This tool does not accept a page cursor: it returns only the first page per parent (capped by `limit`). When a parent has more children than `limit`, its `nextPageToken` is returned as a truncation signal — page that specific parent with single-item jira_list_children. Returns { total, succeeded: [{parent, count, children, nextPageToken?}], failed }.',
  {
    keys: z
      .array(
        z
          .string()
          .regex(
            /^[A-Z][A-Z0-9_]+-\d+$/,
            'Must be a valid Jira issue key (e.g., LS-123)',
          ),
      )
      .min(1)
      .max(50)
      .describe('Parent ticket keys (1-50).'),
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
      .describe('Max results per parent (default: 25, max: 100)'),
  },
  async (params) => bulkListChildren(params),
);

// --- jira_add_comment ---
server.tool(
  'jira_add_comment',
  'Post a comment to a Jira ticket. Use this instead of jira_edit_ticket when appending Implementation Notes or other additive content — comments do not overwrite the description and are not blocked by the destructive-overwrite permission classifier. Params: key, body (NOT "comment") — e.g. jira_add_comment({ key: "LS-1234", body: "..." }).',
  {
    key: z.string().describe('Ticket key (e.g. LS-1234)'),
    body: z
      .string()
      .min(1)
      .describe(
        'Comment body as plain text. Param name is "body", not "comment".',
      ),
  },
  async (params) => addComment(params),
);

// --- jira_link_issues ---
server.tool(
  'jira_link_issues',
  'Create a link between two tickets. For "Blocks": inwardKey is blocked by outwardKey. linkType is case/typo-tolerant.',
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
  'List child tickets of an epic or story. Paginated, default 25/page — pass pageToken for the next page. compact: true drops priority/created. paginate: true fetches all pages as JSON, capped at `limit` (cap 500).',
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
      .describe(
        'Max per page (default 25, max 100); also bounds the total with paginate: true.',
      ),
    pageToken: z
      .string()
      .optional()
      .describe('Cursor from a previous response to fetch the next page'),
    paginate: z
      .boolean()
      .optional()
      .describe(
        'Fetch all pages up to `limit` (cap 500) as { parent, total, children: [{key, summary, status}], truncated? }.',
      ),
    includeBlockers: z
      .boolean()
      .default(false)
      .describe(
        'Annotate every child with blocker state, no extra Jira request, instead of looping jira_check_blockers.',
      ),
    compact: z
      .boolean()
      .default(false)
      .describe(
        'Table mode: key/summary/status/type instead of full columns (mirrors jira_search compact).',
      ),
  },
  async (params) => listChildren(params),
);

// --- jira_get_all_descendants ---
server.tool(
  'jira_get_all_descendants',
  'Recursively traverse the ticket tree rooted at `key` and return all leaf-typed descendants ' +
    '(Task / Bug / Sub-task) in a single call. Container-typed tickets (Epic / Story) are used ' +
    'as traversal nodes only and are not included in the result. Blocker status is annotated ' +
    'inline on every result (blocked / blockers[]) — no separate jira_check_blockers calls needed. ' +
    'Use `status: "To Do"` to limit results to workable tickets. Use `unblockedOnly: true` to ' +
    'automatically exclude tickets with active (non-Done, non-In-Review) blockers. ' +
    'This replaces the manual two-level enumeration pattern: ' +
    'jira_list_children → per-container jira_list_children → parallel jira_check_blockers. ' +
    'Returns { root, total, descendants: [{key, summary, status, type, priority, blocked, blockers}], ' +
    'skipped: {byStatus, byBlockers}, errors?: [{key, error}] }.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-123)',
      )
      .describe('Root ticket key (Epic, Story, or any parent)'),
    status: z
      .string()
      .optional()
      .describe(
        'Filter leaf descendants by status (e.g. "To Do"). Omit to return all statuses.',
      ),
    unblockedOnly: z
      .boolean()
      .default(false)
      .describe(
        'When true, exclude leaf tickets that have active (non-Done, non-In-Review) blockers.',
      ),
    maxDepth: z.coerce
      .number()
      .int()
      .positive()
      .max(20)
      .default(10)
      .describe(
        'Maximum tree depth to traverse (default: 10, max: 20). Safety cap to prevent runaway traversal.',
      ),
  },
  async (params) => getAllDescendants(params),
);

// --- jira_search ---
server.tool(
  'jira_search',
  "Search Jira issues using JQL. Returns compact results (key, summary, status, type, assignee, priority) — no metadata blobs. Prefer this over Atlassian plugin search tools to avoid context overflow. Default maxResults is 15; raise only when you know the result set is small. Use compact=true for large result sets (e.g. listing all children of an epic) to get a minimal flat array of {key, summary, status} — typically under 2 KB for 50 issues. Pass fields to restrict the response to exactly those Jira fields (plus key) instead of the default/compact column set — unlike the Atlassian plugin's searchJiraIssuesUsingJql, this fields param is actually honored. When more pages exist, the response includes nextPageToken — pass it as pageToken to fetch the next page. Set includeBlockers=true to get blocker state inline instead of following up with per-ticket jira_check_blockers calls.",
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
        'When true, returns { issues: [{key, summary, status}], nextPageToken? } — no extra fields, envelope format. Use for large result sets like epic children to avoid context overflow. Ignored when fields is set.',
      ),
    pageToken: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Cursor token from a previous response nextPageToken to fetch the next page of results.',
      ),
    fields: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        'Restrict the response to exactly these Jira field names (plus key), overriding the default/compact column set. Each row renders one column per requested field.',
      ),
    includeBlockers: z
      .boolean()
      .default(false)
      .describe(
        'Annotate every row with blocker state: a `blocked` column (yes/no — yes when a blocker is neither Done nor In Review) and a `blockers` column listing non-Done blockers as LS-123(Status). Costs no extra Jira request — issuelinks rides along in the same search response. Use this instead of looping jira_check_blockers when filtering a dispatch batch. A row with blocked=no that still names an LS-x(In Review) blocker means: base the branch off LS-x, not main.',
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
// Hardcoded as a string literal (rather than `${COMMON_STATUSES.join(', ')}`)
// so the static docs extractor — which can't evaluate a cross-module .join()
// call — renders this literally instead of leaving an unresolved `${...}` in
// generated docs. Keep in sync with COMMON_STATUSES in ./tools/transition.js.
const COMMON_STATUSES_LABEL =
  "Backlog, To Do, In Progress, In Review, Done, Won't Do";
server.tool(
  'jira_transition',
  'Transition one or more tickets to a new status. Accepts a single key or an array (1-50). ' +
    `Any status the workflow exposes works (common: ${COMMON_STATUSES_LABEL}); ` +
    "the transition id is resolved dynamically from the issue's available workflow transitions, " +
    'and an actionable error listing the available targets is returned if the workflow disallows it. ' +
    'When using a single key, cascade=true auto-transitions open subtasks to Done. ' +
    "When action='claim' (single key, status='In Progress'), atomically validates blockers, " +
    'sets the assignee, and transitions to In Progress (returns action: PROCEED/STOP/' +
    'ALREADY_CLAIMED/PR_EXISTS/POSSIBLE_DUPLICATE). ' +
    'Returns `{ success, results: { [key]: { status?, error?, ... } } }`.',
  {
    keys: jiraKeysSchema.optional(),
    key: jiraKeysSchema.optional().describe('Deprecated: use `keys`.'),
    openPrs: openPrsSchema,
    status: z
      .string()
      .min(1)
      .describe(
        `Target status, resolved dynamically against the issue's available workflow transitions (common: ${COMMON_STATUSES_LABEL})`,
      ),
    action: z
      .enum(['transition', 'claim'])
      .default('transition')
      .describe(
        "'transition' (default): plain state change. 'claim': atomic blocker-check + assignee-set + transition to In Progress.",
      ),
    assignee: z
      .string()
      .email()
      .optional()
      .describe(
        "action='claim' only. Assignee email — pass the session's own JIRA_ASSIGNEE_EMAIL so the claim is " +
          'attributed to the caller, not the shared server default. Overridden by `assigneeAccountId`. ' +
          'Resolution caveats: .agents/skills/work-ticket/references/leaf-mode.md.',
      ),
    assigneeAccountId: z
      .string()
      .optional()
      .describe(
        "action='claim' only. Assignee accountId — assigned directly with no lookup, so it is the most " +
          'reliable path. Takes precedence over `assignee` and the JIRA_ASSIGNEE_* env vars.',
      ),
    cascade: z
      .boolean()
      .default(false)
      .describe(
        'Auto-transition open subtasks to Done (default: false). Only applies to single-key transitions.',
      ),
  },
  async (params) => {
    const keys = params.keys ?? params.key;
    if (keys === undefined) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Either `keys` or `key` is required.',
            }),
          },
        ],
      };
    }
    return consolidatedTransition({
      keys,
      status: params.status,
      action: params.action,
      cascade: params.cascade,
      assignee: params.assignee,
      assigneeAccountId: params.assigneeAccountId,
      openPrs: params.openPrs,
    });
  },
);

// --- jira_start_work ---
server.tool(
  'jira_start_work',
  'Semantic one-shot for Step 3 of the ticket spine ("Jira → In Progress"). ' +
    'Verifies state, resolves the In Progress transition id, transitions the ticket, ' +
    'and sets the assignee in a single call. Idempotent on already-In-Progress tickets ' +
    '(no-op success). Refuses Done tickets with an error. ' +
    'Returns { key, status, previousStatus, assignee, idempotent, warnings }. ' +
    'Assignee precedence: explicit `assigneeAccountId` > explicit `assignee` (email) > ' +
    'JIRA_ASSIGNEE_ACCOUNT_ID env var > JIRA_ASSIGNEE_EMAIL env var > authenticated ' +
    'service account. accountId-based paths are checked first because they need no ' +
    'lookup at all; email resolution falls back from /user/search to a JQL lookup ' +
    'that works under the hosted Lambda scopes (LS-9513). ' +
    "Prefer this over the four-call chain (jira_view → jira_view({ include: ['transitions'] }) → " +
    'jira_transition → assignee PUT) for the standard "start work" flow. Use ' +
    "jira_transition({ action: 'claim' }) when you also need blocker checks, child summaries, or branch " +
    'recommendations.',
  {
    key: z
      .string()
      .regex(
        /^[A-Z][A-Z0-9_]+-\d+$/,
        'Must be a valid Jira issue key (e.g., LS-1234)',
      )
      .describe('Ticket key to start work on'),
    assignee: z
      .string()
      .email()
      .optional()
      .describe(
        'Assignee email. Overridden by `assigneeAccountId`, which needs no lookup — prefer it when known.',
      ),
    assigneeAccountId: z
      .string()
      .optional()
      .describe(
        'Assignee Jira accountId — assigned directly with no lookup. Takes precedence over `assignee`.',
      ),
  },
  async (params) => startWork(params),
);

// --- jira_view ---
const includeOptionSchema = z.enum([
  'comments',
  'transitions',
  'blockers',
  'children',
]);

server.tool(
  'jira_view',
  'View ticket details. By default returns base fields only (summary, status, type, description, etc.). ' +
    'Pass `include` to fetch additional sub-resources in the same call — replaces the former jira_get_comments and jira_get_transitions tools. ' +
    'Single-key mode: pass `key` (and optionally `format`) to get a compact markdown card by default, or JSON with `format: "json"`. ' +
    'Batch mode: pass `keys` (1-50 ticket keys) to fetch all in one call; responses are `{ tickets: { [key]: <ticket-json> }, missing: [key, ...] }`. ' +
    'Exactly one of `key` or `keys` must be provided. ' +
    'include options: "blockers" (linked blocker issues), "children" (child issues via JQL), ' +
    '"comments" (all comments ordered by creation), "transitions" (available workflow transitions). ' +
    'Each include option that triggers an extra API call (comments, transitions, children) fires one request per key in parallel.',
  {
    key: z
      .string()
      .optional()
      .describe('Single ticket key (mutually exclusive with `keys`)'),
    keys: z
      .array(z.string())
      .min(1)
      .max(50)
      .optional()
      .describe(
        'Batch: 1-50 ticket keys. Returns { tickets: {[key]: <ticket>}, missing: [key,...] }. Mutually exclusive with `key`.',
      ),
    format: z
      .enum(['markdown', 'json'])
      .optional()
      .describe(
        'Output format for single-key mode. "markdown" (default) returns a compact card; "json" returns the structured shape. Ignored in batch mode.',
      ),
    include: z
      .array(includeOptionSchema)
      .optional()
      .describe(
        'Sub-resources to fetch alongside base fields. Omit for base fields only. ' +
          '"blockers": linked blockers. "children": child issues. "comments": all comments. "transitions": available workflow transitions.',
      ),
  },
  async (params) => {
    if (params.keys && params.key) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'jira_view: provide exactly one of `key` or `keys`, not both.',
          },
        ],
      };
    }
    const include = params.include;
    if (params.keys) return view({ keys: params.keys, include });
    if (params.key)
      return view({ key: params.key, format: params.format, include });
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'jira_view: must provide either `key` (single) or `keys` (batch, 1-50).',
        },
      ],
    };
  },
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
  'Get the current bucket epic for "client-bugs", "mcp-gaps", or "design-sync" from Jira project property. Returns a JSON object with success, bucket, key, cached (boolean), and updatedAt (ISO string or null). Cached 5 minutes.',
  {
    bucket: z
      .enum(['client-bugs', 'mcp-gaps', 'design-sync'])
      .describe('Which bucket epic to look up'),
  },
  async (params) => getBucketEpic(params),
);

// --- jira_set_bucket_epic ---
server.tool(
  'jira_set_bucket_epic',
  'Set the current bucket epic key for "client-bugs", "mcp-gaps", or "design-sync". Writes to Jira project property. Requires project admin credentials.',
  {
    bucket: z.enum(['client-bugs', 'mcp-gaps', 'design-sync']),
    epicKey: z.string().describe('Jira issue key, e.g. "LS-2501"'),
  },
  async (params) => setBucketEpic(params),
);

// --- jira_rollover_sync ---
server.tool(
  'jira_rollover_sync',
  'Manage Jira bucket-epic rollovers at sprint boundaries. ' +
    'mode="check" (default) reports project-property drift and stranded tickets (read-only); ' +
    'mode="sync" updates the bucket.client-bugs / bucket.mcp-gaps properties to the newest open epic, ' +
    're-parents stranded non-Done children, and closes the previous epic with a "Rolled over to" comment; ' +
    'mode="rollover" creates the new sprint epics (requires sprintName), then runs sync; ' +
    'mode="fix" re-parents stranded tickets only. ' +
    'Write modes require project-admin credentials. Replaces the former make jira-rollover-sync script.',
  {
    mode: z
      .enum(['check', 'sync', 'rollover', 'fix'])
      .default('check')
      .describe('Operation mode (default: check, read-only)'),
    sprintName: z
      .string()
      .optional()
      .describe(
        'Sprint name for mode="rollover" (e.g. "Sprint 8"). Required for rollover.',
      ),
  },
  async (params) => rolloverSync(params),
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
