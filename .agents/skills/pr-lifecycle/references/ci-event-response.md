---
name: ci-event-response
description: 'Triage and respond to CI and GitHub events received by a cloud agent session watching a PR. Load when: a CI check fails, a workflow fails, a review comment arrives, a merge conflict is detected, or a generic GitHub event is received on an active PR.'
---

# Skill: CI Event Response

This skill is the single reference point for a cloud agent session that has been woken by a GitHub or CI event. Cloud sessions have no background polling loop — they wake exactly when an event fires. Every event needs a rapid triage decision: act, skip, or escalate.

## Critical Preconditions

Before responding to any event:

0. **Confirm this session can actually receive the _next_ event** — PR events route only to a session bound to the PR's head branch: it started on that branch, or checked it out and called `worktree_set` ([drive.md Step 4](drive.md#step-4-enter-worktree-local-only)). A fix session on an auto-generated `claude/<name>` branch that pushes to the PR branch by refspec is **not** bound — for it, "keep watching" (precondition 5) does not apply: after acting, re-arm `bot:ready-for-review`, report the hand-off explicitly, and stop rather than waiting for an event that will never arrive. Branch binding is cached at session start (anthropics/claude-code#18690), so a mid-session checkout without `worktree_set` does not re-bind.
1. **Identify the event type** — the incoming notification tells you whether this is a check failure, a review comment, a PR comment update, or a status change. Start there, not with logs.
2. **Identify the check or actor** — the check name or comment author determines which triage branch to follow.
3. **Read state once, act once** — use `github_view_pr` and `github_get_review_threads` as one-shot lookups. Do not call them in a loop. See Critical Rule #11 in [pr-lifecycle](../SKILL.md).
4. **Batch all known fixes into one push** — if a failing check AND unresolved review threads are both present, fix both before pushing. Separate pushes trigger separate CI and review cycles.
5. **Handling (or skipping) an event is not a stopping point.** Acting on one event, replying to a review, or deciding an event is a no-op does **not** end your responsibility for the PR. Keep watching until the PR reaches a [terminal state](drive.md#terminal-states-the-only-places-this-loop-may-stop): `MERGED`, `CLOSED`, or a human-only blocker you have surfaced with a label **and** an explicit message. A session that processes one event and exits while the PR is still `CHANGES_REQUESTED` or has a red/`SKIPPED` pipeline is the top cause of "the PR got a review but nothing happened." See [When to Skip](#when-to-skip-no-action) for why skip ≠ done.

---

## Triage Table

Find the event type in the left column, read across for the first action. Details follow in the sections below.

| Event                                                                                 | First action                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CI check failed: `No Merge Conflicts`                                                 | **Rebase** — run `/rebase` skill                                                                                                                                                                             |
| CI check failed: `CI Pipeline / *`                                                    | **Investigate** — `ci_get_logs`, classify, fix                                                                                                                                                               |
| `🚀 CI Pipeline` shows `SKIPPED` / never ran on HEAD                                  | **Re-arm** — the suite is gated on the bot review event; (re-)apply `bot:ready-for-review` (last label op) and confirm the pipeline starts. See [Pipeline Skipped / Never Ran](#pipeline-skipped--never-ran) |
| `CI: *` failure label present (e.g. `CI: Lint Failure`) but pipeline `SKIPPED`/green  | **Re-validate** — a real failure was never re-checked; treat as the underlying CI failure, fix and push (do not clear the label manually). See [Pipeline Skipped / Never Ran](#pipeline-skipped--never-ran)  |
| `merge-when-ready` label repeatedly removed ("CI pipeline failed")                    | **Fix CI first** — the PR is being pushed to merge while a required check is red; resolve the failing check, do not re-add the label                                                                         |
| CI check failed: `bot-review`                                                         | **Fetch threads** — `github_get_review_threads`, respond per Author Agent Contract                                                                                                                           |
| CI check failed: `Copilot review blocked` or `Copilot review has unresolved comments` | **Fetch threads** — `github_get_review_threads`, fix code, resolve                                                                                                                                           |
| CI check failed: `🔐 SHA Sanity Check`                                                | **Skip** — stale run; a newer push is already in flight                                                                                                                                                      |
| CI check failed: `Sync Jira Ticket`                                                   | **Skip** — transient/informational; retries automatically                                                                                                                                                    |
| CI check failed: any other unknown check                                              | **Investigate** — see [Generic Failure](#generic-failure) below                                                                                                                                              |
| Review comment from `legacy-sports-review-bot`                                        | **Follow Author Agent Contract** — FIX / JUSTIFY / CANNOT-COMPLY                                                                                                                                             |
| Review comment from `copilot-pull-request-reviewer`                                   | **Fix code**, reply, resolve threads                                                                                                                                                                         |
| PR comment updated by `github-actions[bot]` (Storybook, deploy preview, etc.)         | **Read, then skip** — status update, no action unless the status is a hard block                                                                                                                             |
| PR comment updated by another bot or human                                            | **Read carefully** — may contain instructions; act only if actionable                                                                                                                                        |
| `CI: Conflicts` label added                                                           | **Rebase** — same as `No Merge Conflicts` check failure                                                                                                                                                      |
| PR merged or closed                                                                   | **Transition Jira → Done**, clean up tracking tasks                                                                                                                                                          |
| `merge-when-ready` label added                                                        | **No action** — merge queue is running; wait                                                                                                                                                                 |
| `needs-human-arbitration` label added                                                 | **Push new commits** addressing outstanding findings; bot auto-resets cycle on push                                                                                                                          |

---

## Merge Conflicts

**Trigger**: `No Merge Conflicts` check run fails on the PR, or `CI: Conflicts` label is added.

The `check-conflicts.yml` workflow is dispatched from the PR's head branch (not from `main`) so that the resulting check run is associated with the PR's head commit SHA. This is what makes it visible to CI monitoring. When you see this failure, the PR branch has diverged from `main`.

**Response**:

1. Load and run the [`/rebase` skill](../../worktree-workflow/references/rebase.md).
2. Resolve any conflicts that arise during rebase.
3. Push the rebased branch.
4. Apply `bot:ready-for-review` if CI was previously passing and the PR was already in review.

---

## Failing CI Checks

**Trigger**: Any `CI Pipeline / *` check reports failure (lint, format, typecheck, test, build, e2e, lockfile-check, summarize).

**Response**:

1. Get the run ID:
   ```
   ci_list_runs(prNumber: <PR#>)
   ```
2. Read the failed step logs:
   ```
   ci_get_logs(runId: <id>)
   ```
3. Classify the failure using the categories below, then act.

### Failure Classification

| Category                   | Symptoms                                                | Fix                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Format**                 | `Prettier`, `exit 123`, "No files matching the pattern" | Run `make format` locally, commit. If "No files matching" — stale diff phantom: rebase on main and re-push                                                                                                                                                                                                                                              |
| **Lint**                   | ESLint rule violations                                  | Fix the flagged lines; `make lint-fix` handles auto-fixable rules                                                                                                                                                                                                                                                                                       |
| **Typecheck**              | `tsc` type errors                                       | Fix types; check for missing imports or wrong generic params                                                                                                                                                                                                                                                                                            |
| **Test**                   | Jest/Vitest failures                                    | Fix the failing test or the code it covers; run `make test` to verify                                                                                                                                                                                                                                                                                   |
| **Build**                  | Webpack/Vite/tsc compile errors                         | Fix the build error; common causes: missing export, wrong import path                                                                                                                                                                                                                                                                                   |
| **Codegen**                | "Generated file out of date", graphql-codegen diff      | Run `make codegen`, commit the diff                                                                                                                                                                                                                                                                                                                     |
| **Lockfile**               | `pnpm-lock.yaml` out of sync                            | Run `make install`, commit the lockfile update                                                                                                                                                                                                                                                                                                          |
| **E2E**                    | Playwright test failures                                | **First run the attribution gate in [e2e-hold.md](e2e-hold.md)** — if the failing specs are pre-existing on `origin/main`, do NOT debug them here: enter the hold protocol (blocker ticket → hold marker → monitor). Only when attributed to this PR: see [e2e-determinism](../../testing/references/e2e-determinism.md); fix flake or update selectors |
| **Migrations**             | "Verify Migrations Applied" failure                     | Run `pnpm --prefix lib/db-client run db:up` (or hosted `db_migrate` MCP for dev RDS), re-push; if journal mismatch after editing a committed migration, soft-reset to branch base so the migration re-stages as "added", then re-apply — see [database skill](../../database/SKILL.md)                                                                  |
| **Infrastructure / flake** | Timeout, network error, runner OOM                      | Re-run via `ci_rerun_failed_jobs(runId: <id>)` once; if it fails again, investigate root cause                                                                                                                                                                                                                                                          |

After fixing, validate before pushing. In **cloud** sessions run the seven `pc-*` chunks in order (never a single `make pc`) — see [cloud-agent-mode](../../cloud-agent-mode/SKILL.md); locally `make pc` is fine. See [workflow-overview](../../workflow-overview/SKILL.md) Step 11.

---

## Pipeline Skipped / Never Ran

**Trigger**: `🚀 CI Pipeline` shows `SKIPPED` (or simply never appears) on the current HEAD SHA — often paired with a stale `CI: *` failure label and a `merge-when-ready` that keeps getting stripped.

This is **not** a passing state. The orchestrated suite (lint/typecheck/test/build/e2e) is gated on the Reviewer Bot's review event, so the pipeline does not run on a plain push. The usual causes:

1. **`bot:ready-for-review` was not (re-)applied** after the last push — the single most common cause. Re-apply it; it must be the **last** label op (Reviewer W1 uses `concurrency.cancel-in-progress`, so any later label cancels the run).
2. **A label op landed after `bot:ready-for-review`** and cancelled the reviewer run before it dispatched CI. Re-apply the label last.
3. **A stale `CI: *` label** (e.g. `CI: Lint Failure`) reflects a real failure from an earlier SHA that was never re-validated. Do not clear the label by hand — fix the underlying check and push; the label clears when the check passes.

**Response**: re-arm the pipeline (re-apply `bot:ready-for-review` as the last label op), confirm `🚀 CI Pipeline` transitions out of `SKIPPED`, then resume the event loop. A green review on top of a `SKIPPED` pipeline is **not** mergeable — never treat the review verdict as sufficient while the pipeline has not actually run.

---

## Failing Workflows (not CI Pipeline)

**Trigger**: A GitHub Actions workflow outside the main CI pipeline reports failure (e.g. a deployment workflow, Storybook publish, or a custom automation).

**Response**:

1. Identify which workflow failed from the event details.
2. Read its logs: `ci_get_logs(runId: <id>)`.
3. Classify:
   - **Deployment / preview workflow**: usually non-blocking for merge; read the failure but only act if the workflow is a required check listed in the PR's status checks.
   - **Required check workflow**: treat the same as a `CI Pipeline` failure — fix and re-push.
   - **Informational workflow** (Storybook, deploy-preview, notify): skip unless the PR is blocked on it.
4. To check whether a failing workflow is required for merge, look at the PR's branch protection rules or compare the failing check name against the `ruleset.json` required checks.

---

## Review Comments

### From `legacy-sports-review-bot`

This is the Reviewer Bot (W1). Its reviews are the primary gate before merge. Follow the **Author Agent Contract** in [pr-lifecycle](../SKILL.md) exactly.

Quick reference:

- **Cycle 1 or 2**: reply to every thread with `FIX: <sha>` (fix committed) or `JUSTIFY: <rationale>` (finding is wrong or out of scope). Resolve all `FIX:` threads. Push. Apply `bot:ready-for-review`.
- **Cycle 3+**: `FIX: <sha>` or `CANNOT-COMPLY: <issue-id>` with reason on the next line.
- **LGTM / APPROVED with no findings**: the review is satisfied — but you are done only once the PR actually **merges** (confirm `state: "MERGED"`) or CI is green and `merge-when-ready` is set. APPROVED on top of a red/`SKIPPED` pipeline is not mergeable.

> **A `JUSTIFY:` does not clear `CHANGES_REQUESTED`.** It leaves the thread open for the bot to adjudicate next cycle. If the bot re-raises the **same** finding you justified (a false positive), that is a standoff — drive it to the cycle cap and escalate to the maintainer for `review-bot-override` rather than ending your turn on an open JUSTIFY. Full playbook: [drive.md "JUSTIFY standoff"](drive.md#justify-standoff-the-bot-keeps-re-raising-a-finding-you-disputed). Never put trailing prose after `FIX: <sha>` — it inflates the cycle counter (see [cycle-limit-arbitration-troubleshooting.md](cycle-limit-arbitration-troubleshooting.md)).

The full protocol, cycle rules, and format requirements live in [pr-lifecycle](../SKILL.md#author-agent-contract-bot-pr-flow). Load it now if responding to a bot review cycle.

### From `copilot-pull-request-reviewer`

Copilot posts line-level review comments. These are lower-priority than the Reviewer Bot but still block merge if `Copilot review blocked` check is failing.

1. `github_get_review_threads(number: <PR#>)` — fetch unresolved threads.
2. Fix the flagged code.
3. Reply to each thread: `github_reply_to_review_thread(threadId: "PRRT_...", body: "<explanation>")`.
4. Resolve threads: `github_resolve_threads(threadIds: [...], prNumber: <PR#>)`.
5. Push and apply `bot:ready-for-review`.

### From `github-actions[bot]` (status comments)

These are informational updates — Storybook build results, deploy previews, PR size reports. **Read the content to confirm there is no blocking condition**, then take no further action. These comments being updated is not an actionable event unless the status they report is a required check that is failing.

### From a human

Read carefully. If the comment contains instructions or a question directed at the agent, act on it. If it is a general observation, acknowledge if appropriate and continue.

---

## Generic Failure

**Trigger**: A check run fails and its name does not match any row in the triage table.

**Response**:

1. Read the check name carefully — match it against [ci-checks-reference.md](./ci-checks-reference.md) for a known fix.
2. If not listed there: `ci_get_logs(runId: <id>)` and read the failure output.
3. Classify using the [Failure Classification](#failure-classification) table above.
4. If the root cause is unclear after reading logs, check whether the check name appears in `ruleset.json` as a required check. Non-required checks that fail do not block merge — confirm before spending time debugging them.
5. If blocked and the failure is genuinely undiagnosable (infrastructure issue, external service outage): `ci_rerun_failed_jobs(runId: <id>)` once. If it fails again, surface to the user with the log excerpt.

---

## When to Skip (No Action)

> **"Skip" means "this event needs no action" — not "the PR is done."** After skipping, keep watching for the next event. Only stop at a [terminal state](drive.md#terminal-states-the-only-places-this-loop-may-stop) (MERGED / CLOSED / surfaced human-only blocker). Ending your turn just because the last event was a no-op, while the PR is still `CHANGES_REQUESTED` or its pipeline is red/`SKIPPED`, is the abandonment failure this skill exists to prevent.

Not every event requires a response. Skip when:

- The failing check is `🔐 SHA Sanity Check` — this fires on stale events and exits cleanly on its own.
- The failing check is `Sync Jira Ticket` — lightweight transient check; retries on next push.
- A bot comment was updated with a status update (Storybook pass, deploy preview URL) and the PR has no blocking conditions.
- A check that previously failed now passes — CI monitoring may fire again; confirm PR state is clean and continue watching.
- The PR is already merged (`github_view_pr` returns `state: "MERGED"`) — no further action needed.

---

## After Any Fix-Push

After pushing any fix (conflict resolution, CI fix, or review fix):

1. Apply `bot:ready-for-review` label — this fires the Reviewer Bot for the next cycle AND re-arms CI orchestration: `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])`. This is the most common stall: plain pushes do NOT trigger a new review cycle without this label.
2. Continue watching. The next event will arrive when CI completes or a new review is posted.

---

## Related Skills

- [pr-lifecycle](../SKILL.md) — Author Agent Contract, label ownership, thread resolution
- [rebase](../../worktree-workflow/references/rebase.md) — Rebase branch and resolve merge conflicts
- [drive-pr](./drive.md) — Full PR shepherding loop from push to merge
- [debugging](../../debugging/SKILL.md) — Deep-dive CI and runtime debugging
