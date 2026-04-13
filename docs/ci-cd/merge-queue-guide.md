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

### 3. Copilot review passed (`bot-review` status check)

Every PR requires a passing Copilot code review, enforced via the `bot-review` commit status. This is managed by a separate workflow (`.github/workflows/copilot-auto-approve.yml`) that works as follows:

1. **PR opened/updated** — the `request-review` job sets `bot-review` to `pending` ("Waiting for Copilot review to complete")
2. **Copilot reviews the PR** — triggered automatically by the repository ruleset ("Copilot review for default branch" with `review_on_push: true`)
3. **Copilot review completes** — the `auto-approve` job fires via `workflow_run` off the built-in "Copilot code review" workflow:
   - **No unresolved threads** → `bot-review` set to `success`, the PR is approved by the review bot (`legacy-sports-review-bot`), and `merge-when-ready` is added automatically
   - **Unresolved threads exist** → `bot-review` set to `failure`
   - **Copilot workflow failed/cancelled** → `bot-review` set to `failure`
4. **Review threads resolved later** — the `review-check` job (triggered by `pull_request_review` events) re-evaluates thread state. If all Copilot threads are resolved or outdated, it flips `bot-review` to `success` and approves
5. **Rebase/force-push** — if Copilot already has a clean review (approved or all threads resolved/outdated), the status is carried forward to the new SHA without waiting for Copilot to re-review. The carry-forward also re-creates the bot approval and adds the `merge-when-ready` label if missing

**Dependabot PRs** get an automatic `bot-review` pass (Copilot review is skipped).

A **manual recheck** is available via workflow dispatch with a PR number, useful when threads are resolved without pushing code.

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

### Need an immediate merge

Remove the label and merge manually via the GitHub UI or `gh pr merge`.

## Authentication

Two GitHub Apps are involved:

| App                                         | ID                   | Purpose                                                                | Secrets                                             |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| **Merge Queue App**                         | `MERGE_QUEUE_APP_ID` | Merges PRs, posts comments, deletes branches, re-targets dependent PRs | `MERGE_QUEUE_APP_ID`, `MERGE_QUEUE_APP_PRIVATE_KEY` |
| **Review Bot** (`legacy-sports-review-bot`) | `3142924`            | Sets `bot-review` status, approves PRs after clean Copilot review      | `BOT_APP_PRIVATE_KEY`                               |

Both use dedicated app tokens (not `GITHUB_TOKEN`) to ensure their actions trigger downstream workflows (e.g., the CI Orchestrator integration build on main). The separation of duties ensures the same app never both authors and approves code.

## Related Documentation

- [CI Pipeline Requirements](ci-pipeline-requirements.md) — CI architecture and check details
- [Merge Queue Permissions Fix](merge-queue-permissions-fix.md) — GitHub Actions permissions setup
- [Merge Queue Integration Build Fix](merge-queue-integration-build-fix.md) — post-merge CI dispatch
