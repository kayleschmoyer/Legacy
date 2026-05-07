# bot-review Pipeline — Full Architecture Reference

End-to-end reference for the `bot-review` required status check. Read this before modifying any of the files listed under **Related Files** below.

**Goal:** make Copilot's PR review a **required status check** (`bot-review`) that blocks merge until all review threads are resolved — driven entirely by GitHub events, with no timer-based "assumed clean pass" fallback.

> **History:** this pipeline replaced `copilot-auto-approve.yml` (deleted in LS-3002). That workflow is gone — any references to it in the codebase are stale.

---

## Actors

| Actor                                                          | Role                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`bot-review` check run**                                     | Required status check. Its `conclusion` drives mergeability. Written by both the Lambda and `copilot-review-handler.yml` (parallel writers).                                                |
| **Legacy Sports Review Bot** (App ID `3142924`)                | GitHub App used by the Lambda. Writes check runs via its own installation token. Only this App can PATCH check runs it creates.                                                             |
| **`copilot-review-handler.yml`**                               | GitHub Actions workflow triggered by `workflow_run.completed` on "Copilot code review". Runs as `GITHUB_TOKEN` (github-actions app). POSTs new check runs — cannot PATCH the Lambda's runs. |
| **Lambda `github-webhook`**                                    | Receives repo webhook events (`pull_request`, `pull_request_review`, `pull_request_review_thread`, `workflow_run`). Sets `bot-review` and requests Copilot.                                 |
| **Copilot** (`copilot-pull-request-reviewer[bot]` / `Copilot`) | The actual reviewer. We never impersonate it — we only react to events it emits.                                                                                                            |
| **`merge-when-ready` label**                                   | Applied by both writers once `bot-review=success`. Consumed by `merge-queue.yml` to auto-merge.                                                                                             |

---

## Event → Handler Routing

| Event                                                         | Handler                                                          | Action                                                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pull_request` `opened/synchronize/reopened/ready_for_review` | Lambda `handle-pull-request.ts`                                  | Calls `requestCopilotReview`. No check run created.                                                                    |
| `pull_request` `review_request_removed` (Copilot only)        | Lambda `handle-pull-request.ts`                                  | If Copilot removed without posting a review for current SHA → `bot-review=success` + label.                            |
| `pull_request_review` `submitted` (Copilot)                   | Lambda `handle-pull-request-review.ts`                           | COMMENTED/CHANGES_REQUESTED → `bot-review=failure`. APPROVED or clearing phrases → evaluate threads → success/failure. |
| `pull_request_review` `submitted` (human)                     | Lambda `handle-pull-request-review.ts`                           | Re-evaluate all threads after 3s delay → success/failure.                                                              |
| `pull_request_review_thread` `resolved/unresolved`            | Lambda `handle-review-thread.ts`                                 | Re-evaluate all threads → success/failure + label on success.                                                          |
| `workflow_run` `completed` ("Copilot code review")            | Lambda `handle-workflow-run.ts` AND `copilot-review-handler.yml` | Both evaluate threads and POST `bot-review`. Retry up to 30s for review to appear in API.                              |

> **Why two `workflow_run` handlers?** The Lambda can PATCH its own check runs; the workflow cannot (cross-app). Having both ensures coverage if one path fails. Both POSTing a new run is harmless — GitHub uses the most recent.

---

## Why No `in_progress` Run

The Lambda does **not** create a `bot-review=in_progress` run on push. Earlier versions did, but it caused permanent stuck checks:

- The Lambda creates runs with its App token (Review Bot App ID 3142924)
- `copilot-review-handler.yml` uses `GITHUB_TOKEN` (github-actions app)
- GitHub enforces check-run ownership: only the creating App can PATCH its own run
- `workflow_run.completed` for the "Copilot code review" workflow is not delivered to repo webhooks (only `in_progress` and `requested` actions are)
- Result: the `in_progress` run could never be closed

**Current behavior:** on push, `bot-review` is simply absent. GitHub treats a missing required check identically to pending — merging is blocked. The check appears once Copilot finishes (as success or failure).

---

## `copilotCleared` Logic

All three handlers (`handle-pull-request-review.ts`, `handle-review-thread.ts`, `handle-workflow-run.ts`, `copilot-review-handler.yml`) use the same logic:

```
copilotCleared = true  when the latest Copilot review for headSha is:
  - state === 'APPROVED'
  - body includes "wasn't able to review any files"
  - body includes "generated no new comments"
```

When `copilotCleared=true`, Copilot's own unresolved threads are excluded from the unresolved count (they're superseded). Human threads still block regardless.

When `copilotCleared=false`, ALL unresolved threads block — including Copilot's inline comments.

> Always scope Copilot review lookups to the **current `headSha`**. A stale APPROVED review from an older commit must not clear threads on the new commit.

---

## Known Race Conditions

### Race 1: `workflow_run.completed` fires before review is API-visible

**Symptom:** `copilot-review-handler.yml` logs "No Copilot review found for current SHA — skipping". `bot-review` stays absent. The review appears in the API 5–15 seconds later.

**Root cause:** GitHub fires `workflow_run.completed` before persisting the Copilot review to the REST API.

**Fix (already implemented):** `copilot-review-handler.yml` retries up to 6 times with 5-second gaps (30s total) before giving up.

**Diagnosis:**

```bash
# Check if review exists for the current SHA
gh api repos/{owner}/{repo}/pulls/{PR}/reviews \
  --jq '[.[] | select(.user.login | test("(?i)copilot")) | {state, commit_id, submitted_at}]'

# Check recent Copilot Review Handler runs
gh api "repos/{owner}/{repo}/actions/runs?event=workflow_run&per_page=10" \
  --jq '[.workflow_runs[] | select(.name == "Copilot Review Handler") | {id, status, conclusion, created_at}]'
```

---

### Race 2: Thread resolved immediately after push cancels Copilot re-review

**Symptom:** After pushing a new commit followed immediately by resolving a Copilot review thread, Copilot is not re-triggered for the new commit. `requested_reviewers` is empty, no review exists for the new `headSha`, and `bot-review` is absent indefinitely.

**Root cause:** The Lambda's `synchronize` handler calls `requestCopilotReview`. If a thread is resolved within seconds of the push (before Copilot starts processing the review request), GitHub may silently cancel the review request. This is a GitHub-side race — not something the Lambda can prevent.

**This only occurs in practice when:** an agent or automation resolves threads programmatically immediately after pushing a commit (humans don't resolve threads in milliseconds).

**Diagnosis:**

```bash
# 1. Confirm no Copilot review for current headSha
CURRENT_SHA=$(gh api repos/{owner}/{repo}/pulls/{PR} --jq '.head.sha')
gh api repos/{owner}/{repo}/pulls/{PR}/reviews \
  --jq --arg sha "$CURRENT_SHA" '[.[] | select((.user.login | test("(?i)copilot")) and .commit_id == $sha)]'
# → empty array confirms the race occurred

# 2. Confirm Copilot is not in requested_reviewers
gh api repos/{owner}/{repo}/pulls/{PR} \
  --jq '[.requested_reviewers[] | .login]'
# → empty array confirms Copilot was not requested or was cancelled
```

**Fix:** Push a new trivial commit to trigger `synchronize` again. The Lambda will call `requestCopilotReview` cleanly, with no concurrent thread-resolve to race against:

```bash
git commit --allow-empty -m "chore: re-trigger Copilot review"
git push
```

---

## Diagnosing a Stuck / Missing `bot-review`

Work through these steps in order:

1. **Check what check runs exist for the current SHA:**

   ```
   github_get_check_runs({ prNumber: <PR#> })
   ```

   Returns `[{name, status, conclusion, output: {title, summary}, app: {slug, name}}]` filtered to the latest run per check name.

2. **Check if Copilot has reviewed the current SHA:**

   ```bash
   gh api repos/{owner}/{repo}/pulls/{PR}/reviews \
     --jq '[.[] | {state, user: .user.login, commit_id, submitted_at}]'
   ```

   - No review for current SHA + `bot-review` absent → Race 1 or Race 2 (see above)
   - Review exists but `bot-review` not set → Copilot Review Handler may have failed (check run logs)

3. **Check if Copilot is a requested reviewer:**

   ```bash
   gh api repos/{owner}/{repo}/pulls/{PR} --jq '[.requested_reviewers[] | .login]'
   ```

   - Empty → Race 2 (push a new commit to re-trigger)

4. **Check recent Copilot Review Handler runs:**

   ```bash
   gh api "repos/{owner}/{repo}/actions/runs?event=workflow_run&per_page=10" \
     --jq '[.workflow_runs[] | select(.name == "Copilot Review Handler") | {id, status, conclusion, created_at}]'
   ```

   Then view the logs: `gh run view {id} --log | grep -E "Handling|copilotCleared|bot-review|No Copilot|skipping"`

5. **Check Lambda CloudWatch logs** (requires AWS access):
   See `.agents/skills/infrastructure/references/cloudwatch-logs.md`

---

## Invariants (Do Not Break These)

1. **No timer-based clean pass.** A missing Copilot review is never treated as success because enough time has passed. Bot-review=success requires an actual Copilot event (exception: bot-authored PRs per invariant #5 below).
2. **SHA-scoped.** Every status written is tied to the current `head_sha`. Never apply a review from an older SHA without verifying it's still valid.
3. **`copilotCleared` is per-SHA.** Filter Copilot reviews to `commitId === headSha` before computing `copilotCleared`.
4. **Fork PRs bail early.** `BOT_APP_PRIVATE_KEY` is not available; skip all Lambda logic for fork PRs.
5. **Bot-authored PRs auto-pass.** `dependabot[bot]` and `legacy-sports-code-bot[bot]` get `bot-review=success` immediately — Copilot will not review them.
6. **Both `workflow_run` handlers are parallel writers.** Do not remove either. If one fails (e.g. Lambda doesn't receive the event), the other provides coverage.

---

## `COPILOT_LOGINS` Set — Sync Requirement

Five locations define this set and must stay identical:

- `lambdas/github-webhook/src/handle-pull-request.ts`
- `lambdas/github-webhook/src/handle-pull-request-review.ts`
- `lambdas/github-webhook/src/handle-review-thread.ts`
- `lambdas/github-webhook/src/handle-workflow-run.ts`
- `.github/workflows/copilot-review-handler.yml`

Current members: `copilot-pull-request-reviewer`, `copilot-pull-request-reviewer[bot]`, `Copilot`

---

## Deprecated Controls

| Variable / Flag               | Status      | Notes                                                                                                              |
| ----------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `COPILOT_AUTO_REVIEW_ENABLED` | **Removed** | GitHub repo variable that previously disabled Copilot reviews. Removed with `copilot-auto-approve.yml` in LS-3002. |

---

## Related Files

- `lambdas/github-webhook/src/handle-pull-request.ts` — `synchronize` handler, Copilot review requester
- `lambdas/github-webhook/src/handle-pull-request-review.ts` — Copilot/human review submitted
- `lambdas/github-webhook/src/handle-review-thread.ts` — thread resolved/unresolved
- `lambdas/github-webhook/src/handle-workflow-run.ts` — `workflow_run` Lambda handler
- `.github/workflows/copilot-review-handler.yml` — `workflow_run` Actions handler
- `.github/workflows/merge-queue.yml` — consumes `merge-when-ready` label
- `.agents/skills/pr-lifecycle/references/ci-checks-reference.md` — lists `bot-review` in the check table
