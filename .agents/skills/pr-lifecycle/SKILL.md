---
name: pr-lifecycle
description: 'PR lifecycle: create PRs with Jira linkage, self-review code before push, fix Copilot review comments, and orchestrate PR maintenance sweeps. Load when creating PRs, reviewing changes, fixing review comments, or managing open PRs.'
---

# Skill: PR Lifecycle

Covers the complete pull request lifecycle from self-review through creation, review fixing, and maintenance.

## Checking PR Status Without Bash

Prefer MCP tools; use `gh pr view --json` only when MCP is unavailable or the user explicitly confirms a CLI fallback:

| Instead of                           | Use                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `gh pr view N --json state,mergedAt` | `github_view_pr({ number: N })` — returns `state` + `mergedAt`                                  |
| `gh pr view N --json mergeable`      | `github_pr_batch_status({ numbers: [N] })` — returns `mergeable`, `ciSummary`, `reviewDecision` |

**`mergeable: UNKNOWN` does not mean blocked** — it can mean GitHub is still computing mergeability, and it can also appear for PRs that are already merged or closed. Do not treat `UNKNOWN` as a merge-queue signal by itself. To confirm the actual PR outcome, call `github_view_pr({ number: N })` and check `state` plus `mergedAt`/`closedAt`: `state: "MERGED"` or a populated `mergedAt` means it merged successfully; a closed PR with `closedAt` and no `mergedAt` means it was closed without merging.

## Phases

Work through these phases sequentially. Each phase links to a detailed reference doc.

### Phase 1: Self-Review Before Push (MANDATORY GATE)

Run a structured review of all branch changes before pushing. This is a **Tier 2 workflow rule** — do NOT push without completing it. Catches project-rule violations, common Copilot review patterns, and code quality issues that `make pc` does not check (semantic issues, dead code, reuse opportunities).

You must produce a **structured Self-Review Summary** (see the template in the reference doc) listing files reviewed, patterns checked, and issues fixed. This summary is your proof of thoroughness — without it, self-review did not happen.

> Self-review is a verification step, not a planning step. If you find yourself making significant design changes during self-review, you may have skipped the [planning phase](../planning/SKILL.md) — consider stopping and re-planning.

> Details: [references/self-review.md](references/self-review.md)

### Phase 2: Create PR with Jira Linkage

> **⛔ Never use `gh pr create` directly** — always use `github_create_pr` MCP tool. The MCP tool handles `worktreePath` routing (ensures the PR targets the correct branch in multi-worktree sessions), structured body encoding, and is audited by the MCP gap checker. `gh pr create` silently uses the shell working directory, bypasses `worktreePath`, and produces audit flags. Fall back to `gh pr create` **only** after confirming `github_auth_status()` returns `configured: false` and the user explicitly authorizes the CLI fallback.

Before creating a PR, verify GitHub auth is working:

```
github_auth_status()
```

If `configured: false`, **stop and prompt the user** — do not silently fall back to `gh` CLI. Tell them their GitHub credentials are missing or expired and direct them to set `GH_TOKEN` or `GITHUB_TOKEN`, run `gh auth login`, or configure `AGENT_AUTHOR_APP_PRIVATE_KEY`. Only fall back to `gh` CLI after the user confirms their auth is working or explicitly asks you to try the CLI fallback.

**Cloud (Claude Code on the web)**: Use built-in `mcp__github__create_pull_request({ owner, repo, ... })` and `mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })` — these authenticate via the platform's token and avoid the username-leak issue. See [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) for the full tool mapping.

Verify prerequisites (`make pc`, migrations, branch pushed), create the PR **as a draft** using `github_create_pr` MCP tool, mark it ready for review, then transition Jira to "In Review". The draft→ready flow prevents sweep/review agents from racing with the creating agent.

When a planning phase was run (see [planning skill](../planning/SKILL.md)), include its output in the PR body: the **Context** (why) and **Risk Assessment** sections help reviewers focus on the right areas.

> **A rich PR description is required for Copilot to fix review comments correctly.** When reviewers use "Fix with Copilot" or `@copilot` to address a review thread, Copilot's only context is the PR title, description, and diff. A thin description (e.g., 1-2 summary bullets with no context) causes Copilot to make repeated, incomplete, or misaligned fixes — leading to 3-4 redundant agent runs per review round. Always include a `## Context` section with the Jira link and a clear problem statement. Write the description as a prompt to a capable engineer who has never seen the ticket.

> **Batch review comments before "Fix with Copilot".** Submitting individual review comments (one at a time) and clicking "Fix with Copilot" on each one spawns a separate Copilot agent session per comment. These sessions race each other and frequently produce conflicting patches. Always use "Start a review" to batch all comments, then submit the review in a single action before requesting Copilot fixes.

> Details: [references/create-pr.md](references/create-pr.md)

### Phase 2b: Watch PR to Merge

After creating the PR and transitioning Jira, shepherd the PR through CI and reviews — do **not** treat PR creation as the end of the task.

Claude Code surfaces CI results and review events natively. After marking the PR ready, Claude Code will automatically receive and surface CI failures, new review threads, and other agent-actionable events. Handle each event as it arrives (fixing code, resolving threads, re-running CI) and continue until merged or closed.

See [drive-pr](../drive-pr/SKILL.md) Step 6 for the full event-handling table.

### Phase 3: Fix Copilot Review Comments

Fetch unresolved threads, apply fixes, validate, commit, push, and resolve threads. Cap at 2 fix-review rounds -- after round 2, resolve remaining threads as "acknowledged" and proceed.

**Cloud (Claude Code on the web)**: Use built-in tools for operations where authorship is visible (replying to threads, requesting Copilot review). This prevents agent comments from appearing under the user's personal GitHub username. See the cloud review workflow in [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) and the cloud section in [references/fix-reviews.md](references/fix-reviews.md).

> Details: [references/fix-reviews.md](references/fix-reviews.md)

### Phase 4: PR Maintenance and Sweep

Orchestrate maintenance across all open PRs: scan, rebase conflicts, fix reviews, fix CI failures. Supports both local (full sweep) and cloud (API-only) modes.

> Details: [references/pr-maintenance.md](references/pr-maintenance.md)

## Review Thread Workflow (bot-review failures)

When `bot-review` CI check fails or Copilot posts review comments, use this MCP-first workflow:

> **Classification rule**: `bot-review`, `Copilot review blocked`, and `Copilot review has unresolved comments` are review blockers, not generic CI-debugging tasks. Fetch unresolved review threads first; do not start by reading Actions logs unless another non-review check is also failing.

1. **Get unresolved threads**: `github_get_review_threads({ number: PR# })`
   - Default (no `includeResolved`) returns only unresolved threads — exactly the ones blocking merge.
   - Returns thread-level fields: `id` (PRRT\_ node ID), `isResolved`, `isOutdated`, `isCollapsed`, `path`, `line`, `startLine` — plus a `comments` array with `databaseId`, `author`, `body`, `path`, `line` per comment.
2. **Inspect the returned comments and fix the code** in the flagged files/lines
3. **Reply to threads** (when a comment needs acknowledgment or explanation rather than a code fix):
   - Use `github_reply_to_review` — available for **both local and cloud** sessions via the custom `legacy-sports-github` MCP server.
   - Pass either `threadId` (GraphQL node ID from `github_get_review_threads`) or `commentId` + `number` (REST databaseId + PR number): `github_reply_to_review({ threadId: "PRRT_...", body: "explanation" })`
   - **ToolSearch query**: search `"reply review"`, `"reply to review comment"`, or `"github_reply_to_review"` — not `"reply to PR comment"` (which may not surface it).
   - Do **not** reach for `gh api repos/.../pulls/.../comments` or a Python scratch script — the MCP tool handles both auth paths.
4. **Commit and push** the fix
5. **Resolve threads**: `github_resolve_threads({ threadIds: [<thread-id>, ...], prNumber: PR# })`
   - Thread node IDs come from the `id` field of each thread in `github_get_review_threads` output (PRRT\_... format).
   - **Alternative**: if you only have numeric comment `databaseId` values (e.g. from `mcp__github__*` `get_review_comments`), pass them as `commentDatabaseIds` instead — the tool maps them to thread IDs internally: `github_resolve_threads({ commentDatabaseIds: [<databaseId>, ...], prNumber: PR# })`.
   - **If bot-review still fails after resolution**: `github_resolve_threads` with `prNumber` attempts to re-dispatch the Copilot Auto-Approve workflow, but may be silently skipped if the app token lacks `actions: write`. If `bot-review` still shows failure after thread resolution, re-dispatch manually: `ci_dispatch_workflow({ workflow: "Copilot Auto-Approve", ref: "<branch>", inputs: { pr_number: "<PR#>" } })`. Wait ~20 seconds for the recheck job and verify `bot-review` flips to success before attempting merge.
6. **Re-request review**: `github_request_review({ prs: [PR#] })`

> **`bot-review` still stuck after resolving threads?** Manually re-dispatch the recheck using the `ci_dispatch_workflow` MCP tool — **never** `gh workflow run copilot-auto-approve.yml` via Bash:
>
> ```
> ci_dispatch_workflow(workflow: "copilot-auto-approve.yml", inputs: { pr_number: "<PR#>" })
> ```
>
> In cloud sessions, this may return 403 (app lacks `actions:write`) — see [cloud-agent-mode/SKILL.md](../cloud-agent-mode/SKILL.md#quirk-3-ci_dispatch_workflow-returns-403-in-cloud--agent_author_app-lacks-actionswrite).

Before the next push, also check whether any other blockers are already known on the PR (conflicts, non-review failing checks). Batch all currently known fixes into one validation + push round whenever possible. Do **not** push a CI-only change while known review threads remain unresolved, or vice versa, unless one blocker must be cleared first to reveal the next.

> **Avoid `gh api graphql` to enumerate review threads** — prefer `github_get_review_threads`, which returns structured data including GraphQL thread node IDs (required for resolution). Use `gh api graphql` only as a last resort when MCP or another documented tool is unavailable or does not return the needed thread IDs.

> **Mapping comment IDs to thread IDs**: `github_resolve_threads` now handles this automatically. If you have a comment's `databaseId` (numeric) but not its thread's PRRT\_ node ID, pass the `databaseId` values via `commentDatabaseIds` with `prNumber` — no raw GraphQL fallback needed.

## Merge Queue Blocked: "A conversation must be resolved"

When the merge queue rejects a PR with **"Repository rule violations found: A conversation must be resolved before this pull request can be merged"**, follow this workflow:

> **Critical non-obvious rule**: `isOutdated: true` does NOT mean the thread is resolved. "Outdated" means the code changed after the comment was posted (the diff hunk no longer exists). Outdated threads that are **not** resolved still block the merge queue. Never assume outdated = safe to ignore.

1. **List threads blocking merge**:

   ```
   github_get_review_threads({ number: PR# })
   ```

   Default returns only unresolved threads (including outdated-but-unresolved). Inspect `isOutdated` on each — these are the ones that may have been overlooked.

2. **Collect thread IDs** from the `id` field (PRRT\_ prefix) of all returned threads.

3. **Resolve all blocking threads**:

   ```
   github_resolve_threads({ threadIds: ["PRRT_...", "PRRT_..."], prNumber: PR# })
   ```

   The `prNumber` parameter triggers a bot-review recheck after resolution.

4. **Wait for the next merge queue cycle** — the PR will be re-evaluated automatically after the commit status updates. No manual re-enqueue is needed unless the PR was removed from the queue.

## Critical Rules

1.  **Always self-review before pushing (Tier 2 gate)** -- Phase 1 is mandatory. Read every changed file in full, check all 20 common review patterns, and produce a Self-Review Summary before calling `worktree_push()`. Skipping this is the #1 cause of avoidable Copilot review cycles.
2.  **2-round cap on Copilot fix iterations** -- Round 1: security/bugs/type safety. Round 2: remaining actionable comments. After round 2: resolve and move on.
    <<<<<<< HEAD
3.  **Resolve threads after fixing** -- use `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` after pushing fixes. Thread IDs come from `github_get_review_threads({ number: <PR#> })` (returns unresolved threads by default; pass `includeResolved: true` for all). If you only have numeric comment `databaseId` values, use `github_resolve_threads({ commentDatabaseIds: [...], prNumber: <PR#> })` — the tool maps them to thread IDs internally (no raw GraphQL needed). The `prNumber` parameter triggers a bot-review recheck attempt when all thread resolutions succeed; if the app token lacks `actions: write` the dispatch is skipped/non-fatal and the tool returns a `recheckNote` instead of erroring — **if bot-review still shows failure after thread resolution, re-dispatch manually (see Review Thread Workflow)**. Add `merge-when-ready` label after all threads are resolved. **Do NOT use `gh api graphql`** to resolve — `github_resolve_threads` works with both user and GitHub App tokens and handles batching. Fall back to `gh api graphql` only if the custom server is confirmed unavailable after retry.
4.  **Never skip `make pc`** -- each CI failure costs 40-60 min. Minimum alternative: `make format && make lint-fix && make typecheck`.
5.  **Always use `--body-file` or MCP tool for PR body** -- never inline `--body` in any shell (PowerShell is especially problematic).
6.  **Never create a PR from `main`** -- branch name must contain a Jira ticket key.
7.  **Always create PRs as drafts** -- use `draft: true` in `github_create_pr` MCP tool. Apply the `agent-in-progress` label while still a draft, then mark ready. This closes the race window — the PR becomes visible to sweeps already labeled. See [create-pr.md](references/create-pr.md) for the canonical step order.
8.  **Check Runs ≠ Commit Statuses** -- `github_retrigger_check` only works on **Check Runs** (Checks API). `bot-review` and other bot-set statuses use the **Statuses API** and will NOT be found by `github_retrigger_check`. If you get "No check run named 'X' found", use `github_list_commit_statuses({ number: <PR#> })` to see commit statuses instead. To clear a stale commit status: push a new commit (re-triggers the workflow) or dispatch via `ci_dispatch_workflow`. Note: `github_merge_pr(strategy: "direct")` does NOT bypass required commit statuses — it uses the standard merge API which still enforces branch protection rules.
9.  **Claude Code surfaces PR events natively — never use polling loops** -- after marking a PR ready, Claude Code automatically surfaces CI results, review threads, and other agent-actionable events. No wait tool needed. React to each event as it arrives and handle it.
    - **Never use `sleep` + polling loops** — no `sleep N && gh run view`, no `sleep N && gh pr view --json statusCheckRollup`, no `sleep N && gh pr checks <pr>`, no `ci_view_run every ~60s` loops. These waste context and shell round-trips. `sleep N && gh pr checks` is a common fallback when agents believe the CI server is not loaded — but Claude Code's native event streaming works regardless of which MCP servers are connected.
10. **Batch known PR fixes into one push** -- when a PR simultaneously has unresolved review threads and failing checks, gather both the thread set and CI evidence before editing. The default remediation unit is one review/CI round -> one validation -> one push. Multiple pushes for already-known issues create avoidable Copilot re-reviews and CI cycles.
11. # **`ci_list_runs`, `ci_view_run`, `github_view_pr`, `github_list_prs` are instant snapshots — use for targeted lookups only.** Calling them in a loop burns 1–2M tokens per session (each call re-reads the full conversation context). Use them exactly once for a targeted lookup.
12. **Resolve threads after fixing** -- use `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` after pushing fixes. Thread IDs come from `github_get_review_threads({ number: <PR#> })` (returns unresolved threads by default; pass `includeResolved: true` for all). The `prNumber` parameter triggers a bot-review recheck attempt when all thread resolutions succeed; if the app token lacks `actions: write` the dispatch is skipped/non-fatal and the tool returns a `recheckNote` instead of erroring — threads are still resolved and the recheck fires automatically on the next push. Add `merge-when-ready` label after all threads are resolved. **Do NOT use `gh api graphql`** to resolve — `github_resolve_threads` works with both user and GitHub App tokens and handles batching. Fall back to `gh api graphql` only if the custom server is confirmed unavailable after retry.
13. **Re-dispatch `bot-review` via MCP — never `gh workflow run`** -- if `bot-review` remains stuck after resolving threads, use `ci_dispatch_workflow(workflow: "copilot-auto-approve.yml", inputs: { pr_number: "<PR#>" })`. Never use `gh workflow run copilot-auto-approve.yml` via Bash — always use the `ci_dispatch_workflow` MCP tool. See [cloud-agent-mode/SKILL.md](../cloud-agent-mode/SKILL.md#quirk-3-ci_dispatch_workflow-returns-403-in-cloud--agent_author_app-lacks-actionswrite) for the 403 fallback in cloud sessions.
14. **Never skip `make pc`** -- each CI failure costs 40-60 min. Minimum alternative: `make format && make lint-fix && make typecheck`.
15. **Always use `--body-file` or MCP tool for PR body** -- never inline `--body` in any shell (PowerShell is especially problematic).
16. **Never create a PR from `main`** -- branch name must contain a Jira ticket key.
17. **Always create PRs as drafts** -- use `draft: true` in `github_create_pr` MCP tool. Apply the `agent-in-progress` label while still a draft, then mark ready. This closes the race window — the PR becomes visible to sweeps already labeled. See [create-pr.md](references/create-pr.md) for the canonical step order.
18. **Check Runs ≠ Commit Statuses** -- `github_retrigger_check` only works on **Check Runs** (Checks API). `bot-review` and other bot-set statuses use the **Statuses API** and will NOT be found by `github_retrigger_check`. If you get "No check run named 'X' found", use `github_list_commit_statuses({ number: <PR#> })` to see commit statuses instead. To clear a stale commit status: push a new commit (re-triggers the workflow) or dispatch via `ci_dispatch_workflow`. Note: `github_merge_pr(strategy: "direct")` does NOT bypass required commit statuses — it uses the standard merge API which still enforces branch protection rules.
19. **Claude Code surfaces PR events natively — never use polling loops** -- after marking a PR ready, Claude Code automatically surfaces CI results, review threads, and other agent-actionable events. No wait tool needed. React to each event as it arrives and handle it.
    - **Never use `sleep` + polling loops** — no `sleep N && gh run view`, no `sleep N && gh pr view --json statusCheckRollup`, no `sleep N && gh pr checks <pr>`, no `ci_view_run every ~60s` loops. These waste context and shell round-trips. `sleep N && gh pr checks` is a common fallback when agents believe the CI server is not loaded — but Claude Code's native event streaming works regardless of which MCP servers are connected.
20. **Batch known PR fixes into one push** -- when a PR simultaneously has unresolved review threads and failing checks, gather both the thread set and CI evidence before editing. The default remediation unit is one review/CI round -> one validation -> one push. Multiple pushes for already-known issues create avoidable Copilot re-reviews and CI cycles.
21. **`ci_list_runs`, `ci_view_run`, `github_view_pr`, `github_list_prs` are instant snapshots — use for targeted lookups only.** Calling them in a loop burns 1–2M tokens per session (each call re-reads the full conversation context). Use them exactly once for a targeted lookup.

    > > > > > > > 68af2c8f6 (LS-3634 docs(pr-lifecycle): document ci_dispatch_workflow for copilot-auto-approve re-dispatch)

        **CI tool reference — instant snapshots:**

| Tool              | Correct usage                                                      |
| ----------------- | ------------------------------------------------------------------ |
| `ci_list_runs`    | ONE-SHOT: get the runId for a failing CI run — never loop          |
| `ci_get_logs`     | ONE-SHOT: read failed-step output after getting runId — never loop |
| `ci_view_run`     | ONE-SHOT: inspect a specific run — never loop                      |
| `github_view_pr`  | ONE-SHOT: verify merge state or read PR metadata — never loop      |
| `github_list_prs` | ONE-SHOT: find an existing PR — never loop                         |

## Quick Commands

```
# MCP (preferred) — full post-creation sequence
github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, worktreePath: <path>)
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])
github_mark_pr_ready(number: <PR#>)
mcp__github__subscribe_pr_activity(pullRequestNumber: <PR#>)  # Claude Code built-in ONLY — NOT in legacy-sports-github; unavailable in cloud/headless; fallback: poll via github_view_pr + ci_list_runs with ScheduleWakeup
github_request_review(prs: [<PR#>])
jira_transition(key: "LS-####", status: "In Review")
```

<details>
<summary>Script (single command — when MCP tools are unavailable)</summary>

`make ship-pr` runs the full 5-step pipeline in one shot: create draft PR → label → mark ready → request Copilot review → transition Jira to "In Review". Requires `JIRA_API_TOKEN` + `JIRA_EMAIL` env vars for the Jira step. Use `NO_JIRA=1`, `BODY_FILE=`, `BASE=`, and `ARGS=` Make variables to pass additional options; or invoke `node scripts/ship-pr.js` directly for full flag control.

```bash
# Minimal Make target — auto-detects body from .github/tmp-pr-body.md if it exists
make ship-pr TITLE="LS-#### type(scope): description"

# Make target with options
make ship-pr TITLE="LS-#### type(scope): desc" NO_JIRA=1
make ship-pr TITLE="LS-#### type(scope): desc" BODY_FILE=.github/tmp-pr-body.md BASE=my-branch

# Direct script — use for full flag control (--dry-run, --json, --no-jira, --body-file, etc.)
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --body-file=.github/tmp-pr-body.md
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --no-jira
node scripts/ship-pr.js --title="LS-#### type(scope): desc" --dry-run
```

</details>

<details>
<summary>CLI fallback (only when both MCP and ship-pr script are unavailable)</summary>

```bash
gh pr create --draft --title "LS-#### type(scope): msg" --body-file ".github/tmp-pr-body.md" --base main
bash scripts/cleanup-pr-body.sh
gh pr ready <PR#>
```

</details>

## Reference Documents

| Document                                                                                       | Content                                                                     |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [references/self-review.md](references/self-review.md)                                         | Self-review checklist and steps                                             |
| [references/create-pr.md](references/create-pr.md)                                             | PR creation prerequisites, template, and post-creation steps                |
| [references/fix-reviews.md](references/fix-reviews.md)                                         | Fix Copilot review comments (single PR and batch)                           |
| [references/pr-maintenance.md](references/pr-maintenance.md)                                   | Full PR lifecycle management doc                                            |
| [references/common-review-patterns.md](references/common-review-patterns.md)                   | Top 20 Copilot review patterns and fixes                                    |
| [references/fix-copilot-reviews-workflow.md](references/fix-copilot-reviews-workflow.md)       | Batch workflow for fixing reviews across all open PRs                       |
| [references/pr-body-powershell-pitfalls.md](references/pr-body-powershell-pitfalls.md)         | PowerShell encoding issues with PR bodies                                   |
| [references/pr-common-issues.md](references/pr-common-issues.md)                               | Common PR creation issues and fixes                                         |
| [references/pr-maintenance-workflow.md](references/pr-maintenance-workflow.md)                 | Detailed sweep workflow (local and cloud modes)                             |
| [references/pr-ui-screenshots.md](references/pr-ui-screenshots.md)                             | When and how to include UI screenshots                                      |
| [references/sweep-and-parallelization.md](references/sweep-and-parallelization.md)             | Sweep loop algorithm and parallel validation                                |
| [references/agent-screenshots.md](references/agent-screenshots.md)                             | Capture before/after screenshots for UI PRs using browser MCP               |
| [references/bug-verification-templates.md](references/bug-verification-templates.md)           | PR body templates for proving bug fixes (screenshots, tests, queries, logs) |
| [references/ci-checks-reference.md](references/ci-checks-reference.md)                         | Every PR check: what it validates, why it fails, and how to fix it locally  |
| [references/copilot-auto-approve-flow.md](references/copilot-auto-approve-flow.md)             | Full flow & invariants for the `bot-review` workflow — read before editing  |
| [workflow-overview (PR Preview section)](../workflow-overview/SKILL.md#pr-preview-deployments) | PR preview URL pattern and how to verify deployment (do not list branches)  |

## Parent-Agent PR Recovery

When a subagent fails to push or create a PR, the parent agent should **prefer MCP tools** to recover — use `gh` only when MCP is unavailable. The subagent's commits already exist in its ephemeral worktree; the parent just needs to push and ship.

**Recovery sequence (MCP-first):**

```
# 1. Push the subagent's commits (include worktree path and setUpstream for new branches)
worktree_push(worktree: "<absolute path to subagent worktree>", setUpstream: true)
# OR if worktree_set is active for the subagent's worktree:
worktree_run(command: "git push --set-upstream origin <branch>")

# 2. Create the PR as a draft, targeting the subagent's worktree
github_create_pr(
  worktreePath: "<absolute path to subagent worktree>",
  title: "LS-#### type(scope): msg",
  body: <markdown>,
  draft: true
)

# 3. Apply the agent-in-progress label
github_manage_labels(prs: [<PR#>], add: ["agent-in-progress"])

# 4. Mark ready for review
github_mark_pr_ready(number: <PR#>)

# 5. Request Copilot review
github_request_review(prs: [<PR#>])
```

**Prefer MCP; use `gh` only when MCP is unavailable.** The `legacy-sports-github` MCP server exposes all required operations as first-class tools (`github_create_pr`, `github_mark_pr_ready`, `github_manage_labels`, `github_request_review`) and should always be preferred. `gh pr create` / `gh pr ready` / `gh pr edit --add-label` are shell-level fallbacks for when MCP servers are unavailable. Using `gh` CLI in a recovery context can also silently use the wrong working directory, bypasses the `worktreePath` parameter that routes the PR to the correct branch, and produces shell-history noise that MCP gap audits flag.

**Shell fallback (only if MCP server is unavailable):**

```bash
gh pr create --draft --title "LS-#### type(scope): msg" --body-file ".github/tmp-pr-body.md" --base main
bash scripts/cleanup-pr-body.sh
gh pr edit <PR#> --add-label "agent-in-progress"
gh pr ready <PR#>
```

## Related Skills

- [planning](../planning/SKILL.md) -- Structured planning phase (referenced by self-review and PR body guidance)
- [rebase](../rebase/SKILL.md) -- Rebase branches and resolve merge conflicts
- [debugging](../debugging/SKILL.md) -- Debug CI failures and code defects
- [worktree-workflow](../worktree-workflow/SKILL.md) -- Working in isolated worktrees
