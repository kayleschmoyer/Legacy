# CI/CD Greenfield System — Validation Report

> Records end-to-end validation runs for the greenfield CI/Bot-Review system (LS-3857 epic). Each
> section documents one validation scenario, its acceptance criteria, observed behavior, and any
> deviations from the spec.

## §1 Status Summary

| Scenario | Ticket | Date | Result | Notes |
|----------|--------|------|--------|-------|
| V1 — Trivial happy path | LS-3903 | 2026-04-28 | ✅ Pass | 3 design gaps documented (see §2 Deviations) |
| V1 re-run v3 (LS-3938 + LS-3939 fixes) | LS-3940 | 2026-04-28 | 🟡 Partial | All ACs pass; 1 residual gap: conflict check still needs PAT workaround (see §3) |
| V1 re-run v4 (LS-3940 fix) | — | 2026-04-28 | ✅ Pass | Fully automated — zero manual steps (see §4) |

---

## §2 V1 — Trivial Happy Path

**Description:** Validate the simplest end-to-end path: a trivial bot-authored PR that progresses
through draft → ready_for_review → bot APPROVE → CI pipeline → merge queue → merged to main.

**Test PR:** https://github.com/bkrupa/legacy-sports/pull/3373
**Branch:** `validation/v1-trivial-rerun`
**Probe file:** `.github/validation-probes/v1-trivial-rerun.txt`
**Date completed:** 2026-04-28

### Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC1 | No CI or W1 fires while PR is draft | ✅ Pass | No W1 or CI Orchestrator runs for branch while in draft state |
| AC2 | W1 fires exactly once on `ready_for_review` | ✅ Pass | [W1 run 25028319150](https://github.com/bkrupa/legacy-sports/actions/runs/25028319150) triggered by `pull_request:ready_for_review` |
| AC3 | Bot posts `APPROVE` on first pass | ✅ Pass | `legacy-sports-review-bot[bot]` approved PR #3373 in W1 run; log: `Real review posted (APPROVE): 0 blocking, 0 non-blocking inline` |
| AC4 | No critical/high inline comments | ✅ Pass | W1 log: `Gating: 0 blocking, 0 non-blocking, 0 trivia dropped`; probe file (plain text) produced no findings |
| AC5 | CI Orchestrator fires after bot approval | ✅ Pass | [CI Orchestrator run 25028331554](https://github.com/bkrupa/legacy-sports/actions/runs/25028331554) triggered by `pull_request_review.submitted` from bot; quality-gates, build-validation, e2e all skipped (no affected projects); summarize passed |
| AC6 | Merge queue runs and PR merges to main | ✅ Pass | [Merge queue run 25029847127](https://github.com/bkrupa/legacy-sports/actions/runs/25029847127) ran 02:03:30–02:05:22Z; PR merged at `2026-04-28T02:03:45Z` |

### Evidence

| Artifact | Link |
|----------|------|
| Test PR #3373 | https://github.com/bkrupa/legacy-sports/pull/3373 |
| W1 Reviewer run | https://github.com/bkrupa/legacy-sports/actions/runs/25028319150 |
| CI Orchestrator run | https://github.com/bkrupa/legacy-sports/actions/runs/25028331554 |
| No Merge Conflicts check | https://github.com/bkrupa/legacy-sports/actions/runs/25029234079 |
| Merge queue run | https://github.com/bkrupa/legacy-sports/actions/runs/25029847127 |

### Deviations from Spec

Three gaps between the design spec (`docs/ci-cd/ci-greenfield-design.md`) and the running system were
discovered during this validation:

#### Gap 1 — `merge-when-ready` label not auto-applied by reviewer

**Spec says:** After a clean review, the bot also adds the `merge-when-ready` label
(design doc §"Bot-Driven Code Review": "When `bot-review` transitions to `success`, the bot also
adds the `merge-when-ready` label.").

**Observed:** The reviewer script (`.github/scripts/reviewer/index.mjs`) posts the APPROVE review
and removes `bot:ready-for-review` / `review-bot-degraded` labels, but does **not** add
`merge-when-ready`. The label had to be applied manually via `gh pr edit --add-label`.

**Impact:** Without the label, the merge queue processor will not pick up the PR and it will never
merge automatically. This is a blocking gap for any production bot-authored PR.

#### Gap 2 — `bot-review` commit status never set

**Spec says:** The reviewer script sets a `bot-review` commit status (`pending` → `success` or
`failure`) via the Checks API. The merge queue processor checks `bot-review = success` as a merge
condition.

**Observed:** No `bot-review` status was observed on PR #3373. The merge queue processor in
`.github/scripts/merge-queue-processor.js` calls `validateStatusChecks` which reads required checks
from the branch protection ruleset — because `bot-review` is not a configured required check, the
condition was skipped rather than blocking. The merge succeeded without this status being set.

**Impact:** The `bot-review` commit status described in the design is not implemented. The merge
queue currently merges on passing required checks only (i.e., `No Merge Conflicts`), not on
`bot-review = success`. This is a correctness gap — PRs could merge without a successful review
if `merge-when-ready` were applied by other means.

#### Gap 3 — `No Merge Conflicts` check does not run for bot-created PRs

**Spec says:** `check-conflicts.yml` runs on every PR and provides the `No Merge Conflicts`
required status check.

**Observed:** PRs created via `GITHUB_TOKEN` inside a GitHub Actions workflow are subject to
GitHub's anti-loop protection — the `pull_request.opened` event is not delivered to workflows in
the same repository. Because `check-conflicts.yml` triggers only on
`pull_request.{opened,synchronize,reopened}`, the check never ran for PR #3373, leaving the PR
BLOCKED with "Required status check: No Merge Conflicts — Expected — Waiting for status to be
reported."

**Workaround used:** Pushed an empty commit to the PR branch via the GitHub REST API (create a
commit with the same tree SHA, then PATCH the ref). This triggered `pull_request.synchronize`,
which caused `check-conflicts.yml` to run and report success.

**Impact:** Any bot-created PR will hit this gap. A `workflow_dispatch` trigger on
`check-conflicts.yml` (or a targeted `repository_dispatch`) could resolve it without requiring an
empty commit.

### Notes

- **Prior runs:** Two earlier runs against this ticket failed — first used a human-authored PR
  (reviewer's bot-author guard at `index.mjs:63–68` skips non-bot authors), second used a
  bot-authored PR but failed because `COPILOT_SERVICE_ACCOUNT_PAT` was absent. Both issues were
  resolved before this run (LS-3924 wired credentials; LS-3930 switched LLM provider to GitHub
  Models).
- **Stale merge queue run:** A queued merge queue run (25002600746) had been holding the
  `merge-queue` concurrency group for 11+ hours, blocking all subsequent merge queue processing.
  Cancelled manually (`gh run cancel 25002600746`) to unblock. Root cause: the run was triggered
  when the PR was not yet in a mergeable state and the queue processor apparently did not exit
  cleanly, leaving the runner reservation open.

---

## §3 V1 Re-run v3 — LS-3938 + LS-3939 Fix Verification

**Description:** Re-validate the full V1 path after LS-3938 (App-token empty-commit push) and
LS-3939 (merge queue `workflow_run` condition) fixes landed. Goal was a fully hands-off flow with
no manual steps; this run exposed one residual gap requiring a PAT workaround (see Deviation).

**Test PR:** https://github.com/bkrupa/legacy-sports/pull/3383
**Branch:** `validation/v1-full-auto-v3`
**Probe file:** `.github/validation-probes/v1-full-auto-v3.txt`
**Date completed:** 2026-04-28

### Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC1 | No CI or W1 fires while PR is draft | ✅ Pass | No runs on branch while draft |
| AC2 | W1 fires exactly once on `ready_for_review` | ✅ Pass | [W1 run 25033762747](https://github.com/bkrupa/legacy-sports/actions/runs/25033762747) |
| AC3 | Bot posts `APPROVE` on first pass | ✅ Pass | `legacy-sports-review-bot[bot]` approved PR #3383 |
| AC4 | No critical/high inline comments | ✅ Pass | Clean probe file, no findings |
| AC5 | CI Orchestrator fires after bot approval | ✅ Pass | [CI Orchestrator run 25033774278](https://github.com/bkrupa/legacy-sports/actions/runs/25033774278) triggered by `pull_request_review` from bot |
| AC6 | Merge queue runs and PR merges to main | ✅ Pass | PR #3383 merged at `2026-04-28T04:36:21Z` |

### Evidence

| Artifact | Link |
|----------|------|
| Test PR #3383 | https://github.com/bkrupa/legacy-sports/pull/3383 |
| W1 Reviewer run | https://github.com/bkrupa/legacy-sports/actions/runs/25033762747 |
| CI Orchestrator run | https://github.com/bkrupa/legacy-sports/actions/runs/25033774278 |
| Merge queue run (auto via workflow_run) | https://github.com/bkrupa/legacy-sports/actions/runs/25033774219 |
| No Merge Conflicts (PAT workaround) | https://github.com/bkrupa/legacy-sports/actions/runs/25034111294 |
| Merge queue run (final dispatch) | https://github.com/bkrupa/legacy-sports/actions/runs/25034137302 |

### LS-3939 Fix — Confirmed Working

The merge queue fired automatically via `workflow_run` when the CI Orchestrator completed (run
25033774219). The CI Orchestrator had itself been triggered by the bot's `pull_request_review`
approval event; its completion then fired the `workflow_run` that re-triggered the merge queue. The
merge queue evaluated the PR, found `No Merge Conflicts` still pending, and returned `success`
without merging. Once the conflict check passed, a manual `gh workflow run merge-queue.yml`
dispatch merged the PR. The automatic re-trigger path is confirmed functional.

### Deviation — LS-3938 Fix Incomplete

**Observed:** The LS-3938 fix (using a GitHub App installation token for the empty-commit push
in `code-writer-bot.yml`) did **not** trigger `pull_request.synchronize` workflows. The empty
commit was pushed successfully at `04:22:19Z` using the `legacy-sports-review-bot` App token,
but no `github-actions` check suite was created on that commit SHA until `gh pr ready` was
called at `04:22:45Z`.

**Root cause:** GitHub does not deliver `pull_request.synchronize` events to Actions workflows
when the commit is pushed to a **draft PR**, regardless of the token type used (GITHUB_TOKEN or
GitHub App installation token). The event is only suppressed by anti-loop protection for
GITHUB_TOKEN pushes; for App tokens the suppression appears to apply specifically to draft PRs.

**Workaround used:** Pushed a commit via the GitHub REST API using the session PAT (outside a
workflow context). This fired `pull_request.synchronize` and triggered `check-conflicts.yml`.

**Fix:** Add `ready_for_review` to `check-conflicts.yml`'s `pull_request.types` list. This
ensures the conflict check fires when a draft PR transitions to ready — the exact moment
`code-writer-bot.yml` completes and W1 begins reviewing. No token bypass is needed.

**Ticket:** [LS-3940](https://bkrupa.atlassian.net/browse/LS-3940)

---

## §4 V1 Re-run v4 — LS-3940 Fix Verification (Clean Run)

**Description:** Re-validate the full V1 path after LS-3940 (`ready_for_review` trigger added to
`check-conflicts.yml`). Goal: completely hands-off — zero manual steps from draft creation to
merge.

**Test PR:** https://github.com/bkrupa/legacy-sports/pull/3386
**Branch:** `validation/v1-full-auto-v4`
**Probe file:** `.github/validation-probes/v1-full-auto-v4.txt`
**Date completed:** 2026-04-28

### Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC1 | No CI or W1 fires while PR is draft | ✅ Pass | No runs on branch while draft |
| AC2 | W1 fires exactly once on `ready_for_review` | ✅ Pass | [W1 run 25034743418](https://github.com/bkrupa/legacy-sports/actions/runs/25034743418) |
| AC3 | Bot posts `APPROVE` on first pass | ✅ Pass | `legacy-sports-review-bot[bot]` approved PR #3386 |
| AC4 | No critical/high inline comments | ✅ Pass | Clean probe file, no findings |
| AC5 | CI Orchestrator fires after bot approval | ✅ Pass | [CI Orchestrator run 25034754119](https://github.com/bkrupa/legacy-sports/actions/runs/25034754119) triggered by `pull_request_review` from bot |
| AC6 | Merge queue runs and PR merges to main | ✅ Pass | PR #3386 merged at `2026-04-28T05:06:07Z` |

### Evidence

| Artifact | Link |
|----------|------|
| Test PR #3386 | https://github.com/bkrupa/legacy-sports/pull/3386 |
| W1 Reviewer run | https://github.com/bkrupa/legacy-sports/actions/runs/25034743418 |
| No Merge Conflicts (auto via ready_for_review) | https://github.com/bkrupa/legacy-sports/actions/runs/25034743419 |
| CI Orchestrator run | https://github.com/bkrupa/legacy-sports/actions/runs/25034754119 |
| Merge queue run 1 (pull_request_review) | https://github.com/bkrupa/legacy-sports/actions/runs/25034754042 |
| Merge queue run 2 (workflow_run after CI) | https://github.com/bkrupa/legacy-sports/actions/runs/25034961267 |

### Notes

- **Fully automated — no manual steps.** The entire flow from `gh pr ready` to merged took ~8 minutes with zero human intervention.
- **`check-conflicts.yml` fired on `ready_for_review`** (LS-3940 fix): triggered at the same second as W1 (`04:57:41Z`), completed `No Merge Conflicts: success` before the merge queue evaluated conditions.
- **Merge queue fired twice as designed:**
  1. On bot APPROVE (`pull_request_review`, `04:58:06Z`): evaluated conditions, found CI still running, returned success without merging.
  2. On CI completion (`workflow_run`, `05:05:16Z`): found all conditions met, merged at `05:06:07Z`.
- **All gap fixes from LS-3857 validation arc confirmed working together:** LS-3931 (merge-when-ready label), LS-3932 (bot-review status), LS-3939 (merge queue workflow_run), LS-3940 (conflict check on ready_for_review).
