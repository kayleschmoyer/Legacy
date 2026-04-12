# MCP Gap Audit — Detailed Workflow

After every agent session, review the Bash and PowerShell commands that were executed and determine which ones should have been (or could become) MCP tool invocations. For each identified gap, check whether a ticket already exists under the **current MCP gaps bucket epic** (get key via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`) and create one if not.

This workflow also catches two additional categories of MCP issues:

- **Overflows** — MCP tools that _were_ used but returned results too large for the context window (a silent productivity killer that wastes context on failed tool calls)
- **Failures** — MCP tools that were called but returned errors (403, path bugs, permission gaps), causing agents to fall back to Bash or PowerShell commands

## Steps

### 1. Collect Bash and PowerShell commands and MCP issues from the session

> **Start here**: `ci_audit_session_bash({ gapsOnly: true, includeMcp: true })` — this is the **first tool to call**. It auto-detects the current session and returns a frequency-table summary of Bash command usage, highlighting potential gaps. Do NOT manually parse session JSONL files — the tool does this natively and is faster.

**Primary method — parse session transcript** (recommended, survives context compaction):

```
ci_audit_session_bash({ includeMcp: true, gapsOnly: true })
```

This parses the current session's JSONL transcript file (parent + all subagents) and outputs every `Bash` tool invocation (Claude Code) with timestamps. **Current limitation:** `ci_audit_session_bash` and `scripts/audit-session-bash.py` do not yet extract `powershell` tool invocations (GitHub Copilot CLI) — review those separately via the manual fallback below. It auto-detects the current session by finding the most recently modified JSONL in the project's `~/.claude/projects/` directory. Pass `sessionId` to target a specific session. The tool returns structured JSON by default; use `gapsOnly: true` for the compact gap-focused text output shown above, or omit it if you want the full structured results.

**Shell fallback** — if the CI MCP server is unavailable: `python scripts/audit-session-bash.py --include-mcp --gaps-only`. Use `--session-id <uuid>` to target a specific session.

**Manual fallback / PowerShell collection** — review the conversation history for `powershell` tool invocations, and for any `Bash` invocations you need to recover from the still-visible transcript. JSONL parsing via `ci_audit_session_bash` / `scripts/audit-session-bash.py` is the recommended source for Claude Code `Bash` invocations, but those tools do **not** currently extract GitHub Copilot CLI `powershell` invocations. For `powershell`, manual conversation-history review is therefore the current collection method, with the important limitation that it only captures commands still in the context window — commands from before compaction will be missed.

Once you have the command list (from either method), filter out noise. Ignore:

- **Git commands** already covered by `worktree_*` MCP tools (e.g., `git -C $wt status` → `worktree_status`)
- **One-off investigative commands** (e.g., `ls`, `cat` for quick orientation) — these are not worth tooling. **Exception**: commands used during CI failure triage that have **no MCP equivalent** (e.g., `git show origin/branch:path` for remote ref:path reads, `git ls-tree`) are almost always recurring patterns, not one-offs — do NOT dismiss them. Commands that _do_ have MCP equivalents (e.g., `git diff` → `worktree_diff`, `git log` → `worktree_log`, `git show` for local commits → `worktree_show`) should be classified as `missing-awareness` rather than ignored
- **File listing/search via Bash** when a dedicated tool exists — `ls | tail`, `ls -1 | sort`, `find . -name "*.ts"` should use **Glob** (pattern matching, sorted by modification time). `ls` is fine for quick directory orientation, but when used to discover files by name/pattern or determine naming conventions (e.g., listing migrations to find the latest timestamp), Glob is the correct tool. Classify as `missing-awareness` if the agent used Bash instead
- **Commands with no realistic MCP equivalent** (e.g., interactive editors, ad-hoc `python -c` scripts)

**Do NOT ignore documented Bash/PowerShell exceptions.** AGENTS.md and skill docs sometimes document shell commands as accepted workarounds (e.g., "no Nx target equivalent", "shell fallback"). These are _acknowledged_ gaps, not permanent exemptions. The audit should still flag them as gaps (usually `missing-tool` or `missing-feature` as appropriate) so they get tracked and eventually closed. Add a note in the ticket description: `This is a documented exception in AGENTS.md/skill docs — filing to track closure.`

Focus on commands that:

- Were used to accomplish a **repeatable workflow step** (build, test, deploy, query, migrate)
- Have an existing MCP server that _should_ cover them but doesn't
- Were run because the agent didn't know an MCP tool existed, or the MCP tool was missing a feature
- Are documented as accepted Bash exceptions in AGENTS.md or skill docs (these represent known gaps worth tracking)

#### Commonly dismissed but recurring patterns

These commands look "investigative" but represent repeatable workflows every agent will need:

- **Reading files on remote branches**: `git show origin/branch:path/to/file` — needed for CI triage, PR review, conflict investigation. `worktree_show` covers local commit objects; **remote ref:path reads are a gap** (ticket-worthy)
- **Listing files on remote branches**: `git ls-tree -r --name-only origin/branch -- path/` — needed for checking file existence, finding related files. **No MCP equivalent exists** (ticket-worthy)
- **Searching logs for error patterns**: `git log --grep="pattern"`, `git log --diff-filter=D -- path` — needed for investigating regressions. `worktree_log` covers standard log queries; **`--grep` and `--diff-filter` options may be a `missing-feature` gap** — check before filing
- **Comparing branches**: `git diff origin/main...origin/branch -- path` — needed for understanding PR scope. `worktree_diff` covers this — if the agent used raw `git diff` instead, classify as `missing-awareness`
- **Listing files by pattern**: `ls -1 path/*.ts | tail -5`, `ls -1 path/ | sort` — needed for discovering naming conventions, finding latest files. The **Glob** tool handles this natively (returns files sorted by modification time) — classify as `missing-awareness`

### 1b. Collect non-MCP commands from subagent sessions

Subagent sessions contribute **more** shell commands than parent sessions in practice (87 git/ls/find commands from subagents vs 82 from parents across 60 audited sessions). If you had to use Step 1's manual conversation-history fallback, that review only captures parent-session commands still visible in the context window.

> **If you used `ci_audit_session_bash` in Step 1**, subagent commands are already included in the output (grouped by subagent source file). Skip the manual collection below and proceed to filtering.

**Manual fallback** — subagent transcripts live at `~/.claude/projects/<project-hash>/<sessionId>/subagents/*.jsonl`. These are Claude Code session logs only — GitHub Copilot CLI sessions are not stored here. Each JSONL line is a message object; Bash tool calls appear as:

```json
{
  "message": {
    "content": [
      { "type": "tool_use", "name": "Bash", "input": { "command": "..." } }
    ]
  }
}
```

**What to collect**: extract all `Bash` tool calls from subagent JSONL files for the current session (these are Claude Code sessions only — `powershell` invocations from Copilot CLI are not present in these files). Apply the same filtering rules as Step 1 (ignore one-off investigative commands, focus on repeatable patterns).

**Common subagent anti-patterns** (highest frequency first):

| Pattern                                                              | Correct tool                | Gap type            | Notes                                                 |
| -------------------------------------------------------------------- | --------------------------- | ------------------- | ----------------------------------------------------- |
| `find $wt -type f -name "*.tsx"` (56x across 60 sessions)            | Glob                        | `missing-awareness` | Subagents lack AGENTS.md context; see LS-1954         |
| `grep -rl "pattern" $wt/src/` (23x across 60 sessions)               | Grep                        | `missing-awareness` | Same root cause as `find`                             |
| `ls -1 $wt/path/` (8x across 60 sessions)                            | Glob                        | `missing-awareness` | Used to discover file naming patterns                 |
| `git -C .claude/worktrees/agent-* fetch` (15x across 60 sessions)    | worktree MCP (if supported) | `missing-feature`   | Ephemeral worktrees not supported by MCP; see LS-1953 |
| `git -C .claude/worktrees/agent-* checkout` (15x across 60 sessions) | worktree MCP (if supported) | `missing-feature`   | Same as above                                         |

**How to handle**:

- `missing-awareness` patterns in subagents → verify that parent agents include tool preference hints when spawning subagents (see AGENTS.md for tool preference guidance). If hints are missing, that's the fix — not a new ticket.
- `missing-feature` patterns (e.g., ephemeral worktree support) → follow Steps 4-5 to check/create tickets under the current bucket epic.
- If you can't access JSONL transcripts (e.g., cloud agent without filesystem access), note this in the audit report and skip to Step 2.

### 2. Classify each command

For each candidate command, determine:

| Field               | Description                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shell command**   | The exact command or pattern (e.g., `pnpm exec nx run <project>:test -- -u`) — note whether it was invoked via `Bash` or `powershell` tool          |
| **Why it was used** | What the agent was trying to accomplish                                                                                                             |
| **MCP server**      | Which existing MCP server should own this (or "new server needed")                                                                                  |
| **Gap type**        | `missing-tool` (no tool exists), `missing-feature` (tool exists but lacks a flag/option), `missing-awareness` (tool exists but agent didn't use it) |

### 3. File `missing-awareness` gaps as doc-fix tickets

If the gap type is `missing-awareness` — the MCP tool already exists and is fully capable — the fix is a **skill/documentation update**, not a code change. **Still create a ticket** so the fix is tracked:

- **Summary**: `docs(skills): <description of the awareness gap>`
- **Type**: `Task`
- **Parent**: the key returned by `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`
- **Description**: Note which skill doc or AGENTS.md section failed to guide the agent, and propose the specific doc update

Without a ticket, the same awareness gap recurs session after session because no one tracks or implements the doc fix. The ticket type is `Task` (not `Bug`) since the tool itself works correctly.

### 4. Check for existing tickets under the current bucket epic

Get the current bucket epic: `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` — use the returned key for `parent` in `jira_create_ticket` and for `jira_list_children`.

Search for child tickets using one of these options:

- **Local-only (non-MCP) CLI** — if available on your machine:
  ```bash
  acli jira workitem search --jql "parent = <currentBucketEpicKey> ORDER BY created DESC"
  ```
- **Jira UI** — open Jira in the browser and run the same JQL in the search bar / advanced search:
  ```text
  parent = <currentBucketEpicKey> ORDER BY created DESC
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
- **Parent**: the key returned by `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`
- **Description** (template):

```
## Gap Identified

**Shell command observed**: `<command>`
**Tool type**: Bash | powershell
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

> **If you ran `ci_audit_session_bash` with `includeMcp: true` and without `gapsOnly`**, MCP overflows and failures are already included in the output. Use that data here instead of manually reviewing conversation history. Note: the Step 1 example uses `gapsOnly: true` (compact text output) which omits `mcp_issues` — if you followed that example, re-run without `gapsOnly` (e.g. `ci_audit_session_bash({ includeMcp: true })`) to get the full structured results including overflow and failure data.

Review the conversation history (or tool output) for MCP tool calls that returned errors containing:

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

| Pattern                                                                                  | Correct usage                                                                                                                                                                                               | Why it matters                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gh api graphql` used to resolve threads instead of MCP tool                             | Use `github_resolve_threads(threadIds: [...])`                                                                                                                                                              | Raw GraphQL calls bypass any repository-specific automation layered on top of the MCP tool. Using the MCP tool keeps thread resolution consistent and centralized.                                     |
| `gh api .../requested_reviewers` loop to request Copilot review on multiple PRs          | Use `github_request_review(number: <PR#>)` — requests Copilot by default                                                                                                                                    | The MCP tool exists but only handles one PR at a time. If you need bulk requests, a loop over the MCP tool is correct — but file a `missing-feature` ticket for batch support if >10 PRs are involved. |
| `gh pr checks` or `gh pr view --json mergeable` in a loop to check PR status             | Use `github_pr_batch_status(prNumbers: [...])`                                                                                                                                                              | Batched GraphQL call returns mergeable status, CI jobs, reviews, and unresolved threads for multiple PRs in one request. Eliminates N sequential API calls during sweeps.                              |
| Falling back to `gh` CLI for all GitHub operations when MCP auth expires                 | Run `github_auth_status` first; if expired, refresh with `gh auth login`                                                                                                                                    | When the GitHub MCP server's token expires, agents often fall back to `gh` CLI for the entire session. Check auth early and refresh — don't silently downgrade to CLI for every operation.             |
| `sleep N && gh run view <runId> --json status,conclusion` polling loop to wait for CI    | Use `ci_wait_for_run({ runId: "<id>" })` — waits for completion up to its timeout; set `timeoutMs` for longer runs                                                                                          | `ci_wait_for_run` is the correct MCP tool. Sleep + polling wastes context window tokens on repeated shell round-trips. Get the run ID via `ci_list_runs({ branch: "<branch>", limit: 1 })` first.      |
| `sleep N && gh pr view <pr> --json statusCheckRollup` polling loop to check PR CI status | Use `ci_wait_for_run({ runId: "<id>", timeoutMs: <ms> })` after `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber })` delivers events when the workflow may run longer than the default timeout | Same root cause — `ci_wait_for_run` replaces both patterns, but it has a default timeout, so increase `timeoutMs` for longer workflows. The run ID comes from the CI event or from `ci_list_runs`.     |

#### Known tooling gaps (file tickets under the current bucket epic)

These are recurring patterns where an MCP tool is **missing or incomplete**. If you observe these during an audit, check for an existing ticket under the current bucket epic before filing a new one.

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

For `missing-parameter` and `bad-default` gaps, follow Steps 4-5 to check for existing tickets and create new ones under the current bucket epic. Use this description template:

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

### 6b. Audit MCP tool failures

Review the conversation history for MCP tool calls that returned errors — look for:

- **403 / "Resource not accessible by integration"** — permission-scoped failures
- **Path resolution errors** — `fatal: /`, `is outside repository`, `No worktree found`
- **500 / timeout / connection errors** — infrastructure failures (including `ETIMEDOUT`, `spawnSync` timeouts)
- **State loss** — tool succeeds but its side effects don't persist (e.g., `worktree_set` succeeds, then subsequent tools can't find the active worktree)
- **Unexpected empty results** — tool returns success but data is missing or malformed

These failures are distinct from overflows (Step 6) — the tool was invoked with correct parameters but failed at the server level. When tools fail silently, agents fall back to Bash or PowerShell commands, negating the MCP-first principle.

> **Do NOT dismiss failures as "environmental" or "known".** Every failure must be triaged and ticketed with an appropriate fix type (`permission-gap`, `bug`, `config-issue`, or `expected-limitation`). Timeouts, state loss, and silent errors all deserve tickets. Even if the failure seems intermittent or platform-specific, another agent will hit the same issue — file a ticket so it gets investigated. Always check for an existing ticket before filing, but never skip filing because the failure "seems like a one-off."

For each failure, record:

| Field          | Description                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------- |
| **MCP tool**   | Server and tool name (e.g., `legacy-sports-github / github_pr_scan`)                        |
| **Error**      | The error message or HTTP status                                                            |
| **Impact**     | What the agent did instead (e.g., fell back to 22 `gh` CLI commands via Bash or PowerShell) |
| **Root cause** | Why the tool failed                                                                         |
| **Fix type**   | `permission-gap`, `bug`, `config-issue`, or `expected-limitation` (see below)               |

#### Classification

- **`permission-gap`**: Tool works but the token lacks required scopes (e.g., 403 on GraphQL fields that need elevated permissions). Create a ticket to either add the permission or add graceful degradation.
- **`bug`**: Tool has a code defect that causes it to fail under certain conditions (e.g., path resolution generating `/` instead of the worktree path). Create a ticket with reproduction steps. Subtypes:
  - **`bug/timeout`**: Tool hangs or times out under specific conditions (e.g., `spawnSync ETIMEDOUT` when cleaning worktrees with independent node_modules). The tool needs a longer timeout, graceful fallback, or actionable error message.
  - **`bug/state-loss`**: Tool succeeds but its side effects don't persist (e.g., `worktree_set` reports success but subsequent tools can't find the active worktree). The state persistence mechanism is broken.
- **`config-issue`**: Tool needs a different setup to work (e.g., missing env var, wrong token type). This is usually a doc fix — update AGENTS.md or the relevant skill doc to guide agents toward correct configuration.
- **`expected-limitation`**: Tool correctly reports an unsupported operation (e.g., worktree tool refusing to push `main`). No ticket needed — the tool is working as designed.

#### Known broken/degraded tool patterns

These are recurring failure modes observed across sessions. If you encounter them during an audit, check whether a fix has already been shipped before filing a new ticket.

| Tool                     | Failure mode                                   | Fix type         | Notes                                                                                  |
| ------------------------ | ---------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `github_pr_scan`         | 403 on `mergeable`/`statusCheckRollup` fields  | `permission-gap` | Fixed in LS-1903 — falls back to light query in degraded mode                          |
| `github_resolve_threads` | 403 on workflow dispatch (recheck)             | `permission-gap` | Fixed in LS-1906 — downgraded from error to note                                       |
| `worktree_unstage`       | Path resolution generates `/` instead of path  | `bug`            | Fixed in LS-1904 — string-to-array normalization on `files` param                      |
| `worktree_stabilize`     | `make install` fails on symlinked worktrees    | `bug`            | Fixed in LS-1905 — skips install when symlink detected                                 |
| `github_manage_labels`   | Response serializes array param as string      | `bug`            | Fixed in LS-1907 — handles JSON-encoded array strings in preprocess                    |
| `worktree_set`           | Active state silently drops between tool calls | `bug/state-loss` | LS-1946 — `worktree_set` succeeds but subsequent tools report "No active worktree set" |
| `worktree_clean`         | Times out with `spawnSync ETIMEDOUT`           | `bug/timeout`    | LS-1947 — hangs when worktree has independent node_modules or file locks               |

For `permission-gap` and `bug` types, follow Steps 4-5 to check for existing tickets and create new ones under the current bucket epic. Use this description template:

```
## Gap Identified — MCP Tool Failure

**MCP tool**: `<server> / <tool_name>`
**Error observed**: `<error message>`
**Impact**: <what the agent fell back to, how many Bash/PowerShell commands resulted>
**Fix type**: permission-gap | bug | bug/timeout | bug/state-loss | config-issue

## Root Cause

<Why the tool failed — missing permission, code defect, etc.>

## Proposed Fix

**Option A**: <e.g., add graceful degradation with lighter query>
**Option B**: <e.g., request additional token permissions>

## Context

Observed during agent session on <date>.
<Reproduction steps if applicable.>
```

### 7. Report findings

Summarize the audit results to the user:

- Total Bash and PowerShell commands reviewed (broken down by tool type)
- Commands identified as MCP gaps
- MCP tool overflows identified (with fix types)
- MCP tool failures identified (with fix types)
- Existing tickets found (with keys)
- New tickets created (with keys)
- Any `missing-awareness` doc-fix tickets created (with keys)
- Any `agent-error` or `config-issue` items noted (report-only for this audit; typically addressed via follow-up `docs(skills):` documentation updates rather than new bucket epic gap tickets)

## Gotchas

- **Don't create duplicate tickets** — always search the current bucket epic's children first. Summaries may vary; match on the _underlying capability_, not exact wording.
- **Don't ticket one-off commands** — only commands that represent a repeatable pattern across sessions. **Heuristic**: ask "Would another agent triaging a different CI failure (or reviewing a different PR) need this same capability?" If yes, it's a repeatable pattern regardless of how simple or investigative it appears.
- **`missing-feature` vs `missing-tool`** — if a tool exists but needs a new parameter (e.g., `nx_run` lacking `--updateSnapshot`), that's `missing-feature`, not `missing-tool`. The ticket should reference the existing tool.
- **MCP server scope** — each server has a defined domain (see AGENTS.md MCP Servers table). Don't propose adding a git tool to the DB server.
- **Overflow != gap** — if the tool works fine with correct parameters, it's `agent-error`, not a tooling gap. Fix the docs, not the tool.
- **Third-party MCP tools** (e.g., `claude_ai_Atlassian`) — overflows in tools we don't control should still be documented. The fix is usually an `agent-error` doc update (guide agents to pass `maxResults`) since we can't change the server defaults.
