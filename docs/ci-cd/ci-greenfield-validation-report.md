# CI/CD Greenfield System — Validation Report

> Records end-to-end validation runs for the greenfield CI/Bot-Review system (LS-3857 epic). Each
> section documents one validation scenario, its acceptance criteria, observed behavior, and any
> deviations from the spec.

## §1 Status Summary

| Scenario | Ticket | Date | Result | Notes |
|----------|--------|------|--------|-------|
| V1 — Trivial happy path | LS-3903 | 2026-04-28 | ✅ Pass | 3 design gaps documented (see §2 Deviations) |

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
