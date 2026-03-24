---
name: pr-lifecycle
description: 'PR lifecycle: create PRs with Jira linkage, self-review code before push, fix Copilot review comments, and orchestrate PR maintenance sweeps. Load when creating PRs, reviewing changes, fixing review comments, or managing open PRs.'
---

# Skill: PR Lifecycle

Covers the complete pull request lifecycle from self-review through creation, review fixing, and maintenance.

## Phases

Work through these phases sequentially. Each phase links to a detailed reference doc.

### Phase 1: Self-Review Before Push

Run a structured review of all branch changes before committing/pushing. Catches project-rule violations that `make pc` does not check (semantic issues, dead code, reuse opportunities).

> Details: [references/self-review.md](references/self-review.md)

### Phase 2: Create PR with Jira Linkage

Verify prerequisites (`make pc`, migrations, branch pushed), create the PR **as a draft** with standard template, mark it ready for review, then transition Jira to "In Review". The draft→ready flow prevents sweep/review agents from racing with the creating agent.

> Details: [references/create-pr.md](references/create-pr.md)

### Phase 3: Fix Copilot Review Comments

Fetch unresolved threads, apply fixes, validate, commit, push, and resolve threads. Cap at 2 fix-review rounds -- after round 2, resolve remaining threads as "acknowledged" and proceed.

> Details: [references/fix-reviews.md](references/fix-reviews.md)

### Phase 4: PR Maintenance and Sweep

Orchestrate maintenance across all open PRs: scan, rebase conflicts, fix reviews, fix CI failures. Supports both local (full sweep) and cloud (API-only) modes.

> Details: [references/pr-maintenance.md](references/pr-maintenance.md)

## Critical Rules

1. **Always self-review before pushing** -- Phase 1 is not optional. It prevents CI failures and reduces Copilot review rounds.
2. **2-round cap on Copilot fix iterations** -- Round 1: security/bugs/type safety. Round 2: remaining actionable comments. After round 2: resolve and move on.
3. **Resolve threads after fixing** -- use `github_resolve_thread` or `github_resolve_threads` after pushing fixes. Add `merge-when-ready` label after all threads are resolved.
4. **Never skip `make pc`** -- each CI failure costs 40-60 min. Minimum alternative: `make format && make lint-fix && make typecheck`.
5. **Always use `--body-file` or MCP tool for PR body** -- never inline `--body` in any shell (PowerShell is especially problematic).
6. **Never create a PR from `main`** -- branch name must contain a Jira ticket key.
7. **Always create PRs as drafts** -- use `draft: true` in `github_create_pr` MCP tool. Mark ready with `github_mark_pr_ready` after creation. This prevents sweep/review agents from racing with the creating agent.

## Quick Commands

```
# MCP (preferred) — always create as draft, then mark ready
github_create_pr(title: "LS-#### type(scope): msg", body: <markdown>, draft: true, worktreePath: <path>)
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

| Document                                                                                 | Content                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [references/self-review.md](references/self-review.md)                                   | Self-review checklist and steps                               |
| [references/create-pr.md](references/create-pr.md)                                       | PR creation prerequisites, template, and post-creation steps  |
| [references/fix-reviews.md](references/fix-reviews.md)                                   | Fix Copilot review comments (single PR and batch)             |
| [references/pr-maintenance.md](references/pr-maintenance.md)                             | Full PR lifecycle management doc                              |
| [references/common-review-patterns.md](references/common-review-patterns.md)             | Top 20 Copilot review patterns and fixes                      |
| [references/fix-copilot-reviews-workflow.md](references/fix-copilot-reviews-workflow.md) | Batch workflow for fixing reviews across all open PRs         |
| [references/pr-body-powershell-pitfalls.md](references/pr-body-powershell-pitfalls.md)   | PowerShell encoding issues with PR bodies                     |
| [references/pr-common-issues.md](references/pr-common-issues.md)                         | Common PR creation issues and fixes                           |
| [references/pr-maintenance-workflow.md](references/pr-maintenance-workflow.md)           | Detailed sweep workflow (local and cloud modes)               |
| [references/pr-ui-screenshots.md](references/pr-ui-screenshots.md)                       | When and how to include UI screenshots                        |
| [references/sweep-and-parallelization.md](references/sweep-and-parallelization.md)       | Sweep loop algorithm and parallel validation                  |
| [references/agent-screenshots.md](references/agent-screenshots.md)                       | Capture before/after screenshots for UI PRs using browser MCP |

## Related Skills

- [rebase-and-conflicts](../rebase-and-conflicts/SKILL.md) -- Rebase branches and resolve merge conflicts
- [debug-ci-failure](../debug-ci-failure/SKILL.md) -- Debug CI failures
- [worktree-workflow](../worktree-workflow/SKILL.md) -- Working in isolated worktrees
