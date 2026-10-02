---
name: ci-event-response
description: 'Triage and respond to CI and GitHub events received by a cloud agent session watching a PR. Load when: a CI check fails, a workflow fails, a review comment arrives, a merge conflict is detected, or a generic GitHub event is received on an active PR.'
---

# Skill: CI Event Response

This skill is the single reference point for an agent session that has been woken by a GitHub or CI event. A wake arrives either as a native push notification or — in Claude Code sessions — as an event line from the armed watch monitor (`scripts/watch-pr.sh`, armed per [drive.md Step 6](drive.md#step-6-event-handling-loop); the watch is load-bearing, notifications are an accelerant). Every event needs a rapid triage decision: act, skip, or escalate.

## Critical Preconditions

Before responding to any event:

0. **Confirm this session can actually receive the _next_ event** — PR events route only to a session bound to the PR's head branch: it started on that branch, or checked it out and called `worktree_set` ([drive.md Step 4](drive.md#step-4-enter-worktree-local-only)). A fix session on an auto-generated `claude/<name>` branch that pushes to the PR branch by refspec is **not** bound — for it, "keep watching" (precondition 5) does not apply: after acting, re-arm `bot:ready-for-review`, report the hand-off explicitly, and stop rather than waiting for an event that will never arrive. Branch binding is cached at session start (anthropics/claude-code#18690), so a mid-session checkout without `worktree_set` does not re-bind.
1. **Identify the event type** — the incoming notification tells you whether this is a check failure, a review comment, a PR comment update, or a status change. Start there, not with logs.
2. **Identify the check or actor** — the check name or comment author determines which triage branch to follow.
3. **Read state once, act once** — use `github_view_pr` and `github_get_review_threads` as one-shot lookups. Do not call them in a loop. See Critical Rule #11 in [pr-lifecycle](../SKILL.md).
4. **Batch all known fixes into one push** — if a failing check AND unresolved review threads are both present, fix both before pushing. Separate pushes trigger separate CI and review cycles.
5. **Handling (or skipping) an event is not a stopping point.** Acting on one event, replying to a review, or deciding an event is a no-op does **not** end your responsibility for the PR. Keep watching until the PR reaches a [terminal state](drive.md#terminal-states-the-only-places-this-loop-may-stop): `MERGED`, `CLOSED`, or a human-only blocker you have surfaced with a label **and** an explicit message. **Ending the _turn_ is not abandoning the _loop_.** With the next wake armed — watch monitor, or a one-shot reminder per the [Periodic Wake Protocol](../../mcp-first/references/waiting-and-wakeups.md#periodic-wake-protocol) — ending your turn silently is correct and expected: it is what makes a no-op wake cost nothing. The failure is ending a turn with **nothing armed** while the PR is still `CHANGES_REQUESTED` or has a red/`SKIPPED` pipeline — that is the top cause of "the PR got a review but nothing happened." See [When to Skip](#when-to-skip-no-action) for why skip ≠ done.

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

`check-conflicts.yml` runs on PR-side events (opened/synchronize/reopened/edited). When _main_ advances instead, `check-conflicts-sweep.yml` detects the conflict and POSTs a fresh API-owned `No Merge Conflicts` check run onto the PR's head SHA (newest-run-wins), plus the `CI: Conflicts` label and a sticky comment. **Neither path produces an event that wakes an idle session on its own** — the armed watch monitor is what delivers this trigger (LS-8544). When you see it, the PR branch has diverged from `main`.

**Response**:

1. Load and run the [`/rebase` skill](../../worktree-workflow/references/rebase.md).
2. Resolve any conflicts that arise during rebase.
3. Push the rebased branch.
4. Do **not** re-apply `bot:ready-for-review` — see [When to re-apply `bot:ready-for-review`](#when-to-re-apply-botready-for-review).

### When to re-apply `bot:ready-for-review`

One rule for this file, [fix.md](fix.md) and [waiting-and-wakeups](../../mcp-first/references/waiting-and-wakeups.md#conflicted-and-behind-ls-10377): the label is a trigger that is **already on** a PR in review, and a push (`synchronize`) re-fires CI and the Reviewer by itself. After a conflict rebase or any fix push, check it is present and add it **only if it is missing** (stripped, or the PR was never marked ready). Re-apply deliberately — remove and re-add, as the **last** label op — only in the [stall playbook](#pipeline-skipped--never-ran) or for `review-bot-degraded`. Never as the response to a conflict. This is consistent with [Critical Rule 14](critical-rules.md#critical-rules) ("apply after every fix-push") and the PR template: `review.yml` fires on `synchronize` only when the label is already present, and applying an already-present label starts nothing — so "apply" means "make sure it is on", which a presence check satisfies without a redundant label op.

---

## Failing CI Checks

**Trigger**: Any `CI Pipeline / *` check reports failure (lint, format, typecheck, test, build, e2e, lockfile-check, summarize).

**Response**:

0. **Step 0: stale-base check (MANDATORY — before reading logs, rerunning, or editing code).** CI runs on `refs/pull/N/merge`, so a branch that fell behind `main` can fail on something `main` already fixed (the most common false CI failure: LS-9529, 9541/9545/9550, 9800, 9300, 10207). Answer these in order — one `github_pr_why_blocked({ number: <PR#> })` call covers 1–2:
   1. **How far behind?** Read `behindBy` (commits on the base ref the PR head lacks). Shell fallback: `git fetch origin && git rev-list --count HEAD..origin/main`.
   2. **Does the check fail on `main` too / was it fixed after my merge base?** `hint: "STALE_BASE"` (present on `CI_FAILING` when `behindBy >= 1` and a failing check is green on the base tip) means yes — `details.staleBase` names `greenOnBase` / `failingOnBase`. No hint but `behindBy >= 1`: check `ci_list_runs({ branch: "main", limit: 1 })`; red on `main` too → not this PR's failure (see [e2e-hold.md](e2e-hold.md) / file a blocker), do not code-fix it here.
   3. **Is a known fix in my history?** Red checks in files outside the diff → `git merge-base --is-ancestor <fix-sha> HEAD`: exit `0` = fix already included (failure is real), exit `1` = fix is on `main` but not in this branch → rebase.
   4. **Rerun vs rebase rule.** `behindBy >= 1` with `STALE_BASE` (or a non-flake failure class — typecheck/test/build/"No files matching" — with `behindBy >= 1`) → **rebase onto `main` and push a real commit** (default per the [rebase-vs-merge rule](../../worktree-workflow/references/rebase.md#rebase-vs-merge-main-one-rule-ls-10377)); never `ci_rerun` — a rerun replays the old `refs/pull/N/merge` snapshot and reproduces the stale failure (LS-9638). `ci_rerun` is only for `behindBy == 0` infra/flake failures (timeout, network, OOM). `behindBy == 0`, no hint → continue to step 1 below.
   5. **Test-count-mismatch tell.** If local `make test` passes but CI fails, or the test counts differ between local and CI, you are behind `main` (CI tested the merge ref, which contains tests/code your branch lacks) — apply 1–4 before debugging.
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
| **Infrastructure / flake** | Timeout, network error, runner OOM                      | Re-run via `ci_rerun(runId: <id>)` once; if it fails again, investigate root cause                                                                                                                                                                                                                                                                      |

After fixing, validate before pushing. In **cloud** sessions run the seven `pc-*` chunks in order (never a single `make pc`) — see [cloud-agent-mode](../../cloud-agent-mode/SKILL.md); locally `make pc` is fine. See [workflow-overview](../../workflow-overview/SKILL.md) Step 11.

---

## Pipeline Skipped / Never Ran

**Trigger**: `🚀 CI Pipeline` shows `SKIPPED` (or simply never appears) on the current HEAD SHA — often paired with a stale `CI: *` failure label and a `merge-when-ready` that keeps getting stripped.

This is **not** a passing state. The orchestrated suite (lint/typecheck/test/build/e2e) is gated on the Reviewer Bot's review event, so the pipeline does not run on a plain push. The usual causes:

1. **`bot:ready-for-review` was not (re-)applied** after the last push — the single most common cause. Re-apply it; it must be the **last** label op (see the ⛔ note in [SKILL.md](../SKILL.md) — since PR #4738 only the review-trigger labels and pushes can cancel an active W1 run, but label-last ordering remains required hygiene).
2. **The Reviewer (W1) run died before posting any `bot-review` status** (LS-9209) — external run cancellation, a `check-runner-access` failure, or the review job queued forever on a starved self-hosted runner. Symptom: `github_pr_why_blocked` reports `bot-review (not yet registered)` (or a `bot-review` pending stuck >45 min) while the PR carries `bot:ready-for-review`. Since LS-9209, W1 posts a `bot-review: pending` footprint seconds into every qualifying run, and the merge-queue processor's review-stall sweep self-heals stalled PRs (queued or not) on its next wake by **cycling** the label — a bare re-add fires no event. After 2 dead re-triggers on one SHA it stops retrying and posts a terminal `bot-review` failure + `needs-human-arbitration`. Manual recovery (idle repo, or you want it now): remove then re-add `bot:ready-for-review`.
3. **A stale `CI: *` label** (e.g. `CI: Lint Failure`) reflects a real failure from an earlier SHA that was never re-validated. Do not clear the label by hand — fix the underlying check and push; the label clears when the check passes.

**Response**: re-arm the pipeline (re-apply `bot:ready-for-review` as the last label op — remove first if already present, so a fresh `labeled` event fires), confirm `🚀 CI Pipeline` transitions out of `SKIPPED`, then resume the event loop. A green review on top of a `SKIPPED` pipeline is **not** mergeable — never treat the review verdict as sufficient while the pipeline has not actually run.

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

The full protocol, cycle rules, and format requirements live in [Author Agent Contract](author-agent-contract.md). Load it now if responding to a bot review cycle.

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
5. If blocked and the failure is genuinely undiagnosable (infrastructure issue, external service outage): `ci_rerun(runId: <id>)` once. If it fails again, surface to the user with the log excerpt.

---

## Wakes and re-arming

How this session is woken, at what cadence, and what to do on a wake that needs no action — including the **Periodic Wake Protocol** for environments without `gh` (CCR) — live in **[mcp-first / waiting-and-wakeups](../../mcp-first/references/waiting-and-wakeups.md)**. That file is the single home for wake doctrine; this one owns event _triage_ only.

Two rules from there govern every branch below: **re-arm conditionally** (terminal and wedge branches do not re-arm) and **silent branches are silent** (no prose, no PR comment, no status post).

---

## When to Skip (No Action)

> **"Skip" means "this event needs no action" — not "the PR is done."** After skipping, keep watching for the next event. Only stop at a [terminal state](drive.md#terminal-states-the-only-places-this-loop-may-stop) (MERGED / CLOSED / surfaced human-only blocker). Ending your turn on a no-op is fine — expected, even — **so long as the next wake is armed**; see [Invariant 3](../../mcp-first/references/waiting-and-wakeups.md#invariants), which requires those turns be silent. What this skill exists to prevent is ending a turn with **nothing armed** while the PR is still `CHANGES_REQUESTED` or its pipeline is red/`SKIPPED`.

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
2. Confirm the watch monitor is still armed — if `.claude/.pr-watch-armed-<PR#>` is stale (>5 min) or absent, re-arm it before idling, always with an **absolute** script path (`Monitor` does not reliably run with the worktree root as its cwd — a bare relative path exits 127, LS-9045):

   ```
   Monitor({ command: "bash <worktree-abs-path>/scripts/watch-pr.sh <PR#>",
             persistent: true, description: "PR #<N> watch" })
   ```

3. Continue watching. The next event will arrive when CI completes or a new review is posted.

---

## Related Skills

- [pr-lifecycle](../SKILL.md) — Author Agent Contract, label ownership, thread resolution
- [rebase](../../worktree-workflow/references/rebase.md) — Rebase branch and resolve merge conflicts
- [drive-pr](./drive.md) — Full PR shepherding loop from push to merge
- [debugging](../../debugging/SKILL.md) — Deep-dive CI and runtime debugging
