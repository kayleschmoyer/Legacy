# MCP Gap Audit — Detailed Workflow

After every agent session, run the automated audit to identify Bash commands that should be MCP tool invocations, and MCP tool overflows/failures that need fixes. File tickets under the **current MCP gaps bucket epic** (get key via `jira_get_bucket_epic({ bucket: 'mcp-gaps' })`).

## Quick Start

```
ci_audit_session_bash({ auditMode: true })
```

This produces a structured JSON report with:

- **Pre-classified gaps** with confidence scores (high/medium/low)
- **Draft Jira ticket summaries** ready to file
- **Noise filtering** (one-off investigative commands auto-excluded)
- **Overflow/failure triage** items for review

The tool is Node-native (LS-8316) — it needs no Python interpreter and works in every environment (local Windows, cloud Linux, hosted server). If the hosted `legacy-sports-ci` MCP server is _unavailable_, fix that connection (see [diagnostics.md](diagnostics.md)). If it is connected but **cannot read your transcript** — the CCR case, where it runs in a different container/namespace — use the local CLI: [run the audit locally](#when-the-server-cannot-see-the-transcript-ccr-run-the-audit-locally) (LS-8890).

**`legacy-sports-ci-local` (the stdio server that hosts `ci_audit_session_bash` locally) reporting `CONNECTION_CLOSED`/never connecting for the whole session is a third, common case, not a variant of "server unavailable, go fix it" above** — go straight to the same local-CLI fallback, do not retry `ToolSearch` for the tool or wait for the server to come back. This is a recurring pattern (20+ sessions, [LS-10099](https://bkrupa.atlassian.net/browse/LS-10099); root-caused per-server in [LS-10125](https://bkrupa.atlassian.net/browse/LS-10125) — see [diagnostics.md](diagnostics.md#legacy-sports-ci-local-and-stripe-connection_closed-as-a-two-server-only-cohort-distinct-repo-side-per-entry-causes-ls-10125)) confirmed **not** to block the audit at all: `make audit-session ARGS="--auditMode"` (via `make_run`: `variables: "ARGS=--auditMode"`, no inner quotes) runs the identical `auditSessionBash` implementation in your own process and needs no MCP server connection whatsoever — it produces the full pre-classified report every time, server up or down. The accurate framing for this case is "blocked via MCP, reachable via `make audit-session`," not "gap audit blocked."

> **Pass `sessionToolNames` so `gh pr *`/`gh run *` etc. are classified accurately (LS-9749).** The tool's coverage table pre-classifies these Bash commands as `covered` by `github-mcp`/`ci-mcp` on prefix match alone — it has no visibility into whether that server's tools were actually present in your session. If `legacy-sports-github` was absent for this session (see the [absent-hosted-connector cases](auth-and-routing.md#jira-github-hosted-servers-absent-in-ccr-ls-9576)), every `gh pr *` fallback command gets silently filed under `informational.covered_commands` instead of surfacing as the real gap it is. Pass your session's current tool-name list (the deferred-tools listing, or a `ToolSearch` result) as `sessionToolNames` and any command whose "covering" server isn't actually in that list is reclassified as a real gap (`expected_mcp_tool` + a note explaining why), not silently dropped: `ci_audit_session_bash({ auditMode: true, sessionToolNames: [...] })`.

## Steps

### 1. Run the audit

Call `ci_audit_session_bash({ auditMode: true })`. The tool:

- Parses the full JSONL transcript (parent + all subagents)
- Classifies every Bash command as `covered` (has MCP equivalent), `gap` (needs a ticket), or `noise` (one-off investigative)
- Pre-classifies gaps into `missing-tool`, `missing-feature`, or `missing-awareness` with confidence scores
- Generates draft ticket summaries
- Includes MCP overflows and failures

**Current limitation:** Does not extract `powershell` tool invocations from Copilot CLI transcripts — review those separately in conversation history.

### 2. Review the report

The report has an `action_required` section with:

| Section                | What to do                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `gaps_auto_classified` | High-confidence gaps — accept unless you disagree                                      |
| `gaps_to_review`       | Medium/low-confidence gaps — verify gap_type and draft_summary                         |
| `overflows`            | Classify fix_type as `agent-error`, `bad-default`, or `missing-parameter`              |
| `failures`             | Classify fix_type as `permission-gap`, `bug`, `config-issue`, or `expected-limitation` |

The `informational` section shows `noise_filtered` (auto-skipped commands) and `covered_commands` (already have MCP tools) for transparency.

> **The pre-classifier does not apply the consolidation gate.** It classifies by whether _any_ MCP tool covers the command, not by whether an _existing_ tool could absorb it as an action. Treat every `missing-tool` it hands you — including high-confidence ones in `gaps_auto_classified` — as unverified until you run Step 3a.

### 3. Check for existing tickets

Before creating new tickets, check for existing ones:

```
jira_list_children(key: <currentBucketEpicKey>)
```

Match on underlying capability, not exact wording.

### 3a. Apply the consolidation gate (required for every `missing-tool`)

This audit loop is the only feedback mechanism on our MCP tool surface, and every gap type it knows resolves to "write more tool". That is why the surface grew 81 tools (April 2026) → 173 (June) → 219 (August) with no net removal, reaching ~89,250 tokens of definitions that every session pays whether or not it calls them.

For each proposed `missing-tool`, answer:

> Could this be an `action` value, or an optional param, on an existing tool in the same server?

1. **Look at the siblings first.** Search `docs/mcp/api-reference.html`, or grep the target server's `src/tools/`. A gap whose natural name shares a domain prefix with an existing tool (`ci_*`, `worktree_*`, `github_pr_*`) is a strong signal it belongs _on_ that tool.
2. **Yes** → reclassify as `missing-feature` before filing. Name the tool it should extend.
3. **No** → `missing-tool` stands. Record which tools you considered and why the schemas are incompatible.

**Escape hatch, deliberately:** forcing unrelated operations into one tool yields a wide union of mutually-exclusive optional params, which costs more than two tools and validates nothing. If more than roughly half the params would be action-scoped, keep them separate. See the union-schema anti-pattern in [mcp-tool-consolidation.md](../../create/references/mcp-tool-consolidation.md).

### 4. Create tickets for approved gaps

For each approved gap, use `jira_create_ticket`:

- **Summary**: Use the `draft_summary` from the report (or edit it)
- **Type**: `Task`
- **Parent**: current bucket epic key

Description template:

```
## Gap Identified

**Shell command observed**: `<sample from report>`
**Gap type**: <gap_type from report>
**Confidence**: <confidence from report>

## Proposed MCP Tool

**Server**: <server from report>
**Consolidation gate**: considered <existing tools>; not viable because <reason>.

## Context

Identified during automated audit on <date>.
```

The **Consolidation gate** line is mandatory on every `missing-tool` ticket (Step 3a). A `missing-tool` ticket without it is not ready to implement — triage sends it back through the gate.

For `missing-feature` gaps that came out of the gate, name the tool to extend and the proposed `action` value or param.

For `missing-awareness` gaps, the description should note which skill doc or AGENTS.md section needs updating.

### 5. Classify overflows and failures

For **overflows** in the report:

- **`agent-error`**: Tool has limiting params but agent didn't use them — update docs, no ticket
- **`bad-default`**: Tool returns too much without limits — file ticket to change server default
- **`missing-parameter`**: Tool has no way to limit output — file ticket to add the parameter

For **failures**:

- **`permission-gap`**: Token lacks scopes — file ticket for permission or graceful degradation
- **`bug`** / **`bug/timeout`** / **`bug/state-loss`**: Code defect — file ticket with repro steps
- **`config-issue`**: Wrong setup — doc fix only
- **`expected-limitation`**: Working as designed — no ticket

### 6. Report findings

Summarize to the user:

- Total commands reviewed
- Gaps found (with ticket keys)
- Overflows/failures classified
- Noise auto-filtered

## When the server cannot see the transcript (CCR): run the audit locally

**In a Claude Code Remote (CCR) session, go straight here — do not retry the
MCP tool and do not hand-roll the audit.** The ci MCP server process runs in a
different container/user namespace than your Bash tool: the transcript is real
and readable by _you_ (e.g. root-owned, mode `0700`, under
`/root/.claude/projects/<slug>/`), but no path you can name is visible to the
_server_, so neither auto-detection nor an explicit `projectsDir` override can
ever succeed. LS-8867 / LS-9268 / LS-9458 / LS-9538 each narrowed the server's
path search and each confirmed this; eight recorded sessions then fell back to
a fully manual Phase 1 (LS-8890, LS-9196, LS-9200).

The fix (LS-8890) moves the process boundary instead of the path: the same
`auditSessionBash` implementation also ships as a local CLI, run in _your_
namespace, where the transcript is readable.

```bash
make audit-session ARGS="--auditMode"
```

Via MCP instead of Bash, use `make_run({ target: "audit-session", variables: "ARGS=--auditMode" })` — no inner quotes: the quotes above exist only for the shell, and `make_run`'s `VARIABLE_PATTERN` (`run-target-utils.ts`) rejects `"` with `Invalid variable format` (LS-10248).

It prints the identical report `ci_audit_session_bash({ auditMode: true })`
would have — same pre-classification, same draft summaries, same subagent
coverage — so continue from [Step 2](#2-review-the-report) unchanged. Pass any
of the tool's params as flags (`--gapsOnly`, `--scanScratch`, `--sessionId`,
`--project`, `--pid`, `--sessionToolNames a,b`); `--auditMode` is the default
when `ARGS` is omitted. Pass `--sessionToolNames` here for the same reason you
would pass `sessionToolNames` to the tool (LS-9749).

Equivalent direct invocation, if `make` is unavailable:

```bash
node .github/copilot/hooks/mcp-bootstrap.mjs node --import tsx \
  tools/mcp/ci-server/src/cli/audit-session-bash-cli.ts --auditMode
```

(The `mcp-bootstrap.mjs` wrapper only sets `TSX_TSCONFIG_PATH` so the
workspace `@legacy-sports/*` path aliases resolve — it starts no server.)

## Manual fallback when neither the tool nor the local CLI works

`ci_audit_session_bash` resolves the Claude projects directory from `$HOME`
(falling back to `node:os` `homedir()`, then an explicit `projectsDir`
override) — see `findClaudeProjectsDir` in
`tools/mcp/ci-server/src/session-files.ts`. In some Claude Code Remote (CCR)
topologies the MCP server process runs under a different user/mount
namespace than the agent's own Bash tool: a transcript path the agent can
`ls` directly is still invisible to the server, so even an explicit
`projectsDir` override fails (LS-9458, a recurrence of LS-8867). The tool
detects this case and raises an actionable error naming it, rather than the
generic "Could not find" message, and every such error now names the
`make audit-session` recovery above (LS-8890). There is no code-level fix that
lets the _server_ read a transcript in another namespace — the fix is to not
route the read through the server at all.

`findClaudeProjectsDir` also distinguishes _why_ a candidate is unreadable
(LS-9538): when the directory exists but the server process's OS user lacks
permission to read it (`EACCES` — e.g. a `0700` root-owned
`~/.claude/projects` while the server runs as a sandboxed user), the error
says "permission denied, not not-found" instead of the generic message. That
wording means no `projectsDir` value will fix it — stop retrying path
variations and go straight to a fallback below.

**A local Windows session against a hosted/remote `legacy-sports-ci` MCP
server process is a structurally different failure (LS-9362)**: there, the
server and client share no filesystem or mount namespace at all — the
transcript lives at e.g. `C:\Users\<user>\.claude\projects\...` on the
client, and the server's own `$HOME`/`os.homedir()` can never resolve to
that path no matter what `projectsDir` value is passed. For this case, skip
straight to the `transcriptContent` param instead of retrying path
variations:

1. Read your own transcript JSONL directly, e.g. `Read` or `Bash cat` on
   `~/.claude/projects/<slug>/<sessionId>.jsonl` (or the Windows-native path
   under `%APPDATA%\Claude\projects\...`).
2. Pass its contents straight through: `ci_audit_session_bash({ auditMode:
true, transcriptContent: "<the JSONL text>" })`. This bypasses
   `findClaudeProjectsDir`/`resolveProjectSlug`/session-file discovery
   entirely — no server-side path resolution is involved.
3. Subagent transcripts are not included this way (only the one file you
   pass is parsed) — upload each subagent JSONL separately with its own call
   if subagent coverage matters for this session's audit, or accept parent-
   only coverage and note the gap in your summary.

When neither `projectsDir` nor `transcriptContent` gets you a working audit
(e.g. the CCR cross-container case where the server can't read _any_
directory you point it at, LS-9458/LS-9538):

1. Run `make audit-session ARGS="--auditMode"` (above; via `make_run` pass `variables: "ARGS=--auditMode"` with no inner quotes) — this is the supported
   recovery for that exact case, and it does not involve the server at all.
   Only if it too fails, continue:
2. Confirm the transcript exists from the agent's own Bash tool (`ls -la
~/.claude/projects/<slug>/`) — if it's actually absent, that's a
   different bug, not this one.
3. If it exists but neither the tool nor the CLI can read it, do the Phase 1
   gap review by hand: read back through the session's own Bash tool-call
   history (visible in the transcript already loaded into context) and
   classify commands per the [Steps](#steps) above, instead of via the
   automated report.
4. File (or comment on) an MCP gap ticket for the specific recurrence —
   check `jira_list_children` on the current MCP gaps bucket epic first so
   repeat CCR-namespace occurrences land as comments on one ticket rather
   than duplicates.

## Gotchas

- **Don't create duplicate tickets** — always search the bucket epic's children first
- **Don't ticket one-off commands** — the script filters these, but verify if uncertain
- **`missing-feature` vs `missing-tool`** — if a tool exists but needs a new parameter or `action` value, that's `missing-feature`. This is the single most common misclassification; the pre-classifier gets it wrong because it only checks whether _any_ tool already covers the command, not whether an existing tool _could_ absorb it. Run the [consolidation gate](#3a-apply-the-consolidation-gate-required-for-every-missing-tool) on every one.
- **A new tool is the expensive way to add a capability** — it re-pays name, description, and full input schema (~349 tokens on average, and schemas cost ~2× descriptions). An `action` value on an existing tool reuses all of it.
- **`redundant-tool` is a real finding** — if the audit surfaces two tools doing nearly the same thing, or a tool superseded by another but still registered, file it. Resolution is consolidate + **deregister**; see [mcp-tool-consolidation.md](../../create/references/mcp-tool-consolidation.md)
- **Overflow != gap** — if the tool works with correct params, fix docs not the tool
- **Documented exceptions still count** — patterns marked as "shell fallback" in AGENTS.md are tracked gaps, not permanent exemptions

## Known Recurring Patterns

These are pre-classified by the script at high confidence:

| Pattern                                                    | Gap type            | Reason                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git show origin/...`                                      | `missing-tool`      | Remote ref:path reads have no MCP equivalent                                                                                                                                                                                                                                                                                                                                                |
| `git ls-tree`                                              | `missing-tool`      | Listing files on remote branches has no MCP equivalent                                                                                                                                                                                                                                                                                                                                      |
| `find . -name "*.ext"` / `find $wt -name "*.ext"`          | `missing-awareness` | Use `Glob(pattern: "**/*.ext")` instead — purpose-built for file pattern matching: faster, results sorted by modification time, no shell spawning, cleaner permission prompt. Substitution: `find . -name "*.tsx"` → `Glob(pattern: "**/*.tsx")`. Listed in AGENTS.md and mcp-first/SKILL.md substitution table.                                                                            |
| `grep -r` / `grep -rl`                                     | `missing-awareness` | Should use Grep tool                                                                                                                                                                                                                                                                                                                                                                        |
| `sleep N && gh pr checks <pr>` loop                        | `missing-awareness` | Claude Code surfaces PR events natively — no polling loop needed. After `worktree_push()`, CI results and review events arrive automatically. See pr-lifecycle SKILL.md Rule 9. Available even when CI server is not loaded, because native event streaming does not depend on any MCP server.                                                                                              |
| `Glob(pattern: "<known exact single-file path>")`          | `missing-awareness` | For a path you already know (not a pattern to discover), use `Read(file_path: "...")` instead — it opens the path directly with no tree walk, so it can't hit the ripgrep 20s budget this monorepo's `node_modules`-heavy file count is prone to triggering (LS-8420). Reserve `Glob` for genuine pattern discovery. See mcp-first/SKILL.md "Glob/ripgrep timeout on cloud/Linux sessions". |
| `sed -n 'A,Bp' <file>` / `tail -N <file>` / `wc -l <file>` | `missing-awareness` | Use `Read(file_path: "...", offset:, limit:)` instead — these are collapsed to one canonical pattern per command family (regardless of range/count/path) and pre-classified high-confidence, since a session doing this repeatedly on different files/ranges would otherwise flood `gaps_to_review` with one near-duplicate row per invocation (LS-8778).                                   |

**Auto-mode carve-out (LS-9755):** the four FILE-READ/GREP-class rows above (`find`, `grep -r`/`grep -rl`, `sed -n`/`tail`/`wc -l`) are the exact set the harness's "auto mode" directive sanctions Bash for — see the boundary explained in `mcp-first/SKILL.md`. When `ci_audit_session_bash`'s `auditMode` detects that directive in the transcript, it excludes these four rows from `action_required` and lists them under `informational.auto_mode_excluded` instead (`summary.auto_mode_active` / `summary.auto_mode_excluded` record the decision). Do not manually re-file them as `missing-awareness` gaps when the report already shows `auto_mode_active: true` — that was the false-positive class this fix removed (41/64 findings in one sampled audit before the fix). The `git show origin/...` and `git ls-tree` `missing-tool` rows are unaffected — they're domain gaps, not file-read/search, and the carve-out never touches them.

## Known High-Frequency Overflow Patterns

| Tool                       | Frequency | Root cause                                                                                                                                                                                                                                  | Fix                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci_get_logs`              | Very high | Full logs without `maxLines`                                                                                                                                                                                                                | Enforce `maxLines` default                                                                                                                                                                                                                                                                                                                                                                           |
| `searchJiraIssuesUsingJql` | High      | `maxResults` omitted or set too broad, **and** the Atlassian plugin's `fields` param is non-functional — it does not restrict the response even when passed a narrow list (LS-8983); every issue still costs ~3.8 KB regardless of `fields` | Always pass explicit `maxResults` (e.g. `1` for single-issue lookups). Passing `fields` to `searchJiraIssuesUsingJql` does **not** shrink the response — do not rely on it. For any query returning more than a couple of issues, use `jira_search(compact: true)` (or `fields: [...]`, which the custom tool actually honors, LS-9237) or `jira_list_children` instead of the plugin tool (LS-9233) |
| `worktree_run`             | Medium    | `git diff` on lockfiles                                                                                                                                                                                                                     | Use `--stat` or `--name-only`                                                                                                                                                                                                                                                                                                                                                                        |

## Known Resolved `worktree_run` Anti-Patterns

Operations that were previously routed through `worktree_run` but now have dedicated tools. Flag these as `missing-awareness` if observed in a session transcript.

| Pattern                                                       | Dedicated tool                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| `worktree_run(command: "git stash")`                          | `worktree_stash({ message? })`                                  |
| `worktree_run(command: "git stash pop")`                      | `worktree_stash_pop()`                                          |
| `worktree_run(command: "git rm <file>")`                      | `worktree_rm({ path: "<file>" })`                               |
| `worktree_run(command: "git reset HEAD -- <files>")`          | `worktree_unstage({ files: ["<file>"] })`                       |
| `worktree_run(command: "git ls-files <path>")`                | `worktree_is_tracked({ paths: ["<path>"] })`                    |
| `worktree_run(command: "git check-ignore <path>")`            | `worktree_check_ignore({ paths: ["<path>"] })`                  |
| `worktree_run(command: "git ls-files -s <path>")`             | `worktree_file_mode({ paths: ["<path>"] })`                     |
| `worktree_run(command: "git update-index --chmod=+x <path>")` | `worktree_set_executable({ path: "<path>", executable: true })` |
| `worktree_run(command: "git fetch origin")`                   | `worktree_fetch()`                                              |
| `worktree_run(command: "git fetch origin <branch>")`          | `worktree_fetch({ branch: "<branch>" })`                        |
| `worktree_run(command: "git push --set-upstream ...")`        | `worktree_push({ setUpstream: true })`                          |
| `worktree_run(command: "git fetch && git merge-base ...")`    | `worktree_fetch()` then `worktree_run` for merge-base           |

**Remaining legitimate `worktree_run` uses** (no dedicated tool exists; do NOT flag these):

- `git merge-base <ref1> <ref2>` and `git merge-base --is-ancestor <ref1> <ref2>`
- `git cherry-pick <sha>`
- `git tag` operations
- `git add <file>` after manually resolving a merge conflict (before `worktree_rebase_continue`)
- Any one-off investigative git command
