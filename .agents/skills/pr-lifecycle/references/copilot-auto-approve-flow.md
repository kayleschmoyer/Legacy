# Copilot Auto-Approve Workflow — Full Flow

End-to-end reference for `.github/workflows/copilot-auto-approve.yml`. Future agents modifying this workflow should read this first to avoid reintroducing the failure modes listed at the bottom.

**Goal of the workflow:** turn Copilot's PR review into a **required status check** (`bot-review`) that's driven entirely by GitHub events, with no time-based "assumed clean pass" fallback. A PR can only be auto-approved when an actual Copilot event says so — either a posted review or an explicit reviewer-removal.

---

## Actors

| Actor                                                                                | Role                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`bot-review` check run**                                                           | The required status check. Its `status`/`conclusion` drives whether the PR is mergeable. Only this workflow writes it.                                                                                         |
| **`legacy-sports-review-bot` GitHub App** (id `3142924`)                             | Posts approvals and creates `bot-review` check runs. Requires `BOT_APP_PRIVATE_KEY` secret. Unavailable for fork PRs (skipped entirely).                                                                       |
| **Copilot** (`copilot-pull-request-reviewer[bot]` / `Copilot`)                       | The actual reviewer. We never impersonate it — we only react to events it emits.                                                                                                                               |
| **Repository ruleset** (`Copilot review for default branch`, `review_on_push: true`) | Normally auto-adds Copilot as a reviewer when a PR targets the default branch. It is _unreliable on incremental commits and can miss PR opens_, which is why this workflow has its own request/backstop logic. |
| **`merge-when-ready` label**                                                         | Signal consumed by `merge-queue.yml` to auto-merge once all checks pass. Applied by this workflow only after approval.                                                                                         |

---

## Configuration Variables

| Variable                      | Location                                     | Default (absent) | Effect when set to `false`                                                                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COPILOT_AUTO_REVIEW_ENABLED` | GitHub repo → Settings → Actions → Variables | `true` (enabled) | Skips the explicit `requestReviewers` backstop call; auto-passes `bot-review` immediately (so PRs aren't blocked). The GitHub ruleset (`review_on_push`) still fires independently — disable it in repo Settings → Rules to fully suppress Copilot reviews. |

**To disable Copilot reviews:**

```bash
gh variable set COPILOT_AUTO_REVIEW_ENABLED --body "false"
```

**To re-enable:**

```bash
gh variable delete COPILOT_AUTO_REVIEW_ENABLED
# or
gh variable set COPILOT_AUTO_REVIEW_ENABLED --body "true"
```

> When disabled, human reviews are still required as normal — only the Copilot bot-review gate is bypassed.

---

## Events That Drive The Workflow

```yaml
on:
  pull_request:
    types:
      [opened, synchronize, reopened, ready_for_review, review_request_removed]
  pull_request_review:
    types: [submitted]
  workflow_run:
    workflows: ['Copilot code review']
    types: [completed]
  workflow_dispatch:
    inputs:
      pr_number: { type: number, required: true }
```

Why these specific triggers:

- `pull_request` (`opened/synchronize/reopened/ready_for_review`) — PR state changes that reset the review requirement.
- `pull_request` (`review_request_removed`) — GitHub auto-removes a reviewer when they submit a review. This fires **both** when Copilot submits AND when Copilot is removed without posting, giving us an event-driven "Copilot is done" signal.
- `pull_request_review.submitted` — any review submission (human or Copilot). Lets us re-evaluate threads when a human resolves them or when Copilot posts new ones.
- `workflow_run` on `"Copilot code review"` — the built-in workflow that Copilot kicks off before its review is posted. We use this to detect review **failures** (workflow_run conclusion != success) and to poll for a propagating review on success.
- `workflow_dispatch` — manual (or internal) recheck path.

> **Not supported:** `pull_request_review_thread`. GitHub rejects this as a workflow trigger, so thread-resolved-without-resubmission cases are covered by `delayed-recheck` → `recheck`, and by `review-check` firing on follow-up review submissions.

---

## Jobs (and when each fires)

| Job               | Fires on                                                                    | Purpose                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request-review`  | `pull_request` (excluding `review_request_removed`)                         | Create `bot-review=in_progress`, backstop Copilot reviewer request, run carry-forward on rebases.                                                                           |
| `review-check`    | `pull_request_review.submitted`                                             | Evaluate Copilot threads on every review submission; flip `bot-review` to success or failure.                                                                               |
| `copilot-removed` | `pull_request.review_request_removed` for Copilot                           | Event-driven "Copilot done" handler. Approves only when **no review for current SHA** exists.                                                                               |
| `auto-approve`    | `workflow_run` on `"Copilot code review"`                                   | Detect workflow failure (→ `bot-review=failure`). On success, poll for the propagating review and evaluate threads. Leaves `in_progress` if the review hasn't appeared yet. |
| `recheck`         | `workflow_dispatch`                                                         | Re-evaluate threads; re-request Copilot if missing. Safety net for stuck PRs.                                                                                               |
| `delayed-recheck` | `pull_request` (excluding `review_request_removed`), after `request-review` | Wait 3 min, then `workflow_dispatch → recheck` if `bot-review` is still pending/failure.                                                                                    |

---

## Flow: PR Opened (Happy Path)

```
pull_request.opened
  │
  └─> request-review
        ├─ Create bot-review=in_progress
        └─ requestReviewers(copilot) [backstop; idempotent]
                │
                ├─> [GitHub triggers "Copilot code review" workflow]
                │     │
                │     └─ Copilot analyzes the diff (minutes)
                │
                └─ delayed-recheck starts 3-min timer (parallel)

... later (async) ...

Copilot code review workflow completes
  │
  └─> auto-approve (workflow_run)
        ├─ conclusion != success → bot-review=failure, stop
        └─ conclusion == success → poll 6× for Copilot review
              ├─ found → evaluate threads → bot-review success/failure
              └─ not found → leave bot-review=in_progress
                    (NOT a clean pass — event-driven signal will resolve)

Copilot submits review (may be after workflow_run completes)
  │
  ├─> pull_request_review.submitted
  │     └─> review-check
  │           ├─ latest Copilot review APPROVED → bot-review=success + approve + label
  │           ├─ "wasn't able to review any files" → bot-review=success + approve + label
  │           └─ threads → evaluate: unresolved → bot-review=failure
  │                                 clean → bot-review=success + approve + label
  │
  └─> pull_request.review_request_removed (GitHub auto-removes submitter)
        └─> copilot-removed
              └─ review exists for current SHA → no-op (review-check handles)
```

## Flow: New Commits Pushed (synchronize)

```
pull_request.synchronize
  │
  └─> request-review
        ├─ Carry-forward check:
        │    • latest Copilot review APPROVED → bot-review=success + approve + label
        │    • "wasn't able to review any files" → bot-review=success + approve + label
        │    • zero unresolved+non-outdated Copilot threads → bot-review=success + approve + label
        │    • otherwise → bot-review=in_progress
        └─ requestReviewers(copilot) [required; ruleset does NOT fire on incremental commits]
                │
                └─> Copilot re-reviews new SHA → same as opened path
```

**Why carry-forward exists:** `workflow_run` only fires when the "Copilot code review" workflow actually runs. On a rebase where Copilot already approved and the ruleset doesn't re-trigger, there's no event that would flip `bot-review` to success on the new SHA. Carry-forward reads the previous review + thread state and writes the new `bot-review` directly.

## Flow: Copilot Never Posts / Never Gets Removed

```
bot-review sits at in_progress
  │
  └─> delayed-recheck (after 3 min)
        └─ if state is pending/failure → workflow_dispatch → recheck
              │
              └─> recheck
                    ├─ No Copilot review exists:
                    │    ├─ Copilot NOT in requested_reviewers → requestReviewers() [self-heal]
                    │    └─ Return without approving (do NOT assume clean pass)
                    └─ Review exists:
                          • APPROVED or "no reviewable files" → bot-review=success + approve + label
                          • threads → evaluate same as review-check
```

If the re-request fires here, the flow re-enters at "Copilot re-reviews new SHA" above.

## Flow: Thread Resolved Without New Review

An agent (or user) resolves a Copilot thread; no new review is submitted. `pull_request_review_thread` is not a supported trigger, so agents must dispatch the workflow manually using the `ci_dispatch_workflow` MCP tool:

```
ci_dispatch_workflow(workflow: "copilot-auto-approve.yml", inputs: { pr_number: "<PR#>" })
```

**Never use `gh workflow run copilot-auto-approve.yml`** — always use `ci_dispatch_workflow`. This triggers the `recheck` job which re-evaluates threads.

---

## Invariants (Do Not Break These)

1. **No timer-based clean-pass.** A missing Copilot review is never treated as a success just because enough time has passed. Approval requires one of:
   - `pull_request_review.submitted` from Copilot (→ `review-check`).
   - `review_request_removed` for Copilot AND no review exists for current SHA (→ `copilot-removed`).
   - A prior clean review that can be carried forward on rebase (→ `request-review` carry-forward).
   - Resolved threads on a prior review (→ `recheck` via `delayed-recheck`).
2. **Copilot must be a requested reviewer or we won't get events.** Every path that notices "no review yet" must verify Copilot is requested. `request-review` backstops the ruleset unconditionally; `recheck` self-heals if Copilot got dropped.
3. **`bot-review` is SHA-scoped.** Every status we write is tied to `head_sha`. Never write `bot-review=success` on a new SHA based on a review from an older SHA without going through carry-forward (which filters outdated threads).
4. **`pull_request_review` from Copilot races `review_request_removed`.** Both fire on submission. `copilot-removed` sleeps 15s and filters `commit_id === sha` before acting, so it no-ops when a submission is being processed.
5. **Fork PRs: bail early.** `BOT_APP_PRIVATE_KEY` is not available; all jobs gate on `head.repo.full_name == github.repository`.
6. **Bot-authored PRs skip Copilot.** `dependabot[bot]` and `legacy-sports-code-bot[bot]` never get Copilot reviews — they auto-pass `bot-review` in `request-review` and are excluded from `review-check`, `copilot-removed`, and `delayed-recheck`.
7. **`COPILOT_AUTO_REVIEW_ENABLED=false` bypasses Copilot entirely.** When the repo variable is `false`, `request-review` auto-passes `bot-review` immediately and skips the `requestReviewers` backstop call. This is the intended path when Copilot rate limits are being hit — see Configuration Variables above.

---

## Common Pitfalls (and how to avoid them)

| Symptom                                                                                       | Root cause                                                                                                                            | Correct fix                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR stuck at `bot-review=in_progress` indefinitely                                             | Copilot was never requested (ruleset failed on `opened`) — no event will ever fire                                                    | Ensure `request-review` backstop requestReviewers call is present AND `recheck` self-heal is present. **Do not** add a timer that assumes clean pass. |
| `bot-review` auto-succeeds while Copilot is still reviewing                                   | Someone added a timer-based fallback that calls `createCheck` with `conclusion: success` when no review is found after N seconds      | Remove it. Status must stay `in_progress` until an event resolves it.                                                                                 |
| Approval fires on old commit's review after a rebase                                          | Carry-forward misread a stale APPROVED review as applying to new SHA, or review-check used an old review without checking `commit_id` | Verify carry-forward filters `isOutdated` threads. Verify `review-check` sets `bot-review` only on current `sha` from the event payload.              |
| `review_request_removed` leads to a false approval while Copilot is actively working          | `copilot-removed` ran before the submitted review propagated                                                                          | Keep the 15s `setTimeout` in `copilot-removed` AND the `commit_id === sha` filter. Do not shorten either.                                             |
| Workflow file registers with name = file path in GitHub UI                                    | Unsupported trigger type (e.g. `pull_request_review_thread`) or unknown expression function (e.g. `toLower()`) in an `if:`            | Only use supported PR triggers and the documented subset of GitHub expression functions. Test via `act` or a throwaway branch.                        |
| `delayed-recheck` fires unnecessarily on `review_request_removed` and re-dispatches `recheck` | Missing `github.event.action != 'review_request_removed'` gate                                                                        | Keep the action-level exclusion on both `request-review` and `delayed-recheck`.                                                                       |

---

## Modifying This Workflow — Checklist

Before changing `copilot-auto-approve.yml`:

1. **Read the invariants above.** If your change contradicts one, stop and propose the change to the user first.
2. **Ask:** does this add a time-based fallback that assumes success? If yes, don't.
3. **Ask:** does this write `bot-review` from an event without verifying the SHA matches? If yes, add the guard.
4. **Ask:** if my change introduces a new state where Copilot could be un-requested, does something re-request?
5. **Validate YAML locally:** `python -c "import yaml; yaml.safe_load(open('.github/workflows/copilot-auto-approve.yml', encoding='utf-8'))"`.
6. **Test plan:** open a dummy PR and verify one of each path (clean, with-threads, no-review, rebase carry-forward, stuck-recovery).

---

## Related Files

- `.github/workflows/copilot-auto-approve.yml` — the workflow itself.
- `.github/workflows/merge-queue.yml` — consumes `merge-when-ready` label.
- `.agents/skills/pr-lifecycle/references/ci-checks-reference.md` — lists `bot-review` in the master check table.
- `.agents/skills/pr-lifecycle/references/fix-reviews.md` — agent workflow for resolving Copilot comments.
