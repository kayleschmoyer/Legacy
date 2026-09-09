# Dev Process MCP Tool Catalog

> GENERATED FILE — DO NOT EDIT.
>
> Source: `tools/mcp/dev-process-server/src/{index,lambda}.ts`. Regenerate with 
> `make mcp-api-reference`; CI fails on drift (LS-9701 Tier 2, review pattern #48).
>
> For the interactive, filterable version of this same data across every
> server: [`docs/mcp/api-reference.html`](../../../../../docs/mcp/api-reference.html).

RFCs, ADRs, postmortems, test plans, reproduction capture, and cross-session continuation checkpoints.

Local stdio process only — not exposed as a hosted connector. 18 tools.

---

### `adr_create`

Scaffold the next-numbered ADR at docs/decisions/NNNN-<slug>.md. Idempotent — returns the existing path if it already exists.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `title` | string | **required** | min 1 | Noun-phrase title, e.g. "Use Apollo Client cache for normalized state" |
| `slug` | string | **required** | — | Short kebab-case slug, e.g. "apollo-cache" |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `adr_list`

List ADRs under docs/decisions/, optionally filtered by status.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `status` | enum |  | — | Filter by status (omit to list all) |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `adr_supersede`

Atomically supersede an ADR: update the old ADR status to "Superseded by ADR-<newNumber>" and link the new ADR.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `oldNumber` | string | **required** | — | Number of the ADR being superseded, e.g. "0001" or "1" |
| `newNumber` | string | **required** | — | Number of the new superseding ADR |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `continuation_post`

Post a structured continuation plan as a PR comment (requires GH_TOKEN or GITHUB_TOKEN). Returns the formatted body and, if posted, the comment URL.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `pr` | number | **required** | integer, > 0 | GitHub PR number |
| `inheritedFrom` | string | **required** | — | GitHub username of the previous author |
| `inheritedAtSha` | string | **required** | — | SHA of the last commit by the previous author |
| `currentState` | object | **required** | — | Current branch / CI / review state |
| `done` | string[] | **required** | — | Bullets of finished work |
| `todo` | string[] | **required** | — | Concrete remaining tasks |
| `openThreads` | object[] | **required** | — | Open review threads not yet addressed |
| `risks` | string[] | **required** | — | Risks or notes for the next reviewer |
| `plan` | string | **required** | — | 2–4 sentence narrative of how you will finish this |
| `resumedBy` | string |  | — | GitHub username of the new author (default: "agent") |

### `continuation_status`

Return the most recent continuation plan for a PR. Reads from GitHub PR comments (requires GH_TOKEN or GITHUB_TOKEN). Returns { found, body, commentUrl, commentId }.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `pr` | number | **required** | integer, > 0 | GitHub PR number |

### `postmortem_action_items`

Extract action items from one postmortem or all postmortems in docs/postmortems/. Returns rows from every "## Action items" table with owner, action, due date, and ticket.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string |  | — | Path to a single postmortem file (relative to repo root). Omit to scan all postmortems. |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `postmortem_create`

Scaffold a postmortem at docs/postmortems/YYYY-MM-DD-<slug>.md. Idempotent.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `date` | string | **required** | — | Incident start date, e.g. "2025-05-10" |
| `slug` | string | **required** | — | Short slug, e.g. "graphql-timeout" |
| `severity` | enum | **required** | — | Incident severity |
| `authors` | string[] | **required** | min 1 | GitHub usernames of authors (incident commander first) |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `postmortem_recent`

List postmortems from the last N days.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `days` | number | **required** | integer, > 0 | Number of days to look back |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `repro_capture`

Write a structured repro report to docs/repros/<ticket>.md and return the formatted content. Idempotent — overwrites any existing repro for the same ticket.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ticket` | string | **required** | — | Jira ticket key, e.g. "LS-1234" |
| `environment` | object | **required** | — | Environment details |
| `steps` | string[] | **required** | min 1 | Ordered reproduction steps |
| `expected` | string | **required** | — | Expected behavior |
| `actual` | string | **required** | — | Actual behavior (include error message or log line) |
| `frequency` | string | **required** | — | Reproduction frequency, e.g. "Always", "Sometimes (~30%)", "Once" |
| `firstSeen` | string |  | — | SHA, date, or version where first observed |
| `workaround` | string |  | — | Known workaround, or omit for "none" |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `repro_close_no_repro`

Write a structured "cannot reproduce" report to docs/repros/<ticket>.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ticket` | string | **required** | — | Jira ticket key, e.g. "LS-1234" |
| `attempted` | string[] | **required** | min 1 | Environments and configurations attempted |
| `hypotheses` | string[] | **required** | — | Hypotheses about why the original report might be real |
| `recommendation` | string | **required** | — | Next step, e.g. "request logs from reporter", "add observability and reopen", "close as not reproducible" |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `repro_replay`

Print the reproduction steps for a ticket in copy-pasteable form. Reads from docs/repros/<ticket>.md.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `ticket` | string | **required** | — | Jira ticket key, e.g. "LS-1234" |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `rfc_accept`

Accept an RFC: rename docs/rfcs/draft-<slug>.md → docs/rfcs/<ticket>-<slug>.md and set Status: Accepted.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string | **required** | — | Current RFC path, e.g. "docs/rfcs/draft-my-rfc.md" (relative to repo root) |
| `ticket` | string | **required** | — | Jira ticket key, e.g. "LS-1234" |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `rfc_create`

Scaffold a new RFC draft at docs/rfcs/draft-<slug>.md with all required sections. Idempotent — returns the existing path if the file already exists.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `slug` | string | **required** | — | Short kebab-case identifier, e.g. "migrate-draft-state" |
| `title` | string | **required** | min 1 | Verb-phrase title, e.g. "Migrate draft state to Postgres" |
| `ticket` | string |  | — | Jira ticket key to embed (optional, e.g. "LS-1234") |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `rfc_list_open`

List all open (Status: Draft) RFCs under docs/rfcs/.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `rfc_validate`

Validate an RFC file for required sections and return { valid, missingSections, brokenLinks }.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `path` | string | **required** | — | Path to the RFC file (relative to repo root or absolute), e.g. "docs/rfcs/draft-my-rfc.md" |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `testplan_coverage_check`

Check test plan coverage for a PR: returns { totalCases, automatedCases, manualCases, missingCases }. A "missing" case has no test file reference and no manual marker.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `pr` | number |  | integer, > 0 | GitHub PR number to read the body from |
| `path` | string |  | — | Local test-plan file path (relative to repo root or absolute) |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `testplan_diff`

Show test cases added or removed between two test-plan files or refs. Provide either two file paths (basePath / headPath) or two git refs (baseRef / headRef) and a common filePath.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `basePath` | string |  | — | Base test-plan file path (relative to repo root) |
| `headPath` | string |  | — | Head test-plan file path (relative to repo root) |
| `baseRef` | string |  | — | Base git ref (e.g. "main", "HEAD~1") |
| `headRef` | string |  | — | Head git ref (e.g. "HEAD") |
| `filePath` | string |  | — | File path relative to repo root, used when baseRef/headRef are provided |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

### `testplan_extract`

Extract structured test cases from a PR body or a test-plan file. Provide either pr (GitHub PR number) or path (local file path) — not both.

| Param | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `pr` | number |  | integer, > 0 | GitHub PR number to read the body from |
| `path` | string |  | — | Local test-plan file path (relative to repo root or absolute), e.g. "docs/test-plans/LS-1234.md" |
| `worktreePath` | string |  | — | Repo or worktree root (default: auto-detected) |

