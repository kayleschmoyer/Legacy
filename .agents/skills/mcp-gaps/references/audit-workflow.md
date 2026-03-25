# MCP Gap Audit — Detailed Workflow

After every agent session, review the Bash commands that were executed and determine which ones should have been (or could become) MCP tool invocations. For each identified gap, check whether a ticket already exists under the **LS-1455** epic ("AI Workspace Improvements") and create one if not.

This workflow also catches MCP tools that _were_ used but returned results too large for the context window — a silent productivity killer that wastes context on failed tool calls.

## Steps

### 1. Collect non-MCP commands from the session

Review the conversation history for all `Bash` tool invocations. Ignore:

- **Git commands** already covered by `worktree_*` MCP tools (e.g., `git -C $wt status` → `worktree_status`)
- **One-off investigative commands** (e.g., `ls`, `cat` for quick orientation) — these are not worth tooling. **Exception**: commands used during CI failure triage that have **no MCP equivalent** (e.g., `git show origin/branch:path` for remote ref:path reads, `git ls-tree`) are almost always recurring patterns, not one-offs — do NOT dismiss them. Commands that _do_ have MCP equivalents (e.g., `git diff` → `worktree_diff`, `git log` → `worktree_log`, `git show` for local commits → `worktree_show`) should be classified as `missing-awareness` rather than ignored
- **Commands with no realistic MCP equivalent** (e.g., interactive editors, ad-hoc `python -c` scripts)

Focus on commands that:

- Were used to accomplish a **repeatable workflow step** (build, test, deploy, query, migrate)
- Have an existing MCP server that _should_ cover them but doesn't
- Were run because the agent didn't know an MCP tool existed, or the MCP tool was missing a feature

#### Commonly dismissed but recurring patterns

These commands look "investigative" but represent repeatable workflows every agent will need:

- **Reading files on remote branches**: `git show origin/branch:path/to/file` — needed for CI triage, PR review, conflict investigation. `worktree_show` covers local commit objects; **remote ref:path reads are a gap** (ticket-worthy)
- **Listing files on remote branches**: `git ls-tree -r --name-only origin/branch -- path/` — needed for checking file existence, finding related files. **No MCP equivalent exists** (ticket-worthy)
- **Searching logs for error patterns**: `git log --grep="pattern"`, `git log --diff-filter=D -- path` — needed for investigating regressions. `worktree_log` covers standard log queries; **`--grep` and `--diff-filter` options may be a `missing-feature` gap** — check before filing
- **Comparing branches**: `git diff origin/main...origin/branch -- path` — needed for understanding PR scope. `worktree_diff` covers this — if the agent used raw `git diff` instead, classify as `missing-awareness`

### 2. Classify each command

For each candidate command, determine:

| Field               | Description                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell command**   | The exact command or pattern (e.g., `pnpm exec nx run <project>:test -- -u`)                                                                        |
| **Why it was used** | What the agent was trying to accomplish                                                                                                             |
| **MCP server**      | Which existing MCP server should own this (or "new server needed")                                                                                  |
| **Gap type**        | `missing-tool` (no tool exists), `missing-feature` (tool exists but lacks a flag/option), `missing-awareness` (tool exists but agent didn't use it) |

### 3. Filter out `missing-awareness` gaps

If the gap type is `missing-awareness` — the MCP tool already exists and is fully capable — this is a **skill/documentation issue**, not a tooling gap. Instead of creating a ticket:

- Note which AGENTS.md or skill doc failed to guide the agent to the right tool
- Consider whether a skill update or AGENTS.md clarification would fix it

### 4. Check for existing tickets under LS-1455

Search for child tickets of the **LS-1455** epic using one of these options:

- **Local-only (non-MCP) CLI** — if available on your machine:
  ```bash
  acli jira workitem search --jql "parent = LS-1455 ORDER BY created DESC"
  ```
- **Jira UI** — open Jira in the browser and run the same JQL in the search bar / advanced search:
  ```text
  parent = LS-1455 ORDER BY created DESC
  ```

Once you have the list of tickets, you can use the `jira_view` MCP tool on specific keys as needed to inspect details.

Scan summaries for matches. Common patterns in existing tickets:

- `feat(mcp): add <tool_name> ...`
- `MCP: add <tool_name> ...`
- `fix(mcp): <server>_<tool> ...`

### 5. Create tickets for new gaps

For each gap not already tracked, use the `jira_create_ticket` MCP tool:

- **Summary**: `feat(mcp): add <proposed_tool_name> to <server> for <purpose>`
- **Type**: `Task`
- **Parent**: `LS-1455`
- **Description** (template):

```
## Gap Identified

**Shell command observed**: `<command>`
**Agent intent**: <what the agent was trying to do>
**Gap type**: missing-tool | missing-feature

## Proposed MCP Tool

**Server**: <mcp-server-name>
**Tool name**: `<proposed_tool_name>`
**Parameters**: <key params and types>
**Returns**: <structured output description>

## Context

Identified during agent session on <date>.
<Any additional context about why this would improve agent workflows.>
```

### 6. Audit MCP tool result overflows

Review the conversation history for MCP tool calls that returned errors containing:

- `exceeds maximum allowed tokens`
- `Output has been saved to`

These overflows waste context — the agent pays for the request/response overhead but gets no usable data back. Retries or reading the saved file burn even more context.

For each overflow, record:

| Field           | Description                                                                     |
| --------------- | ------------------------------------------------------------------------------- |
| **MCP tool**    | Server and tool name (e.g., `legacy-sports-ci / ci_get_logs`)                   |
| **Params used** | The parameters that caused the overflow                                         |
| **Result size** | The character count from the error message                                      |
| **Root cause**  | Why the result was too large (no pagination, verbose output, large diff, etc.)  |
| **Fix type**    | `bad-default`, `missing-parameter`, or `agent-error` (see classification below) |

#### Classification

- **`agent-error`**: The tool has appropriate limiting parameters but the agent didn't use them or passed excessively large values (e.g., `limit: 100` when `limit: 10` suffices). This is a **skill/documentation issue** — update AGENTS.md or the relevant skill doc to guide agents toward safe defaults. Do not create a ticket.
- **`bad-default`**: The tool returns too much data when no limiting parameter is specified (e.g., `ci_get_logs` without `maxLines` returns the full log). Create a ticket to change the server-side default.
- **`missing-parameter`**: The tool has no way to limit output size — no pagination, no summary mode, no `maxResults` flag. Create a ticket to add the parameter.

#### Known `missing-awareness` patterns

These are **not tooling gaps** — the capability exists but agents commonly miss it. If you observe these during an audit, update the relevant skill doc rather than filing a ticket.

| Pattern                                                                         | Correct usage                                                            | Why it matters                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gh api graphql` used to resolve threads instead of MCP tool                    | Use `github_resolve_threads(threadIds: [...])`                           | Raw GraphQL calls bypass any repository-specific automation layered on top of the MCP tool. Using the MCP tool keeps thread resolution consistent and centralized.                                     |
| `gh api .../requested_reviewers` loop to request Copilot review on multiple PRs | Use `github_request_review(number: <PR#>)` — requests Copilot by default | The MCP tool exists but only handles one PR at a time. If you need bulk requests, a loop over the MCP tool is correct — but file a `missing-feature` ticket for batch support if >10 PRs are involved. |
| `gh pr checks` or `gh pr view --json mergeable` in a loop to check PR status    | Use `github_pr_batch_status(prNumbers: [...])`                           | Batched GraphQL call returns mergeable status, CI jobs, reviews, and unresolved threads for multiple PRs in one request. Eliminates N sequential API calls during sweeps.                              |
| Falling back to `gh` CLI for all GitHub operations when MCP auth expires        | Run `github_auth_status` first; if expired, refresh with `gh auth login` | When the GitHub MCP server's token expires, agents often fall back to `gh` CLI for the entire session. Check auth early and refresh — don't silently downgrade to CLI for every operation.             |

#### Known tooling gaps (file tickets under LS-1455)

These are recurring patterns where an MCP tool is **missing or incomplete**. If you observe these during an audit, check for an existing LS-1455 ticket before filing a new one.

| Pattern                                                                  | Gap type          | MCP server             | Notes                                                                                                                                                 |
| ------------------------------------------------------------------------ | ----------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh api repos/.../pulls/$pr/reviews` to check Copilot review status      | `missing-tool`    | `legacy-sports-github` | LS-1871 — No MCP tool for listing PR reviews or checking if Copilot has reviewed. Needed by sweep agents to determine which PRs need review requests. |
| Looping `github_request_review` over 10+ PRs                             | `missing-feature` | `legacy-sports-github` | LS-1872 — `github_request_review` handles one PR at a time. Batch variant would eliminate N API roundtrips during sweeps.                             |
| `worktree_push` fails on pre-push hook auto-amend, requires manual retry | `missing-feature` | `worktree`             | LS-1873 — Pre-push hook runs formatter, amends commit, aborts push. `worktree_push` should detect the abort pattern and auto-retry.                   |
| `worktree_set` crashes → agent falls back to raw `git -C` via Bash       | bug               | `worktree`             | LS-1874 — `worktree_set(identifier)` throws `Cannot read properties of undefined`. Blocks all worktree MCP tools, forcing raw git fallback.           |

#### Known high-frequency overflow patterns

| Tool                       | Frequency | Root cause                            | Typical fix                         |
| -------------------------- | --------- | ------------------------------------- | ----------------------------------- |
| `ci_get_logs`              | Very high | Full CI job logs without `maxLines`   | Enforce `maxLines` default          |
| `searchJiraIssuesUsingJql` | High      | Broad JQL without `maxResults`        | Add `maxResults` pagination         |
| `ci_search_logs`           | Medium    | Large log search results              | Limit result count or add filters   |
| `worktree_run`             | Medium    | Commands like `git diff` on lockfiles | Use `--stat` or `--name-only` flags |
| `ci_list_runs`             | Medium    | Listing many workflow runs            | Lower default `limit`               |
| `nx_run_affected`          | Low       | Verbose build/test output             | Summary mode or truncation          |
| `make_run`                 | Low       | Verbose build output                  | Summary mode                        |
| `github_list_prs`          | Low       | Large PR listings                     | Pagination or filters               |

For `missing-parameter` and `bad-default` gaps, follow Steps 4-5 to check for existing tickets and create new ones under LS-1455. Use this description template:

```
## Gap Identified — MCP Result Overflow

**MCP tool**: `<server> / <tool_name>`
**Parameters that caused overflow**: `<params>`
**Result size**: <N characters>
**Fix type**: missing-parameter | bad-default

## Proposed Fix

**Option A**: <e.g., add `maxResults` parameter with default of 20>
**Option B**: <e.g., server-side truncation with `truncated: true` flag>

## Impact

This tool overflowed <N> times in recent sessions, wasting agent context on each occurrence.
Identified during MCP overflow audit on <date>.
```

### 7. Report findings

Summarize the audit results to the user:

- Total Bash commands reviewed
- Commands identified as MCP gaps
- MCP tool overflows identified (with fix types)
- Existing tickets found (with keys)
- New tickets created (with keys)
- Any `missing-awareness` or `agent-error` issues noted (skill/doc fixes needed)

## Gotchas

- **Don't create duplicate tickets** — always search LS-1455 children first. Summaries may vary; match on the _underlying capability_, not exact wording.
- **Don't ticket one-off commands** — only commands that represent a repeatable pattern across sessions. **Heuristic**: ask "Would another agent triaging a different CI failure (or reviewing a different PR) need this same capability?" If yes, it's a repeatable pattern regardless of how simple or investigative it appears.
- **`missing-feature` vs `missing-tool`** — if a tool exists but needs a new parameter (e.g., `nx_run` lacking `--updateSnapshot`), that's `missing-feature`, not `missing-tool`. The ticket should reference the existing tool.
- **MCP server scope** — each server has a defined domain (see AGENTS.md MCP Servers table). Don't propose adding a git tool to the DB server.
- **Overflow != gap** — if the tool works fine with correct parameters, it's `agent-error`, not a tooling gap. Fix the docs, not the tool.
- **Third-party MCP tools** (e.g., `claude_ai_Atlassian`) — overflows in tools we don't control should still be documented. The fix is usually an `agent-error` doc update (guide agents to pass `maxResults`) since we can't change the server defaults.
