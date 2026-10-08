---
name: pr-lifecycle
description: 'PR lifecycle (end-to-end): create PRs with Jira linkage, self-review before push, drive a single PR to merge, fix conflicts/CI/reviews, respond to bot review threads, unblock stuck PRs, sweep all open PRs, and react to CI/review events on a watched PR. Load when creating PRs, reviewing changes, fixing review comments, driving/shipping/landing a PR, unblocking stuck PRs, sweeping open PRs, reacting to CI failures, or responding to bot review threads.'
metadata:
  scope: '**'
---

# Skill: PR Lifecycle

Covers the complete pull request lifecycle: self-review, PR creation with Jira linkage, watching a PR to merge, fixing Copilot review comments, and ongoing PR maintenance/sweep. This file is a thin dispatcher — each phase links to the reference doc that carries the actual procedure; load the reference before acting on it.

**You are the Author Agent** in every PR this skill touches — not the Reviewer Bot, Copilot, the Merge Queue, or the maintainer. See [references/label-ownership.md](references/label-ownership.md) for the full actor/label map and [references/author-agent-contract.md](references/author-agent-contract.md) for the exact bot-review reply protocol.

For quick PR-status checks without `gh`, merge-conflict signal triage, enabling auto-merge from a worktree, or clearing a stuck merge queue, see [references/unblock.md](references/unblock.md).

## Phases

Work through these phases sequentially. Each phase links to a detailed reference doc — load it before acting.

### Phase 1: Self-Review Before Mark-Ready (MANDATORY GATE)

Run a structured review of all branch changes before marking the PR ready — and before any push to a Ready (non-draft) PR. This is a **Tier 2 workflow rule**. Produce a **Self-Review Summary** (files reviewed, patterns checked, issues fixed) as proof of thoroughness. Draft-checkpoint pushes may precede it — the spine opens the draft PR before validation; spine Step 13 is where the review runs.

> Details: [references/self-review.md](references/self-review.md) · [references/common-review-patterns.md](references/common-review-patterns.md)

### Phase 2: Create PR with Jira Linkage

Pick the creation tool per environment, create the PR **as a draft**, apply `agent-in-progress`, run Gate B validation, mark ready, apply `bot:ready-for-review` (must be the last label op), then transition Jira to "In Review". The **jira-link marker** in the PR body (not the branch name or title) is the source of truth for ticket linkage — every built-in GitHub read path strips it on display, so never verify a write by reading it back.

> Details: [references/create-pr.md](references/create-pr.md) (tool routing, jira-link marker, PR body templates, post-creation steps, agent-session marker, parent-agent PR recovery)

### Phase 2b: Watch PR to Merge

After creating the PR and transitioning Jira, shepherd it through CI and reviews until `MERGED` or `CLOSED` — do not treat PR creation as the end of the task. Claude Code surfaces CI results and review events automatically as push notifications; react to each as it arrives. Responding to a review is **not** a terminal state — a `JUSTIFY:` does not clear `CHANGES_REQUESTED`.

> Details: [references/drive.md](references/drive.md) Step 6 (full event-handling table, terminal states, Desktop Auto-fix/Auto-merge caveat, `run:integration` orphan-on-merge caveat)

### Phase 3: Fix Copilot Review Comments

Fetch unresolved threads, apply fixes, validate, commit, push once, resolve threads, re-apply `bot:ready-for-review`. Cap at 2 fix-review rounds — after round 2, resolve remaining threads as "acknowledged" and proceed. Do not poll for the next review event; it arrives as a push notification.

> Details: [references/fix-reviews.md](references/fix-reviews.md) (includes the Review Thread Workflow for `bot-review` CI failures)

### Phase 4: PR Maintenance and Sweep

Orchestrate maintenance across all open PRs: one-pass triage that handles API-only actions inline and dispatches one chip per PR needing code work.

> Details: [references/sweep.md](references/sweep.md) (local, chip-dispatch) · [references/sweep-cloud.md](references/sweep-cloud.md) (cloud, API-only). Dependabot queue triage: [sweep-dependabot skill](../sweep-dependabot/SKILL.md).

## Sub-skills

This skill consolidates the full PR-lifecycle cluster. Load the matching reference for your specific trigger:

| Reference                                                                  | Trigger                                                                                                                          |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [references/drive.md](references/drive.md)                                 | Drive/land/ship a specific PR to merge (single PR, by number/URL)                                                                |
| [references/fix.md](references/fix.md)                                     | Fix all outstanding issues on one PR (conflicts + reviews + CI)                                                                  |
| [references/unblock.md](references/unblock.md)                             | Investigate and unblock stuck PRs; detect Expected CI / false positives; auto-merge; merge-queue "conversation must be resolved" |
| [references/sweep.md](references/sweep.md)                                 | Local chip-dispatch sweep across all open PRs (`/sweep-prs`)                                                                     |
| [references/sweep-cloud.md](references/sweep-cloud.md)                     | Cloud-mode sweep algorithm (API-only actions + report)                                                                           |
| [references/respond-to-review.md](references/respond-to-review.md)         | Scaffold FIX/JUSTIFY/CANNOT-COMPLY replies to bot review threads (`/respond-to-review`)                                          |
| [references/fix-reviews.md](references/fix-reviews.md)                     | Fix Copilot review comments on a PR; Review Thread Workflow for `bot-review` failures                                            |
| [references/ci-event-response.md](references/ci-event-response.md)         | Triage and respond to CI/GitHub events on a watched PR (event-driven cloud agent)                                                |
| [references/e2e-hold.md](references/e2e-hold.md)                           | E2E failures not caused by this PR: attribution gate, blocker ticket, hold, monitor, resume                                      |
| [references/label-ownership.md](references/label-ownership.md)             | Who's who in the PR flow; which actor applies which label                                                                        |
| [references/author-agent-contract.md](references/author-agent-contract.md) | Exact bot-review reply protocol (Cycles 1–3+, format rules, escalation)                                                          |
| [references/critical-rules.md](references/critical-rules.md)               | Full detail behind each Critical Rule below                                                                                      |
| [references/quick-commands.md](references/quick-commands.md)               | Copy-pasteable MCP command sequences for the full PR-creation → merge flow                                                       |

## Agent-Session Marker (PR ↔ Session Linkage)

Any local session that picks up an existing PR it did not create (drive-pr, fix-pr, respond-to-review, sweep chips) must stamp itself onto the PR before entering the work loop: `bash scripts/link-pr-session.sh <PR#>`. Skip only when the PR is on the session's own branch, or the environment has no `gh`/`CLAUDE_CODE_SESSION_ID`.

> Details: [references/create-pr.md § Agent-Session Marker](references/create-pr.md#agent-session-marker-pr--session-linkage--provenance--one-home-ls-8570)

## Critical Rules

Full explanations, examples, and the CI-tool instant-snapshot reference table: [references/critical-rules.md](references/critical-rules.md).

1.  Always self-review before mark-ready (Tier 2 gate).
2.  2-round cap on Copilot fix iterations.
3.  Resolve threads after fixing, via `github_resolve_threads`.
4.  Never skip `make pc`.
5.  Always use `--body-file` or an MCP tool for the PR body — never inline `--body` in any shell.
6.  Never create a PR from `main`.
7.  Always create PRs as drafts, then mark ready before handoff — draft is a working state, not an ending state. A PR left in draft is stuck: CI does not run its full pipeline and it cannot enter the merge queue. Before ending ANY turn that touched a PR, confirm `isDraft: false` via `github_view_pr`; if it is still draft and validation + self-review are green (or the only red is proven pre-existing), call `github_mark_pr_ready` now.
8.  Check Runs ≠ Commit Statuses — `github_retrigger_check` cannot find `bot-review` or other commit statuses.
9.  React to each push notification as it arrives — never poll (`sleep N && gh ...`) for CI/PR status.
10. Batch known PR fixes into one push.
11. Never call `github_merge_pr(strategy: "direct")` — merge only through the queue.
12. `ci_list_runs`/`ci_view_run`/`github_view_pr`/`github_list_prs` are instant snapshots — one-shot only, never loop.
13. Re-dispatch `bot-review` via `ci_dispatch_workflow` — never `gh workflow run`.
14. Precondition after every fix-push: apply `bot:ready-for-review` (last label op).

## Reference Documents

| Document                                                                                                                  | Content                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [references/self-review.md](references/self-review.md)                                                                    | Self-review checklist and steps                                                                                                     |
| [references/create-pr.md](references/create-pr.md)                                                                        | PR-creation tool routing, prerequisites, template, post-creation steps, agent-session marker, parent-agent recovery                 |
| [references/fix-reviews.md](references/fix-reviews.md)                                                                    | Fix Copilot review comments (single PR and batch); Review Thread Workflow                                                           |
| [references/common-review-patterns.md](references/common-review-patterns.md)                                              | Top ~20 Copilot review patterns checklist (detail: [common-review-patterns-detail.md](references/common-review-patterns-detail.md)) |
| [references/fix-copilot-reviews-workflow.md](references/fix-copilot-reviews-workflow.md)                                  | Batch workflow for fixing reviews across all open PRs                                                                               |
| [references/pr-body-powershell-pitfalls.md](references/pr-body-powershell-pitfalls.md)                                    | PowerShell encoding issues with PR bodies                                                                                           |
| [references/pr-common-issues.md](references/pr-common-issues.md)                                                          | Common PR creation issues and fixes                                                                                                 |
| [references/pr-ui-screenshots.md](references/pr-ui-screenshots.md)                                                        | When and how to include UI screenshots                                                                                              |
| [references/agent-screenshots.md](references/agent-screenshots.md)                                                        | Capture before/after screenshots for UI PRs using browser MCP                                                                       |
| [references/bug-verification-templates.md](references/bug-verification-templates.md)                                      | PR body templates for proving bug fixes (screenshots, tests, queries, logs)                                                         |
| [references/ci-checks-reference.md](references/ci-checks-reference.md)                                                    | Every PR check: what it validates, why it fails, how to fix it locally; rate-limit "withholding" troubleshooting                    |
| [references/e2e-hold.md](references/e2e-hold.md)                                                                          | External E2E blocker protocol: attribute, ticket, hold, monitor, resume                                                             |
| [references/label-ownership.md](references/label-ownership.md)                                                            | Who's-who + Label Ownership tables                                                                                                  |
| [references/author-agent-contract.md](references/author-agent-contract.md)                                                | Bot-review reply protocol (Cycles 1–3+)                                                                                             |
| [references/critical-rules.md](references/critical-rules.md)                                                              | Full detail behind the Critical Rules above                                                                                         |
| [references/quick-commands.md](references/quick-commands.md)                                                              | Copy-pasteable MCP command sequences                                                                                                |
| [workflow-overview (PR Preview section)](../workflow-overview/references/post-merge-and-deploy.md#pr-preview-deployments) | PR preview URL pattern and how to verify deployment (do not list branches)                                                          |

## Related Skills

- [planning](../plan-ticket/references/planning.md) -- Structured planning phase (referenced by self-review and PR body guidance)
- [ground-truth-verification](../ground-truth-verification/SKILL.md) -- verify-before-citing probes for self-review of doc changes (commands, tool names, paths, gates)
- [rebase](../worktree-workflow/references/rebase.md) -- Rebase branches and resolve merge conflicts
- [debugging](../debugging/SKILL.md) -- Debug CI failures and code defects
- [worktree-workflow](../worktree-workflow/SKILL.md) -- Working in isolated worktrees
