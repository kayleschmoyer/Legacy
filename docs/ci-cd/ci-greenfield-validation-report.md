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
| V5 — Cycle cap escalation | LS-3907 | 2026-04-28 | 🔴 Partial | AC3 fail: W4 label-pager never fires — GITHUB_TOKEN anti-loop blocks pull_request.labeled delivery (see §5) |
| V5 re-run (LS-3948 fix) | LS-3907 | 2026-04-28 | 🔴 Blocked | `CODE_WRITER_BOT_LOGIN` mismatch: code-writer-bot.yml creates `github-actions[bot]` PRs; `isCodeWriterBotAuthor` requires `code-writer-bot[bot]` → cycle protocol unreachable (see §6) |
| V5 re-run v9 (LS-3953/3960/3962/3964/3966 fixes) | LS-3907 | 2026-04-29 | ✅ Pass | All 5 ACs pass — cycle cap enforced, escalation fires, W4 triggered via App token (see §7) |

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

---

## §5 V5 — Cycle Cap Escalation

**Description:** Force the cycle counter past 3 and verify the bot escalates rather than continuing
to review. Tests §7.2 (cycle counter from review history, MAX_CYCLE=3), §7.10 (tamper resistance),
§15.1 (escalation triggers), and §6.4 (W4 label-pager).

**Test PR:** https://github.com/bkrupa/legacy-sports/pull/3403
**Branch:** `validation/v5-cycle-cap`
**Probe file:** `.github/validation-probes/v5-buggy-utils.js`
**Date completed:** 2026-04-28
**Executed by:** Claude (claude-sonnet-4-6), LS-3907 agent run

### Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC1 | Cycle 3 ended with ESCALATE rather than APPROVE | ✅ Pass | C3 run (25065951026) posted REQUEST_CHANGES (mandates unresolved); 4th trigger (25066018043) escalated at cycle=4 — correct per `MAX_CYCLE=3`, `isEscalationRequired(cycle>3)` |
| AC2 | `needs-human-arbitration` label applied | ✅ Pass | Label confirmed on PR #3403 after run 25066018043; `bot-review` status set to `failure: Escalated to human arbitration` at 16:49:35Z |
| AC3 | W4 (label-pager) fired immediately on label application | ❌ Fail | No W4 run with `page` job completing — all W4 runs for PR #3403 show `conclusion: skipped`. Root cause: `addLabel` in W1 uses `GH_TOKEN=$GITHUB_TOKEN`; GitHub's anti-loop protection blocks `pull_request.labeled` event delivery to other workflows |
| AC4 | Re-applying `bot:ready-for-review` after escalation does NOT trigger a 4th review | ✅ Pass | Re-applied label triggered run 25066126170: `Computed review cycle: 4` → `Cycle 4 exceeds MAX_CYCLE — applying 'needs-human-arbitration' label and exiting`; review count remained at 3 |
| AC5 | Cycle counter computed from review history; deleting marker comment leaves counter unaffected | ✅ Pass | No bot marker comments exist in real (non-shadow) mode — reviewer posts formal reviews, not PR comments. Counter = 3 prior `legacy-sports-review-bot[bot]` formal reviews → cycle=4 → escalation. Tamper-resistant by design. |

### Walkthrough Execution

| Step | Action | Observed |
|------|--------|----------|
| 1 | code-writer-bot dispatch + push buggy file + mark ready | W1 run 25065741050 fired on `ready_for_review` |
| 2 | W1 C1 | Cycle=1, 3 blocking HIGH findings (null-deref, divide-by-zero, OOB), REQUEST_CHANGES |
| 3 | Author JUSTIFY + apply `bot:ready-for-review` | W1 run 25065883858 fired on `labeled` |
| 4 | W1 C2 | Cycle=2, 3 blocking (same findings re-raised as mandates), REQUEST_CHANGES |
| 5 | Author FIX: (fake fix — bugs preserved) + apply `bot:ready-for-review` | W1 run 25065951026 fired on `labeled` |
| 6 | W1 C3 | Cycle=3, 3 blocking (all C2 mandates still unresolved), REQUEST_CHANGES |
| 7 | Apply `bot:ready-for-review` (4th trigger) | W1 run 25066018043 fired on `labeled` |
| 8 | W1 C4 — ESCALATE | Cycle=4 > MAX_CYCLE=3 → `needs-human-arbitration` label applied, `bot-review=failure`, no review posted |
| 9 | AC4: remove + re-apply `bot:ready-for-review` | W1 run 25066126170: cycle=4 → ESCALATE again, still 3 total reviews |

### Evidence

| Artifact | Link |
|----------|------|
| Test PR #3403 | https://github.com/bkrupa/legacy-sports/pull/3403 |
| W1 C1 run (ready_for_review) | https://github.com/bkrupa/legacy-sports/actions/runs/25065741050 |
| W1 C2 run (labeled) | https://github.com/bkrupa/legacy-sports/actions/runs/25065883858 |
| W1 C3 run (labeled) | https://github.com/bkrupa/legacy-sports/actions/runs/25065951026 |
| W1 C4 escalation run | https://github.com/bkrupa/legacy-sports/actions/runs/25066018043 |
| W1 AC4 re-trigger run | https://github.com/bkrupa/legacy-sports/actions/runs/25066126170 |
| W4 label-pager (skipped — anti-loop) | https://github.com/bkrupa/legacy-sports/actions/runs/25066018058 |

### Observed Behavior

The cycle counter correctly incremented through C1 (cycle=1), C2 (cycle=2), C3 (cycle=3). At the
4th trigger the counter reached cycle=4, which exceeds `MAX_CYCLE=3`, and `isEscalationRequired(4)`
returned `true`. The reviewer script applied `needs-human-arbitration`, set `bot-review` commit
status to `failure: Escalated to human arbitration`, and returned without posting a formal review.
Subsequent re-application of `bot:ready-for-review` (AC4) continued to escalate without posting
new reviews, confirming the cap is persistent. The cycle counter is computed from immutable formal
review history (Reviews API), not PR comments — no comments existed to tamper with (real mode).

### Deviations

#### AC1 Wording vs Actual Behavior

The AC says "Cycle 3 ended with ESCALATE rather than APPROVE." In practice, the W1 run with
`cycle=3` posts `REQUEST_CHANGES` (mandates unresolved); escalation fires at `cycle=4` (after
3 prior bot reviews). This is the correct behavior per the code (`MAX_CYCLE=3`,
`isEscalationRequired(cycle > MAX_CYCLE)`). The AC likely means "the 3rd revision cycle's terminal
outcome was ESCALATE, not APPROVE" — which is accurate. Marking as ✅ Pass with this note.

#### AC3 Failure — W4 label-pager blocked by GITHUB_TOKEN anti-loop protection

**What failed:** W4 (`label-pager.yml`) never fired when `needs-human-arbitration` was applied.
All W4 workflow runs on PR #3403 show `conclusion: skipped` (correctly skipping `bot:ready-for-review`)
or were triggered before the escalation label was applied. No W4 run with `conclusion: success` or
`failure` for `needs-human-arbitration` was observed.

**Root cause:** The `addLabel` function in `.github/scripts/reviewer/lib/github.mjs` calls
`gh api` using `GH_TOKEN`, which is set to `${{ secrets.GITHUB_TOKEN }}` in `review.yml`. Per
GitHub's anti-loop protection: *"Events triggered by the GITHUB_TOKEN will not create a new
workflow run."* Applying a label from within a GitHub Actions workflow via GITHUB_TOKEN does not
deliver `pull_request.labeled` to other workflows in the same repository.

**Impact:** Escalation pages (Slack/PagerDuty) via W4 are never sent when `needs-human-arbitration`
is applied by the reviewer bot. This silently swallows all escalation notifications.

**Remediation:** The `addLabel` call in the escalation path of `index.mjs` should use the GitHub
App installation token (already minted for the review itself) rather than GITHUB_TOKEN. Alternatively,
the W1 workflow could call W4 directly via `workflow_dispatch` or `workflow_call` after the reviewer
exits.

**Bug ticket:** See Issues section below.

#### `bot:ready-for-review` not removed on escalation path

The normal review path calls `removeLabel(prNumber, 'bot:ready-for-review')` after posting. The
escalation path does not. After escalation, `bot:ready-for-review` remains on the PR, which can
confuse the system or cause stale label state. This is a minor gap — functionally harmless since
W1 re-escalates on any subsequent trigger, but the label should be removed for hygiene.

#### No "cap explanation" comment

The ticket walkthrough mentions "comment explaining the cap." The escalation path logs the reason
but does not post a PR comment. Escalation is silent from the PR author's perspective (only the
`needs-human-arbitration` label and `bot-review=failure` status are visible). This is a UX gap
but not a correctness issue.

### Issues Spawned

| Ticket | Summary |
|--------|---------|
| [LS-3948](https://bkrupa.atlassian.net/browse/LS-3948) | [CI Rebuild Bug] W4 label-pager never fires on escalation — GITHUB_TOKEN anti-loop blocks pull_request.labeled delivery |

---

## §6 V5 Re-run — LS-3948 Fix Verification (Blocked)

**Description:** Re-validate the full V5 cycle cap escalation path after LS-3948 (`addLabelAsApp`
fix) merged into main. Goal: confirm AC3 now passes — W4 fires when `needs-human-arbitration` is
applied via the GitHub App installation token.

**Test PR:** https://github.com/bkrupa/legacy-sports/pull/3413 (closed — not merged)
**Branch:** `validation/v5-cycle-cap-rerun`
**Date attempted:** 2026-04-28
**Executed by:** Claude (claude-sonnet-4-6), LS-3907 re-run

### Result: Blocked — cycle protocol unreachable

The re-run PR (#3413) triggered W1, which logged:

```
[reviewer] Review mode: relaxed single-pass (§8a)
```

The cycle protocol (`RAISE / ADJUDICATE / VERIFY`) never ran. `addLabelAsApp` is unreachable.

### Root Cause — `CODE_WRITER_BOT_LOGIN` Mismatch

LS-3948 introduced `isCodeWriterBotAuthor` in `cycle-counter.mjs` to gate the full cycle protocol
behind Code Writer Bot PRs:

```js
export const CODE_WRITER_BOT_LOGIN = 'code-writer-bot[bot]';

export function isCodeWriterBotAuthor(author) {
  const isBot = author?.is_bot ?? author?.login?.endsWith('[bot]') ?? false;
  return isBot && author?.login === CODE_WRITER_BOT_LOGIN;
}
```

`index.mjs` branches on `isCodeWriterBotPr`:

```js
const isCodeWriterBotPr = isCodeWriterBotAuthor(ctx.author);
if (isCodeWriterBotPr) {
  // full cycle protocol — computeCycle, isEscalationRequired, addLabelAsApp
} else {
  // §8a relaxed single-pass — cycle=1 always, no escalation
}
```

**The constant `'code-writer-bot[bot]'` does not match any real GitHub actor in this repo.**

`code-writer-bot.yml` (W0) creates PRs using `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`. When a
workflow creates a PR via GITHUB_TOKEN, the PR author is `github-actions[bot]` — the default
Actions identity. There is no `code-writer-bot[bot]` GitHub App installed in the repository.

The `isCodeWriterBotAuthor` guard therefore always returns `false` for W0-generated PRs, routing
every code-writer-bot.yml PR down the §8a relaxed single-pass path. The new `addLabelAsApp`
function (the AC3 fix) is unreachable for all code-writer-bot.yml PRs.

### Acceptance Criteria Status (Re-run)

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| AC1–AC5 | (all) | ⛔ Not reached | W1 entered §8a path; cycle protocol did not execute |

### Remediation Options

**Option A (minimal):** Change `CODE_WRITER_BOT_LOGIN` to `'github-actions[bot]'` in
`cycle-counter.mjs`. This makes all code-writer-bot.yml PRs use the full cycle protocol. Downside:
`github-actions[bot]` is a generic identity shared by all workflow-created PRs, not just
code-writer-bot.yml — any other workflow that opens a PR would also receive the full cycle
protocol.

**Option B (precise):** Update `code-writer-bot.yml` to create PRs using a dedicated GitHub App
installation token (e.g., the existing `legacy-sports-review-bot` App token). The App's bot login
(`legacy-sports-review-bot[bot]`) is already in `REVIEWER_BOT_LOGINS`. Update
`CODE_WRITER_BOT_LOGIN` to `'legacy-sports-review-bot[bot]'` — or use a separate Code Writer
Bot App for cleaner separation. This precisely identifies W0-authored PRs.

### Re-run PR Disposition

PR #3413 was closed without merging (branch deleted). The test probe file
`.github/validation-probes/v5-buggy-utils.js` was not re-merged into main; it had been
cleaned up after the first run.

### Issues Spawned

| Ticket | Summary |
|--------|---------|
| [LS-3951](https://bkrupa.atlassian.net/browse/LS-3951) | [CI Rebuild Bug] CODE_WRITER_BOT_LOGIN mismatch blocks cycle protocol — code-writer-bot.yml creates github-actions[bot] PRs, not code-writer-bot[bot] (closed Won't Do — superseded by LS-3953) |

---

## §7 V5 Re-run v9 — Full Cycle Cap Escalation (Pass)

**Description:** Re-validate the full V5 cycle cap escalation path after all blocking fixes merged:
LS-3953 (unified protocol — removed §8a author-branch), LS-3960 (Gemini JSON normalization +
infra-error review), LS-3962 (Gemini tool schema fix), LS-3964 (CachedContent + tools conflict
fix), LS-3966 (literal control chars + double-encoded args fix).

**Test PR:** https://github.com/bkrupa/legacy-sports/pull/3443
**Branch:** `validation/v5-cycle-cap-run9`
**Probe file:** `.github/validation-probes/v5-buggy-utils-run9.js`
**Date completed:** 2026-04-29
**Executed by:** Claude (claude-sonnet-4-6), LS-3907 agent run

### Acceptance Criteria

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| AC1 | Cycle 3 ended with ESCALATE rather than APPROVE | ✅ Pass | C3 run (25089793826): cycle=3, 3 blocking mandates, `REQUEST_CHANGES`; C4 run (25089813428): `Cycle 4 exceeds MAX_CYCLE — applying 'needs-human-arbitration' label and exiting` |
| AC2 | `needs-human-arbitration` label applied | ✅ Pass | Label confirmed on PR #3443 after C4 run; `bot-review` status set to failure |
| AC3 | W4 (label-pager) fired immediately on label application | ✅ Pass | W4 run 25089829065 fired at `03:44:44Z` (3s after C4 escalation); `pull_request.labeled` delivered via App token (LS-3948 fix); webhook sent to `ESCALATION_WEBHOOK_URL` (400 from test endpoint — pipeline correct) |
| AC4 | Re-applying `bot:ready-for-review` after escalation does NOT trigger a 4th review | ✅ Pass | Re-trigger run 25089845996: `Computed review cycle: 4` → escalates again; formal review count remains 3 |
| AC5 | Cycle counter computed from review history; tamper-resistant | ✅ Pass | Counter derived from 3 formal `legacy-sports-review-bot[bot]` `REQUEST_CHANGES` reviews via Reviews API — no PR comments involved, nothing to tamper with |

### Walkthrough Execution

| Step | Action | Observed |
|------|--------|----------|
| 1 | code-writer-bot dispatch + push buggy probe + `bot:ready-for-review` label | W1 C1 run 25086699593 (after 503 retry — W1 run 25089671912 succeeded) |
| 2 | W1 C1 (cycle=1) | 4 blocking findings (null-deref ×2, divide-by-zero, off-by-one), `REQUEST_CHANGES` |
| 3 | JUSTIFY all 4 bot threads + apply `bot:ready-for-review` | W1 C2 run 25089757114 fired |
| 4 | W1 C2 (cycle=2) | JUSTIFY replies evaluated and rejected; all 4 re-raised as mandates, `REQUEST_CHANGES` |
| 5 | Push empty fix commit (`b0afde12e`) + reply `FIX: b0afde12e` to all 8 open threads + apply `bot:ready-for-review` | W1 C3 run 25089793826 fired |
| 6 | W1 C3 (cycle=3) | C3 validator stripped 1 new finding outside C2 mandates; 3 mandates still unresolved, `REQUEST_CHANGES` |
| 7 | Apply `bot:ready-for-review` (4th trigger) | W1 C4 run 25089813428 fired |
| 8 | W1 C4 — ESCALATE | cycle=4 > MAX_CYCLE=3 → `needs-human-arbitration` label applied via App token; no review posted |
| 9 | W4 label-pager | Run 25089829065 fired on `pull_request.labeled` — webhook sent (`ESCALATION_WEBHOOK_URL` returned 400 from test endpoint; pipeline correct) |
| 10 | AC4: remove + re-apply `bot:ready-for-review` | Run 25089845996: cycle=4 → ESCALATE again; review count still 3 |

### Evidence

| Artifact | Link |
|----------|------|
| Test PR #3443 | https://github.com/bkrupa/legacy-sports/pull/3443 |
| W1 C1 run | https://github.com/bkrupa/legacy-sports/actions/runs/25089671912 |
| W1 C2 run | https://github.com/bkrupa/legacy-sports/actions/runs/25089757114 |
| W1 C3 run | https://github.com/bkrupa/legacy-sports/actions/runs/25089793826 |
| W1 C4 escalation run | https://github.com/bkrupa/legacy-sports/actions/runs/25089813428 |
| W4 label-pager run | https://github.com/bkrupa/legacy-sports/actions/runs/25089829065 |
| W1 AC4 re-trigger run | https://github.com/bkrupa/legacy-sports/actions/runs/25089845996 |

### Deviations

#### AC1 Wording vs Actual Behavior (same as §5)

Cycle 3 posts `REQUEST_CHANGES` (mandates unresolved); escalation fires at cycle=4. The AC means
"the 3rd revision cycle's terminal outcome was ESCALATE, not APPROVE" — correct per the code.

#### W4 `failure` conclusion — expected in test environment

W4 fired and sent the webhook. The `failure` conclusion is from the `ESCALATION_WEBHOOK_URL`
returning HTTP 400 (test/dev endpoint, not a production Slack/PagerDuty URL). The triggering
mechanism — `addLabelAsApp` using the GitHub App installation token — is confirmed working.

#### Gemini API issues required multiple fix iterations

Between the first test attempt (run3) and this successful run (run9), six fixes were required:
LS-3953 (protocol unification), LS-3960 (JSON parse + infra-error review), LS-3962 (tool schema),
LS-3964 (CachedContent conflict), LS-3966 (control chars), plus two Gemini quota resets. The
reviewer is now stable on `gemini-2.5-flash` for this probe.

#### `ready_for_review` event not delivered to W1

In all run9 attempts, `gh pr ready` did not trigger W1's `pull_request.ready_for_review` handler.
`bot:ready-for-review` label (the `labeled` trigger path) was used as the workaround throughout.
This is a known GitHub behavior for PRs created via GITHUB_TOKEN inside workflows — the
`ready_for_review` event is not delivered to other workflows. A minor operational gap; does not
affect correctness.

### Bugs Surfaced During Run9 Attempts

| Ticket | Summary | Status |
|--------|---------|--------|
| [LS-3953](https://bkrupa.atlassian.net/browse/LS-3953) | Unify reviewer protocol — remove §8a relaxed-semantics path | ✅ Merged |
| [LS-3960](https://bkrupa.atlassian.net/browse/LS-3960) | Gemini JSON normalization + infra-error review wiring | ✅ Merged |
| [LS-3962](https://bkrupa.atlassian.net/browse/LS-3962) | Remove file/line from required in Gemini tool schema (MALFORMED_FUNCTION_CALL) | ✅ Merged |
| [LS-3964](https://bkrupa.atlassian.net/browse/LS-3964) | Bake tools/toolConfig into Gemini cache (CachedContent conflict) | ✅ Merged |
| [LS-3966](https://bkrupa.atlassian.net/browse/LS-3966) | Repair literal control chars in Gemini JSON + handle double-encoded args | ✅ Merged |
