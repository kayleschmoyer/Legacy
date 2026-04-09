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

### Phase 1: Self-Review Before Push

Run a structured review of all branch changes before committing/pushing. Catches project-rule violations that `make pc` does not check (semantic issues, dead code, reuse opportunities).

> Self-review is a verification step, not a planning step. If you find yourself making significant design changes during self-review, you may have skipped the [planning phase](../planning/SKILL.md) — consider stopping and re-planning.

> Details: [references/self-review.md](references/self-review.md)

### Phase 2: Create PR with Jira Linkage

Before creating a PR, verify GitHub auth is working:

```
github_auth_status()
```

If `configured: false`, **stop and prompt the user** — do not silently fall back to `gh` CLI. Tell them their GitHub credentials are missing or expired and direct them to set `GH_TOKEN` or `GITHUB_TOKEN`, run `gh auth login`, or configure `AGENT_AUTHOR_APP_PRIVATE_KEY`. Only fall back to `gh` CLI after the user confirms their auth is working or explicitly asks you to try the CLI fallback.

**Cloud (Claude Code on the web)**: Use built-in `mcp__github__create_pull_request({ owner, repo, ... })` and `mcp__github__update_pull_request({ owner, repo, pullNumber, draft: false })` — these authenticate via the platform's token and avoid the username-leak issue. See [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) for the full tool mapping.

Verify prerequisites (`make pc`, migrations, branch pushed), create the PR **as a draft** with standard template, mark it ready for review, then transition Jira to "In Review". The draft→ready flow prevents sweep/review agents from racing with the creating agent.

When a planning phase was run (see [planning skill](../planning/SKILL.md)), include its output in the PR body: the **Context** (why) and **Risk Assessment** sections help reviewers focus on the right areas.

> Details: [references/create-pr.md](references/create-pr.md)

### Phase 3: Fix Copilot Review Comments

Fetch unresolved threads, apply fixes, validate, commit, push, and resolve threads. Cap at 2 fix-review rounds -- after round 2, resolve remaining threads as "acknowledged" and proceed.

**Cloud (Claude Code on the web)**: Use built-in tools for operations where authorship is visible (replying to threads, requesting Copilot review). This prevents agent comments from appearing under the user's personal GitHub username. See the cloud review workflow in [`cloud-agent-mode/SKILL.md`](../cloud-agent-mode/SKILL.md) and the cloud section in [references/fix-reviews.md](references/fix-reviews.md).

> Details: [references/fix-reviews.md](references/fix-reviews.md)

### Phase 4: PR Maintenance and Sweep

Orchestrate maintenance across all open PRs: scan, rebase conflicts, fix reviews, fix CI failures. Supports both local (full sweep) and cloud (API-only) modes.

> Details: [references/pr-maintenance.md](references/pr-maintenance.md)

## Review Thread Workflow (bot-review failures)

When `bot-review` CI check fails or Copilot posts review comments, use this MCP-first workflow:

1. **Get unresolved threads**: `github_get_review_threads({ number: PR#, unresolvedOnly: true })`
   - Returns structured thread data such as thread `id`, `isResolved`, `isOutdated`, and a `comments` array. Each comment entry includes fields like `path`, `line`, and `body` — no need for raw GraphQL.
2. **Inspect the returned comments and fix the code** in the flagged files/lines
3. **Commit and push** the fix
4. **Resolve threads**: `github_resolve_threads({ threadIds: [<thread-id>, ...] })`
5. **Re-request review**: `github_request_review({ number: PR# })`

> **Avoid `gh api graphql` to enumerate review threads** — prefer `github_get_review_threads`, which returns structured data including GraphQL thread node IDs (required for resolution). Use `gh api graphql` only as a last resort when MCP or another documented tool is unavailable or does not return the needed thread IDs.

## Critical Rules

1. **Always self-review before pushing** -- Phase 1 is not optional. It prevents CI failures and reduces Copilot review rounds.
2. **2-round cap on Copilot fix iterations** -- Round 1: security/bugs/type safety. Round 2: remaining actionable comments. After round 2: resolve and move on.
3. **Resolve threads after fixing** -- use `github_resolve_threads({ threadIds: [...] })` MCP tool after pushing fixes — **do NOT use `gh api graphql` mutation to resolve threads**. `github_resolve_threads` is the MCP-first path. Thread IDs come from `github_get_review_threads(number: <PR#>, unresolvedOnly: true)`. Add `merge-when-ready` label after all threads are resolved. In cloud, `mcp__github__resolve_review_thread({ threadId })` is also available (one at a time). Fall back to `gh api graphql` **only** if a thread ID cannot be obtained via `github_get_review_threads(...)` or another documented tool that returns thread IDs.
4. **Never skip `make pc`** -- each CI failure costs 40-60 min. Minimum alternative: `make format && make lint-fix && make typecheck`.
5. **Always use `--body-file` or MCP tool for PR body** -- never inline `--body` in any shell (PowerShell is especially problematic).
6. **Never create a PR from `main`** -- branch name must contain a Jira ticket key.
7. **Always create PRs as drafts** -- use `draft: true` in `github_create_pr` MCP tool. Apply the `agent-in-progress` label while still a draft, then mark ready. This closes the race window — the PR becomes visible to sweeps already labeled. See [create-pr.md](references/create-pr.md) for the canonical step order.
8. **Check Runs ≠ Commit Statuses** -- `github_retrigger_check` only works on **Check Runs** (Checks API). `bot-review` and other bot-set statuses use the **Statuses API** and will NOT be found by `github_retrigger_check`. If you get "No check run named 'X' found", use `github_list_commit_statuses({ number: <PR#> })` to see commit statuses instead. To clear a stale commit status: push a new commit (re-triggers the workflow) or dispatch via `ci_dispatch_workflow`. Note: `github_merge_pr(strategy: "direct")` does NOT bypass required commit statuses — it uses the standard merge API which still enforces branch protection rules.
9. **Use `ci_wait_for_run` to wait for CI — never `sleep` + polling loops** -- after pushing a fix or marking a PR ready, use `ci_wait_for_run({ runId: "<id>" })` to block until the run completes (or the default 10 min timeout is hit; pass `timeoutMs` for long runs). Never use `sleep N && gh run view <runId> --json status,conclusion` or `sleep N && gh pr view <pr> --json statusCheckRollup` polling loops — these waste context and shell round-trips. Get the run ID from `ci_list_runs({ branch: "<branch>", limit: 1 })`, then call `ci_wait_for_run` once and wait for its structured result.

## Quick Commands

```
# MCP (preferred) — create as draft, label, then mark ready
github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, worktreePath: <path>)
github_manage_labels(number: <PR#>, add: ["agent-in-progress"])
github_mark_pr_ready(number: <PR#>)
```

<details>
<summary>CLI fallback (only when MCP server is unavailable)</summary>

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
github_manage_labels(number: <PR#>, add: ["agent-in-progress"])

# 4. Mark ready for review
github_mark_pr_ready(number: <PR#>)

# 5. Request Copilot review
github_request_review(number: <PR#>)
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
- [rebase-and-conflicts](../rebase-and-conflicts/SKILL.md) -- Rebase branches and resolve merge conflicts
- [debug-ci-failure](../debug-ci-failure/SKILL.md) -- Debug CI failures
- [worktree-workflow](../worktree-workflow/SKILL.md) -- Working in isolated worktrees
