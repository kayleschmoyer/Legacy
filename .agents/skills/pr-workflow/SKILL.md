---
name: pr-workflow
description: 'PR lifecycle: create PRs with Jira linkage, self-review code before commit, fix Copilot review comments, orchestrate PR maintenance (rebase/review/CI sweep). Load when creating PRs, reviewing changes, fixing review comments, or managing open PRs.'
---

# Skill: PR Workflow

## Overview

This skill covers the complete PR lifecycle: creation, self-review, review fixing, and maintenance operations.

## Create a PR

### Prerequisites (verify in order)

1. On a non-main branch with Jira ticket key in branch name
2. Changed files are formatted (`pnpm exec prettier --check .`)
3. Pending migrations applied (`db_migrate` or `pnpm --prefix lib/db-client run db:up`)
4. `make pc` passes

### Command

Always use `--body-file` for the PR body (avoid inlining `--body` in any shell; PowerShell is especially problematic):

```bash
# Write PR body to temp file (use create_file tool, NOT heredoc)
# File: .github/tmp-pr-body.md

# Create PR
gh pr create --title "LS-#### type(scope): description" --body-file ".github/tmp-pr-body.md" --base main

# Clean up
bash scripts/cleanup-pr-body.sh
```

Or use the `github_create_pr` MCP tool (preferred).

### PR Title Format

```
LS-#### type(scope): Brief description
```

### Copilot Review (Automatic)

The `copilot-auto-approve` workflow automatically requests Copilot review on PR open/update. When the review has no comments, the workflow auto-approves and labels `merge-when-ready`. No manual action needed.

> PR body template, PowerShell pitfalls, common issues, UI screenshots: see [references/](references/)

## Self-Review Before Commit

Run a structured self-review of all changes before committing. This catches project-rule violations that `make pc` does not — it focuses on **semantic** review.

### Steps

1. **Gather diff**: `git diff origin/main...HEAD` (all branch changes)
2. **Read changed files in full** — not just diff hunks
3. **Check project rules**: no `console.*` (use LOGGER), no `@ts-ignore`/`eslint-disable`, prefer `.graphql` + codegen, no `route.continue()` in E2E
4. **Code quality**: dead code, duplication, complexity, type safety, security
5. **Reuse check**: existing components in `lib/shared-components`? Existing utils?
6. **Fix issues directly** — don't just report, apply fixes

## Fix Copilot Review Comments

When Copilot reviews have unresolved comments requiring code changes:

1. Fetch unresolved threads: `github_get_review_threads(number: <PR#>, unresolvedOnly: true)`
2. Read each comment's `path`, `line`, and `body`
3. Apply the requested fix in the worktree
4. Validate: `make pc`
5. Commit & push
6. Resolve threads: `github_resolve_thread(threadId: "<id>")`
7. Copilot re-reviews automatically — bot approves and labels when clean

### Two-Round Cap

Copilot may find new comments each round (it reviews the full diff, not just deltas). **Cap fix iterations at 2 rounds:**

- **Round 1**: Fix all Tier 1–2 issues (security, bugs, error handling, type safety)
- **Round 2**: Fix remaining actionable comments
- **After round 2**: Resolve any remaining threads as "acknowledged — out of scope for this PR" and proceed to merge. Copilot's incremental suggestions have diminishing returns beyond round 2.

Do not enter a fix-review loop beyond 2 rounds. The `copilot-instructions.md` instructs Copilot to be thorough in a single pass, but this is a safety net for when it isn't.

> Top 10 common Copilot review patterns: [references/common-review-patterns.md](references/common-review-patterns.md)

### Batch Processing (All Open PRs)

For batch fixing across all open PRs:

1. List open PRs reviewed by Copilot with unresolved comments
2. For each PR: check out branch in worktree → fix comments → validate → commit → push → resolve threads
3. At batch scale (>10 PRs): skip `make pc` per-PR and rely on CI

> Full batch workflow: [references/fix-copilot-reviews-workflow.md](references/fix-copilot-reviews-workflow.md)

## PR Maintenance (Sweep)

Orchestrate PR maintenance across all open PRs. Supports full sweep (local) and cloud-only (API actions).

> **Local-only operations** — Any steps that modify the worktree, commit, or push (e.g., rebasing, applying fixes, updating branches) require a local agent. The `legacy-sports-github` MCP server and its GitHub tools (`github_pr_scan`, `github_pr_dashboard`, `github_pr_batch_status`, `github_resolve_threads`) are available to both local and cloud agents, but cloud agents are limited to API-only actions (scan, re-run CI, resolve meta threads, request Copilot reviews, reporting). For additional GitHub automation, cloud agents can also use Claude's native GitHub tools for individual PR operations.

### Quick Scan

```
github_pr_dashboard(state: "open", limit: 100)
```

### Full Sweep (Local Agent)

1. **Scan** all open PRs → categorize: conflicting, reviews, CI failing, clean
2. **Pass 1**: Rebase conflicting PRs (load `rebase-and-conflicts` skill)
3. **Pass 2**: Fix review comments (see above)
4. **Pass 3**: Fix CI failures (load `debug-ci-failure` skill)
5. **Verify**: clean PRs labeled by bot after Copilot re-review
6. Repeat until clean (max 5 iterations)

### Cloud Agent (API-Only Actions)

Cloud agents cannot commit/push. Available actions: scan, re-run CI, resolve meta threads, request Copilot reviews, produce actionable report.

> Full sweep workflow and parallelization: [references/pr-maintenance-workflow.md](references/pr-maintenance-workflow.md)

## Related Skills

- [rebase-and-conflicts](../rebase-and-conflicts/SKILL.md) — Rebase branches and resolve merge conflicts
- [debug-ci-failure](../debug-ci-failure/SKILL.md) — Debug CI failures
- [worktree-workflow](../worktree-workflow/SKILL.md) — Working in isolated worktrees
