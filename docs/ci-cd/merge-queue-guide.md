# Merge Queue Guide

## Overview

The merge queue is a **label-based automated merge system** implemented as a GitHub Actions workflow (`.github/workflows/merge-queue.yml`). It is _not_ GitHub's built-in merge queue feature — it is a custom workflow that watches for labeled PRs and merges them when all conditions are satisfied.

## Quick Start

1. Add the `merge-when-ready` label to your PR
2. The merge queue processes it automatically
3. Remove the label to exit the queue

## How It Works

### Triggers

The merge queue runs in response to:

| Event                   | When                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| **Label added/removed** | `merge-when-ready` or `merge-to-parent` label is toggled                         |
| **Review submitted**    | Someone approves or requests changes                                             |
| **CI completes**        | The CI Orchestrator workflow finishes on a PR branch                             |
| **Manual dispatch**     | Triggered via the GitHub Actions UI (supports `dry_run` and `force_check` modes) |

### Concurrency and Debounce

Only one merge queue run processes at a time (`cancel-in-progress: false`). Subsequent triggers queue up, ensuring strict serialization and preventing race conditions.

When triggered by CI completion (`workflow_run`) or a review submission (`pull_request_review`), the workflow **sleeps for 30 seconds** before processing. This debounce works with the concurrency group: while the current run sleeps, new triggers replace the single queued slot, so only the most recent trigger actually executes after the sleep. This prevents redundant processing when multiple CI runs complete within seconds of each other.

### Processing Flow

1. The workflow collects all open PRs with the `merge-when-ready` label
2. Each PR is validated against the merge conditions (see below)
3. PRs that pass all conditions are squash-merged
4. PRs that fail receive a comment explaining the blocker and how to fix it
5. PRs with pending checks are silently skipped (no comment) — they'll be retried on the next trigger

## Conditions for a Successful Merge

A PR is merged automatically when **all** of the following are true:

### 1. Not in draft state

Draft PRs are never merged. Mark the PR as "Ready for review" first.

### 2. No merge conflicts

The PR must be mergeable (`mergeable: true`). If GitHub hasn't computed the mergeable state yet, the queue polls for up to 60 seconds before giving up (it retries on the next cycle).

### 3. Code Reviewer Bot passed (`bot-review` status check)

Every PR requires a passing code review from the Code Reviewer Bot, enforced via the `bot-review` commit status. This is managed by the `review.yml` workflow (Reviewer W1) and the `.github/scripts/reviewer/index.mjs` script.

**How it works:**

1. **PR opened / marked ready for review** — `review.yml` fires, the reviewer script analyzes the diff using Copilot CLI (`codex` model)
2. **Reviewer posts findings:**
   - **Critical/high findings** → GitHub `REQUEST_CHANGES` review, `bot-review` set to `failure`
   - **Clean diff** → GitHub `APPROVE` review, `bot-review` set to `success`, `merge-when-ready` label added automatically
3. **Author responds to threads** — using the RAISE/ADJUDICATE/VERIFY cycle protocol (`FIX: <sha>` or `JUSTIFY: <rationale>` per thread); pushing the fix commits fires the next cycle automatically because `bot:ready-for-review` persists through merge (LS-4678). Re-applying the label is only needed if it was externally removed
4. **Cycle 2 (ADJUDICATE)** — bot re-evaluates; unresolved mandates must be `FIX: <sha>`; if resolved, `bot-review` → `success`

See `AGENTS.md §8` (Author Agent Contract) and [ci-greenfield-copilot-evaluation.md](ci-greenfield-copilot-evaluation.md) for the full cycle protocol.

**`bot-review` is a commit status** (not a check run). Use `github_list_commit_statuses({ number: PR# })` to inspect it — `github_retrigger_check` will not find it.

Since `bot-review` is a commit status, the merge queue's status check validation (see below) treats it like any other check — `success` passes, `failure` blocks, `pending` waits.

### 4. All other status checks passing

Beyond `bot-review`, every other check run registered on the PR's HEAD SHA must also pass:

| Check state                                           | Result                                |
| ----------------------------------------------------- | ------------------------------------- |
| `completed` + `success`                               | Passing                               |
| `completed` + `skipped`, `neutral`, `action_required` | Ignored (not a failure)               |
| `completed` + `failure`, `cancelled`, `timed_out`     | **Blocking**                          |
| `in_progress`, `queued`                               | **Pending** — queue waits and retries |

Commit statuses (the older status API, which includes `bot-review`) follow the same logic: `success` passes, `failure`/`error` blocks, `pending` waits. When multiple statuses exist for the same context, only the most recent (by timestamp) is used.

**Guard against premature merges:** If no check runs are registered yet for the SHA (CI hasn't started), the PR is treated as pending — it will not be merged until at least one check appears and completes.

The `process-merge-queue` check (the merge queue workflow itself) is excluded to avoid circular dependencies.

### 5. No unresolved review threads (from any reviewer)

All review comment threads — **from any reviewer, including humans** — must be resolved or outdated. Outdated threads (left on stale diffs that have since been updated) do **not** block the merge. Only unresolved threads on the current diff block.

This is a separate check from `bot-review`. The `bot-review` status only tracks Copilot-authored threads (condition 3 above). This condition is enforced by the merge queue itself and catches unresolved threads from **all** reviewers. If threads are blocking, the merge queue comment lists which reviewer(s) have unresolved threads.

> **Note:** The merge queue currently queries `reviewThreads(first: 100)` without pagination, so only the first 100 review threads per PR are considered. PRs with more than 100 threads may have unresolved threads beyond page one that are not detected.

Note: while human review **approvals** are not required (see below), unresolved human review **comments** will block the merge.

### 6. Non-main branch: `merge-to-parent` label required

For PRs targeting a branch other than `main` (e.g., stacked PRs), **both** labels are required:

- `merge-when-ready`
- `merge-to-parent`

This is a safety mechanism to prevent accidental merges into feature branches.

### What about human review approvals?

Human review **approvals** are not required by the merge queue. The approval gate is Copilot-only, enforced via the `bot-review` status check. The merge queue's own review-approval logic is commented out. That said, when Copilot's clean review triggers an automatic approval from the review bot (`legacy-sports-review-bot[bot]`), non-Dependabot PRs will typically have at least one approval at merge time, although some valid merge paths may not create an approval.

However, unresolved human review **comment threads** do block the merge (condition 5 above). The distinction is: you don't need a human to click "Approve", but if a human leaves a review comment, that thread must be resolved before the PR can merge.

## Merge Method

- **Squash merge** — all commits are squashed into a single commit
- **Commit title** — PR title + PR number (e.g., `feat(auth): add oauth (#42)`)
- **Commit message** — prefixed with "Merged via automated merge queue", followed by the PR body
- **SHA pinning** — the merge is pinned to the validated SHA; if the branch advances after validation, GitHub rejects the merge with a 409

## Post-Merge Operations

After a successful merge, the queue automatically:

1. **Re-targets dependent PRs** — any open PRs that used the merged branch as their base are re-targeted to the original base branch (typically `main`). The `Waiting on Parent` label is removed if present, and a notification comment is posted on each dependent PR with rebase instructions
2. **Deletes the source branch** — cleans up the merged branch on a best-effort basis (failure doesn't affect the merge). Protected branches (`main`, `master`, `develop`) are never deleted
3. **Posts a success comment** — documents the merge method, commit SHA, and timestamp

## Blocker Feedback

When a PR cannot be merged, the queue posts (or updates) a single status comment explaining:

- The specific blocking reason
- Step-by-step instructions to fix it
- A note that the queue retries automatically once the issue is resolved

The comment is updated in place on subsequent runs rather than creating new comments, keeping the PR conversation clean.

## Adding and Removing PRs

### Adding to the queue

**Via GitHub UI:**

1. Open your PR
2. Add the `merge-when-ready` label in the sidebar

**Via CLI:**

```bash
gh pr edit <number> --add-label "merge-when-ready"
```

### Removing from the queue

Remove the `merge-when-ready` label. The queue posts a confirmation comment.

## Manual Controls

### Manual trigger

Go to **Actions > Enhanced Merge Queue > Run workflow** in the GitHub UI.

Options:

- **dry_run** — shows what would happen without actually merging
- **force_check** — checks all labeled PRs even if the trigger event doesn't match

## Troubleshooting

### "PR has merge conflicts"

Rebase or merge main into your branch:

```bash
git fetch origin main
git rebase origin/main
git push --force-with-lease
```

### "Status checks failing"

Check the CI pipeline results, fix failing tests or lint issues, and push. The queue retries automatically when CI completes.

### "Unresolved review comment threads"

Open the **Files changed** tab, find the unresolved threads, and click **Resolve conversation** on each one. Outdated threads (on old diffs) do not need to be resolved. This applies to threads from **all** reviewers — both Copilot and human reviewers.

### "GitHub is still calculating mergeable state"

This is temporary. The queue polls for up to 60 seconds and retries on the next cycle.

### "PR isn't merging after CI passed"

The merge queue has a 30-second debounce after CI completion before it starts processing. If it still hasn't merged after a minute, check the Actions tab for the "Enhanced Merge Queue" workflow run to see which condition is blocking.

### Queue appears stuck

1. Remove and re-add the `merge-when-ready` label
2. Or manually trigger the workflow via the Actions UI

### Green + bot-approved but stuck with a 405 ("N of 8 required status checks are expected")

The queue logs `✅ ready for merge` → `🚀 Merging…` → `❌ 405 — Repository rule violations found`, yet every required check is green and `bot-review` is `success`. This is **not** a merge-queue condition failure — it is a ruleset issue. Two variants:

- **Live `integration_id` drift** — re-sync the ruleset (`bash scripts/apply-ruleset.sh`).
- **Cached per-commit merge verdict** (ruleset already clean, but specific PRs stay blocked forever) — bump the SHA: `node scripts/detect-stalled-prs.mjs --fix`, an empty commit, or a rebase. `ci:run` does **not** fix this — the SHA must change.

Full diagnosis, detection signature, evidence, and dead-ends: [ci-troubleshooting-guide.md → Failure mode: "stalled" PRs](ci-troubleshooting-guide.md#failure-mode-stalled-prs--green--bot-approved-but-merge-blocked).

### Need an immediate merge

Remove the label and merge manually via the GitHub UI or `gh pr merge`.

## Authentication

Two GitHub Apps are involved:

| App                                         | ID                   | Purpose                                                                            | Secrets                                             |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Merge Queue App**                         | `MERGE_QUEUE_APP_ID` | Merges PRs, posts comments, deletes branches, re-targets dependent PRs             | `MERGE_QUEUE_APP_ID`, `MERGE_QUEUE_APP_PRIVATE_KEY` |
| **Review Bot** (`legacy-sports-review-bot`) | `3142924`            | Sets `bot-review` status (via Checks API), approves PRs after clean Copilot review | `BOT_APP_PRIVATE_KEY`                               |

Both use dedicated app tokens (not `GITHUB_TOKEN`) to ensure their actions trigger downstream workflows (e.g., the CI Orchestrator integration build on main). The separation of duties ensures the same app never both authors and approves code.

> **Canonical permissions reference:** See the Separation of Duties table in `.agents/skills/workflow-overview/SKILL.md` for the full permission set per app.

## Related Documentation

- [ci-greenfield-design.md](ci-greenfield-design.md) — Full CI architecture and check details
- [ci-greenfield-copilot-evaluation.md](ci-greenfield-copilot-evaluation.md) — Code Reviewer Bot design and cycle protocol
- [ci-troubleshooting-guide.md](ci-troubleshooting-guide.md) — Diagnosing CI and merge queue failures
- [archive/merge-queue-permissions-fix.md](archive/merge-queue-permissions-fix.md) — Historical: GitHub Actions permissions fix (archived)
- [archive/merge-queue-integration-build-fix.md](archive/merge-queue-integration-build-fix.md) — Historical: post-merge CI dispatch fix (archived)
