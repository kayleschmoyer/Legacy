# Jira MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/jira-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

Ticket CRUD with guardrails, sprint assignment, blocker resolution, and epic descendant trees.

Available both locally (stdio) and via the hosted connector.

---

### `jira_add_comment`

Post a comment to a Jira ticket. Use this instead of jira_edit_ticket when appending Implementation Notes or other additive content — comments do not overwrite the description and are not blocked by the destructive-overwrite permission classifier. Params: key, body (NOT "comment") — e.g. jira_add_comment({ key: "LS-1234", body: "..." }).

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string | **required** | — | Ticket key (e.g. LS-1234) |
| `body` | string | **required** | min 1 | Comment body as plain text. Param name is "body", not "comment". |

### `jira_auth_status`

Check if Jira API credentials are configured. Call first in any Jira workflow. If false, use mcp__claude_ai_Atlassian__* instead.

_No parameters._

### `jira_bulk_create_tickets`

Create up to 50 Jira tickets in one call. Returns per-ticket success/failure. Use when filing multiple tickets (e.g. MCP gap audits, E2E coverage gaps) to avoid N serial API round-trips.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `tickets` | object[] | **required** | min 1, max 50 | Array of ticket objects to create. Each ticket must have a summary. Type defaults to Task. Pass sprint: "current" to add to the active sprint. |

### `jira_bulk_edit`

Edit up to 50 Jira tickets in one call. Each ticket must specify `key` plus at least one field (summary, description, type, sprint, parent, assignee, assigneeAccountId). Returns { total, succeeded, failed } — one ticket erroring never fails the whole batch. No transition side effects.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `tickets` | object[] | **required** | min 1, max 50 | Array of ticket edits (1-50). |

### `jira_bulk_link_issues`

Create up to 50 issue links in one call. Same per-link contract as jira_link_issues — for "Blocks", inwardKey is blocked by outwardKey. linkType is case/typo-tolerant. Returns { total, succeeded, failed } — one link erroring never fails the whole batch.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `links` | object[] | **required** | min 1, max 50 | Array of link specs (1-50). |

### `jira_bulk_list_children`

List children of up to 50 parent tickets in one call — replaces N serial jira_list_children round-trips when scanning multiple epics/stories. This tool does not accept a page cursor: it returns only the first page per parent (capped by `limit`). When a parent has more children than `limit`, its `nextPageToken` is returned as a truncation signal — page that specific parent with single-item jira_list_children. Returns { total, succeeded: [{parent, count, children, nextPageToken?}], failed }.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `keys` | string[] | **required** | min 1, max 50 | Parent ticket keys (1-50). |
| `status` | string |  | — | Filter by status (e.g. "To Do", "Done") |
| `limit` | number |  | coerced, integer, > 0, max 100 | Max results per parent (default: 25, max: 100) |

### `jira_check_blockers`

3-way dependency check: STOP if blocker not ready, use blocker branch if In Review, base off main if Done/no blockers. Accepts up to 50 keys in one call — pass `keys` (or a comma-separated `key`) when filtering a dispatch batch, so one JQL round-trip replaces N per-ticket calls and no sub-agent is needed to sweep blockers. Batch form returns { total, unblocked: [key], blocked: [key], results: [{key, canProceed, blockers, recommendation}], notFound? }; a single `key` still returns the flat { canProceed, blockers, recommendation }. When you are already listing tickets, prefer jira_search / jira_list_children with includeBlockers: true — those annotate blockers with no extra request at all.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string \| string[] |  | — | Ticket key to check. Also accepts an array or a comma-separated list (treated as a batch). |
| `keys` | string \| string[] |  | — | Ticket keys to check in one call (1-50). |

### `jira_create_ticket`

Create a Jira ticket with proper defaults.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `summary` | string | **required** | — | Ticket summary / title |
| `type` | enum |  | — | Issue type (default: Task). Pass "Epic" to create an Epic in one call. Accepts `issueType` as an alias. |
| `issueType` | enum |  | — | Alias for `type`, accepted for agent compatibility. Prefer `type`. |
| `description` | string |  | — | Ticket description |
| `context` | string |  | — | Why this work is being done — the user problem, business need, or technical debt that motivated the ticket |
| `risk` | string |  | — | Risk level (Low/Medium/High) with reasoning — e.g. "Medium — modifies business logic in 3 files" |
| `planningNotes` | string |  | — | Relevant files, constraints, and dependencies discovered during planning |
| `parent` | string |  | — | Parent epic key |
| `sprint` | string |  | — | "current" for active sprint, or numeric sprint ID |

### `jira_delete_ticket`

Close a Jira ticket by transitioning to "Won't Do" (or "Done") with a comment. Use when a ticket is a duplicate or no longer needed.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string | **required** | — | Jira ticket key to close, e.g. LS-1528 |
| `confirm` | "Must be set to true to confirm closure." | **required** | — | Must be set to true to confirm closure. |
| `reason` | string |  | — | Reason for closing. Defaults to "Closed via automation — duplicate or no longer needed." |

### `jira_edit_ticket`

Update fields on a ticket. Provide at least one field. No transition side effects.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string | **required** | — | Ticket key |
| `summary` | string |  | — | New summary/title |
| `description` | string |  | — | New description |
| `type` | enum |  | — | Change issue type |
| `sprint` | string |  | — | "current" for active sprint, or numeric sprint ID |
| `addLabels` | string[] |  | — | Labels to add (additive — existing labels are preserved) |
| `removeLabels` | string[] |  | — | Labels to remove (additive — other labels are preserved) |
| `assignee` | string \| "" |  | email | Assignee email. Null/"" (with assigneeAccountId also empty) unassigns. Overridden by assigneeAccountId. |
| `assigneeAccountId` | string |  | — | Assignee accountId, no lookup. Null/"" (with assignee also empty) unassigns. Takes precedence over assignee. |

### `jira_get_all_descendants`

Recursively traverse the ticket tree rooted at `key` and return all leaf-typed descendants (Task / Bug / Sub-task) in a single call. Container-typed tickets (Epic / Story) are used as traversal nodes only and are not included in the result. Blocker status is annotated inline on every result (blocked / blockers[]) — no separate jira_check_blockers calls needed. Use `status: "To Do"` to limit results to workable tickets. Use `unblockedOnly: true` to automatically exclude tickets with active (non-Done, non-In-Review) blockers. This replaces the manual two-level enumeration pattern: jira_list_children → per-container jira_list_children → parallel jira_check_blockers. Returns { root, total, descendants: [{key, summary, status, type, priority, blocked, blockers}], skipped: {byStatus, byBlockers}, errors?: [{key, error}] }.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string | **required** | — | Root ticket key (Epic, Story, or any parent) |
| `status` | string |  | — | Filter leaf descendants by status (e.g. "To Do"). Omit to return all statuses. |
| `unblockedOnly` | boolean |  | — | When true, exclude leaf tickets that have active (non-Done, non-In-Review) blockers. |
| `maxDepth` | number |  | coerced, integer, > 0, max 20 | Maximum tree depth to traverse (default: 10, max: 20). Safety cap to prevent runaway traversal. |

### `jira_get_bucket_epic`

Get the current bucket epic for "client-bugs", "mcp-gaps", or "design-sync" from Jira project property. Returns {success, bucket, key, cached, updatedAt, warning?}; warning = property lags newest open bucket epic. Cached 5m.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `bucket` | enum | **required** | — | Which bucket epic to look up |

### `jira_link_issues`

Create a link between two tickets. For "Blocks": inwardKey is blocked by outwardKey. linkType is case/typo-tolerant.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `inwardKey` | string | **required** | — | The blocked ticket (reads inward phrase "is blocked by") |
| `outwardKey` | string | **required** | — | The blocker ticket (reads outward phrase "blocks") |
| `linkType` | string | **required** | min 1 | Link type: "Blocks", "Relates", "Cloners", "Duplicate" |

### `jira_list_children`

List child tickets of an epic or story. Paginated, default 25/page — pass pageToken for the next page. compact: true drops priority/created. paginate: true fetches all pages as JSON, capped at `limit`.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string | **required** | — | Parent ticket key |
| `status` | string |  | — | Filter by status (e.g. "To Do", "Done") |
| `limit` | number |  | coerced, integer, > 0, max 500 | Page size (clamped to 100), or total cap with paginate: true (default 25, max 500). |
| `pageToken` | string |  | — | Cursor from a previous response to fetch the next page |
| `paginate` | boolean |  | — | Fetch all pages up to `limit` (cap 500) as { parent, total, children: [{key, summary, status}], truncated? }. |
| `includeBlockers` | boolean |  | — | Annotate every child with blocker state, no extra Jira request, instead of looping jira_check_blockers. |
| `compact` | boolean |  | — | Table mode: key/summary/status/type instead of full columns (mirrors jira_search compact). |

### `jira_rollover_sync`

Manage Jira bucket-epic rollovers at sprint boundaries. mode="check" (default) reports project-property drift and stranded tickets (read-only); mode="sync" updates the bucket.client-bugs / bucket.mcp-gaps properties to the newest open epic, re-parents stranded non-Done children, and closes the previous epic with a "Rolled over to" comment; mode="rollover" creates the new sprint epics (requires sprintName), then runs sync; mode="fix" re-parents stranded tickets only. Write modes require project-admin credentials. Replaces the former make jira-rollover-sync script.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `mode` | enum |  | — | Operation mode (default: check, read-only) |
| `sprintName` | string |  | — | Sprint name for mode="rollover" (e.g. "Sprint 8"). Required for rollover. |

### `jira_search`

Search Jira issues using JQL. Returns compact results (key, summary, status, type, assignee, priority) — no metadata blobs. Prefer this over Atlassian plugin search tools to avoid context overflow. Default maxResults is 15; raise only when you know the result set is small. Use compact=true for large result sets (e.g. listing all children of an epic) to get a minimal flat array of {key, summary, status} — typically under 2 KB for 50 issues. Pass fields to restrict the response to exactly those Jira fields (plus key) instead of the default/compact column set — unlike the Atlassian plugin's searchJiraIssuesUsingJql, this fields param is actually honored. When more pages exist, the response includes nextPageToken — pass it as pageToken to fetch the next page. Set includeBlockers=true to get blocker state inline instead of following up with per-ticket jira_check_blockers calls.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `jql` | string | **required** | — | JQL query string |
| `maxResults` | number |  | coerced, integer, > 0, max 50 | Max results (default: 15, max: 50) |
| `compact` | boolean |  | — | When true, returns { issues: [{key, summary, status}], nextPageToken? } — no extra fields, envelope format. Use for large result sets like epic children to avoid context overflow. Ignored when fields is set. |
| `pageToken` | string |  | min 1 | Cursor token from a previous response nextPageToken to fetch the next page of results. |
| `fields` | string[] |  | min 1 | Restrict the response to exactly these Jira field names (plus key), overriding the default/compact column set. Each row renders one column per requested field. |
| `includeBlockers` | boolean |  | — | Annotate every row with blocker state: a `blocked` column (yes/no — yes when a blocker is neither Done nor In Review) and a `blockers` column listing non-Done blockers as LS-123(Status). Costs no extra Jira request — issuelinks rides along in the same search response. Use this instead of looping jira_check_blockers when filtering a dispatch batch. A row with blocked=no that still names an LS-x(In Review) blocker means: base the branch off LS-x, not main. |

### `jira_set_bucket_epic`

Set the current bucket epic key for "client-bugs", "mcp-gaps", or "design-sync". Writes to Jira project property. Requires project admin credentials.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `bucket` | enum | **required** | — | — |
| `epicKey` | string | **required** | — | Jira issue key, e.g. "LS-2501" |

### `jira_set_parent`

Set or change the parent epic of a ticket via REST API.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string | **required** | — | Ticket key to update |
| `parent` | string | **required** | — | Parent epic key |

### `jira_start_work`

Semantic one-shot for Step 3 of the ticket spine ("Jira → In Progress"). Verifies state, resolves the In Progress transition id, transitions the ticket, and sets the assignee in a single call. Idempotent on already-In-Progress tickets (no-op success). Refuses Done tickets with an error. Returns { key, status, previousStatus, assignee, idempotent, warnings }. Assignee: `assigneeAccountId` > `assignee` > the signed-in caller (hosted) or JIRA_ASSIGNEE_* env / current user (local); refused before the transition if none resolves. Prefer this over the four-call chain (jira_view → jira_view({ include: ['transitions'] }) → jira_transition → assignee PUT) for the standard "start work" flow. Use jira_transition({ action: 'claim' }) when you also need blocker checks, child summaries, or branch recommendations.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string | **required** | — | Ticket key to start work on |
| `assignee` | string |  | email | Assignee email; defaults to the signed-in caller. Overridden by `assigneeAccountId`. |
| `assigneeAccountId` | string |  | — | Assignee Jira accountId — assigned directly with no lookup. Takes precedence over `assignee`. |

### `jira_transition`

Transition one or more tickets to a new status. Accepts a single key or an array (1-50). Any status the workflow exposes works (common: Backlog, To Do, In Progress, In Review, Done, Won't Do); the transition id is resolved dynamically from the issue's available workflow transitions, and an actionable error listing the available targets is returned if the workflow disallows it. When using a single key, cascade=true auto-transitions open subtasks to Done. When action='claim' (single key, status='In Progress'), atomically validates blockers, sets the assignee, and transitions to In Progress (returns action: PROCEED/STOP/ALREADY_CLAIMED/PR_EXISTS/POSSIBLE_DUPLICATE). Returns `{ success, results: { [key]: { status?, error?, ... } } }`.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `keys` | string \| string[] |  | min 1, max 50 | Ticket key (string) or array of ticket keys |
| `key` | string \| string[] |  | min 1, max 50 | Deprecated: use `keys`. |
| `openPrs` | object[] |  | — | action='claim' only. Open PRs the caller already found for this key (this server has no GitHub credentials and cannot look them up). When non-empty, claim returns 'PR_EXISTS' instead of 'PROCEED'. See .agents/skills/work-ticket/references/leaf-mode.md. |
| `status` | string | **required** | min 1 | Target status, resolved dynamically against the issue's available workflow transitions (common: Backlog, To Do, In Progress, In Review, Done, Won't Do) |
| `action` | enum |  | — | 'transition' (default): plain state change. 'claim': atomic blocker-check + assignee-set + transition to In Progress. |
| `assignee` | string |  | email | action='claim' only. Assignee email; defaults to the signed-in caller. Machine-token sessions must pass it (or `assigneeAccountId`) or the claim STOPs. See work-ticket leaf-mode.md. |
| `assigneeAccountId` | string |  | — | action='claim' only. Jira accountId, assigned with no lookup. Takes precedence over `assignee`. |
| `cascade` | boolean |  | — | Auto-transition open subtasks to Done (default: false). Only applies to single-key transitions. |

### `jira_view`

View ticket details. By default returns base fields only (summary, status, type, description, etc.). Pass `include` to fetch additional sub-resources in the same call — replaces the former jira_get_comments and jira_get_transitions tools. Single-key mode: pass `key` (and optionally `format`) to get a compact markdown card by default, or JSON with `format: "json"`. Batch mode: pass `keys` (1-50 ticket keys) to fetch all in one call; responses are `{ tickets: { [key]: <ticket-json> }, missing: [key, ...] }`. Exactly one of `key` or `keys` must be provided. include options: "blockers" (linked blocker issues), "children" (child issues via JQL), "comments" (all comments ordered by creation), "transitions" (available workflow transitions), "attachments" (attachment metadata, no extra call). Each include option that triggers an extra API call (comments, transitions, children) fires one request per key in parallel. Attachment mode: pass `attachment` (id, filename, or "latest") with `key` to get that attachment inline — image block for screenshots, text for text files. Use it on bug tickets whose only real description is a screenshot.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `key` | string |  | — | Single ticket key (mutually exclusive with `keys`) |
| `keys` | string[] |  | min 1, max 50 | Batch: 1-50 ticket keys. Returns { tickets: {[key]: <ticket>}, missing: [key,...] }. Mutually exclusive with `key`. |
| `format` | enum |  | — | Output format for single-key mode. "markdown" (default) returns a compact card; "json" returns the structured shape. Ignored in batch mode. |
| `include` | enum[] |  | — | Sub-resources to fetch alongside base fields. Omit for base fields only. "blockers": linked blockers. "children": child issues. "comments": all comments. "transitions": available workflow transitions. "attachments": attachment metadata. |
| `attachment` | string |  | — | Attachment id, filename, or "latest". With `key`, returns that attachment instead of the ticket card. |

