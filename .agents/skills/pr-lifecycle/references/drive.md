---
name: drive-pr
description: 'Pick up an existing PR by number and shepherd it to merge. Inspects current state (CI, reviews, conflicts), fixes whatever is blocking, and handles events until the PR merges. Handles CI failures, review comments, merge conflicts, and stale branches. Extracts the linked Jira ticket and manages status transitions. Works in both local (worktree) and cloud (API-only) modes. Use when given a PR number/URL and asked to drive it to merge, land it, ship it, or get it merged.'
---

# Skill: Drive PR

## Overview

Pick up an existing pull request — wherever it is in its lifecycle — and shepherd it all the way to merge. This is the single-PR counterpart to `/sweep-prs` (batch) and the PR-first counterpart to `/work-ticket` (ticket-first).

The core loop is: **inspect → fix → wait → repeat** until the PR is merged.

## When to Use

- "Drive PR #123 to merge"
- "Land this PR" / "Ship this PR" / "Get #456 merged"
- "Pick up PR #789, it's been stuck"
- "Fix whatever is blocking PR #101 and merge it"
- Resuming a PR that was abandoned by a previous agent session

## Environment Compatibility

| Operation                          | Local Agent | Cloud Agent |
| ---------------------------------- | :---------: | :---------: |
| Inspect PR state                   |     YES     |     YES     |
| Rebase / fix conflicts             |     YES     |     NO      |
| Fix review comments (code changes) |     YES     |     NO      |
| Fix CI failures (code changes)     |     YES     |     NO      |
| Re-run flaky CI                    |     YES     |     YES     |
| Resolve process/meta threads       |     YES     |     YES     |
| Jira status transitions            |     YES     |     YES     |
| Merge the PR                       |     YES     |     YES     |

> **Cloud agents cannot commit or push code.** If the PR needs code changes (conflict resolution, review fixes, CI fixes), the cloud agent should comment with the specific blockers, stop, and ask the user to rerun `/drive-pr` from a local/worktree session. Only label `requires-human-review` when the blocker is genuinely outside any agent's reach (for example: missing credentials, a product decision, or an external dependency).

## Sub-Skills (Load on Demand)

This skill is a **coordinator** — it delegates to specialized sub-skills for actual fixes:

| Problem                    | Sub-Skill                                      |
| -------------------------- | ---------------------------------------------- |
| Merge conflicts            | `../../worktree-workflow/references/rebase.md` |
| Copilot review comments    | `../SKILL.md` (Phase 3: Fix Reviews)           |
| CI failures (code changes) | `../../debugging/SKILL.md`                     |
| Worktree setup             | `../../worktree-workflow/SKILL.md`             |

## Steps

### Step 1: Parse input

Accept a PR number, URL, or `#N` reference from the user's arguments. Extract the integer PR number.

If given a URL like `https://github.com/org/repo/pull/123`, extract `123`.

### Step 2: Verify auth

```
github_auth_status()
jira_auth_status()
```

If GitHub auth fails, **stop and prompt the user** — you cannot inspect or act on a PR without it.

If Jira auth fails, **warn but continue** — Jira transitions are valuable but not blocking for the core PR work. Note the limitation in the final report.

### Step 3: Inspect the PR

```
github_view_pr(number: <PR#>)
```

Capture:

- `state` — OPEN, MERGED, CLOSED
- `headRefName` — branch name
- `mergeable` — MERGEABLE, CONFLICTING, UNKNOWN
- `isDraft` — whether the PR is still in draft
- `reviewDecision` — APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, null

**Early exits:**

- `state: "MERGED"` → already merged. Report success, then continue to Step 7 (post-merge housekeeping such as Jira/label cleanup) before Step 8 (gap audit).
- `state: "CLOSED"` → closed without merge. Report and stop — ask the user if they want to reopen.
- `isDraft: true` → do **not** mark it ready automatically. Report that the PR is still in draft and ask the user for explicit confirmation before calling `github_mark_pr_ready(number: <PR#>)`; if confirmation is not provided, treat the draft state as a blocker and stop.

### Step 3b: Extract Jira ticket

Extract `LS-####` from the PR title or branch name (`headRefName`) using the pattern `LS-\d+`.

If a Jira key is found and Jira auth is configured:

```
jira_view(key: "LS-####")
```

Use the ticket context as a guardrail for review fixes (don't apply suggestions that contradict acceptance criteria). If the ticket is not "In Progress" or "In Review", transition it:

| Current Status | Transition To |
| -------------- | ------------- |
| To Do          | In Progress   |
| In Progress    | (keep)        |
| In Review      | (keep)        |

### Step 3c: Get detailed PR status

```
github_pr_batch_status(prs: [<PR#>])
```

This returns `mergeable`, `ciSummary`, `reviewDecision`, and `unresolvedThreadCount` in one call.

Also fetch review threads if there are unresolved ones:

```
github_get_review_threads(number: <PR#>)
```

### Step 4: Enter worktree (local only)

If the PR needs code changes (conflicts, review fixes, CI fixes), you need a local checkout.

**Check for an existing worktree first:**

```
worktree_list()
```

If a worktree already exists for this branch, activate it using the Jira key when available, or the branch name / absolute worktree path as a fallback (e.g., for Dependabot PRs or PRs without a Jira key). If multiple worktrees share the same ticket key, disambiguate using `worktree_list()` output and pass the absolute path instead:

```
worktree_set(key: "LS-####")           # when Jira key is available
worktree_set(key: "<headRefName>")     # fallback: use branch name
worktree_set(key: "<absolute path>")   # fallback: use worktree path from worktree_list()
```

If no worktree exists, there are two paths depending on where the session started:

- **Already in a launcher worktree** (`.claude/worktrees/<name>/`): check out the PR's branch directly:
  ```
  git fetch origin <headRefName>
  git checkout <headRefName>
  worktree_set(key: "<headRefName>")   # establishes CI event routing for this session
  ```
- **Starting from the main repo** (parallel/batch flow): create a sibling worktree via `worktree_attach`:
  ```
  worktree_attach(branch: "<headRefName>")
  worktree_set(key: "<headRefName>")   # establishes CI event routing for this session
  ```

Then set up node_modules (required in both cases):

```
node scripts/modules-pool/link.mjs
```

Finally, stamp this session onto the PR (desktop linkage + provenance — see [create-pr.md § Agent-Session Marker](create-pr.md#agent-session-marker-pr--session-linkage--provenance--one-home-ls-8570)):

```
bash scripts/link-pr-session.sh <PR#>
```

### Step 5: Fix blocking issues

Work through blockers in priority order. Treat each pass through Step 5 as a **remediation round**: gather the blockers that are already known, apply the needed fixes, validate once, push once, then re-enter the wait loop. Do not split already-known review and CI fixes into separate pushes unless the first push is required to reveal the next blocker.

#### Priority 1: Merge conflicts

If ANY conflict signal fires — `mergeable: "CONFLICTING"`, the `CI: Conflicts` label, or a red "No Merge Conflicts" required check (the label/check come from a deterministic `git merge` test and stay reliable while `mergeable` sits at `UNKNOWN` after a base push):

1. Load the rebase skill: read `../../worktree-workflow/references/rebase.md`
2. Rebase onto the base branch (usually `origin/main`)
3. Resolve conflicts
4. Run post-rebase stabilization: `worktree_stabilize()`
5. Validate the worktree: the seven `pc-*` chunks in order via `nx_run_pc_chunk` (never monolithic `make pc` — see [rebase.md § Post-Rebase Stabilization](../../worktree-workflow/references/rebase.md#post-rebase-stabilization-critical))
6. Force-push: `worktree_push()` — first confirm no Reviewer (W1) run is in flight ([why](common-review-patterns.md#ci--reviewer-infrastructure-recovery-recipes))

#### Priority 2: CI failures

If CI is failing:

0. **Step 0: stale-base check (mandatory, before any rerun or code fix)** — `github_pr_why_blocked({ number: <PR#> })`: if `hint: "STALE_BASE"` or `behindBy >= 1` on a non-flake failure, go to Priority 4 (rebase) instead of continuing; never `ci_rerun` on a stale base (it replays the old merge ref). Full checklist (behind-by, red-on-main, `git merge-base --is-ancestor`, rerun-vs-rebase rule, test-count-mismatch tell): [ci-event-response.md § Failing CI Checks](ci-event-response.md#failing-ci-checks).
1. Get the run ID: `ci_list_runs(branch: "<headRefName>", limit: 1)`
2. Check if it's a flaky test (only when `behindBy == 0`) — `ci_rerun(runId: <id>, failedOnly: true)` if it looks transient
3. If persistent, get logs: `ci_get_logs(runId: <id>, errorSummary: true)`
4. Load debugging skill if code changes are needed: read `../../debugging/SKILL.md`
5. Fix, validate with `make pc`, self-review fix code against `./common-review-patterns.md`, then commit and push

#### Priority 3: Review comments

If there are unresolved review threads:

1. Fetch threads: `github_get_review_threads(number: <PR#>)`
2. For each thread, read the comment's path/line/body
3. Cross-reference with Jira ticket context (don't apply suggestions that contradict AC)
4. Fix the code, validate with `make pc`, self-review fix code against `./common-review-patterns.md`, then commit and push
5. Resolve threads: `github_resolve_threads(threadIds: [...], prNumber: <PR#>)`
6. Apply `bot:ready-for-review` label: `github_manage_labels(prs: [<PR#>], add: ["bot:ready-for-review"])` — fires the next review cycle; Copilot triggers automatically.

Cap at **2 fix-review rounds**. After round 2, resolve remaining threads as "acknowledged" and proceed.

**Batching rule**: if CI failures and unresolved review threads coexist, collect both the thread set and CI evidence before editing. The default unit of work is one remediation round -> one validation -> one push, not separate pushes for already-known issues.

#### Priority 4: Stale branch

If the branch is behind `main` but not conflicting — concretely, `behindBy >= 1` from `github_pr_why_blocked` / `github_pr_diagnose` (or `mergeStateStatus: BEHIND`), or any `STALE_BASE` hint from Priority 2 — rebase to pick up the latest (no minimum distance: one commit is enough when a failing check is green on `main`; with no failing check, rebase only when `behindBy >= 1` and you are about to push anyway):

```
worktree_rebase()
worktree_stabilize()
# validate: the seven pc-* chunks in order (nx_run_pc_chunk), not monolithic make pc
worktree_push()
```

### Step 6: Event handling loop

Wake-source choice, cadence, and what to do on a wake that needs no action are owned by **[mcp-first / waiting-and-wakeups](../../mcp-first/references/waiting-and-wakeups.md)** — including the [Periodic Wake Protocol](../../mcp-first/references/waiting-and-wakeups.md#periodic-wake-protocol) for sessions without `gh`.

After fixing all known issues, **arm the canonical PR watch, then idle** — the watch re-invokes this session on the next actionable event:

```
Monitor({ command: "bash <worktree-abs-path>/scripts/watch-pr.sh <PR#>",
          persistent: true, description: "PR #<N> watch" })
```

The script path must be **absolute** — `Monitor` is not guaranteed to run with the worktree root as its cwd, and a bare relative `scripts/watch-pr.sh` exits 127 before the script runs a single line (LS-9045).

> **Precondition for waiting on PR events (LS-8544)**: never end a turn with the PR in a non-terminal state unless the watch is armed. The watch polls harness-side (zero tokens) and emits only actionable transitions — red required contexts, corroborated conflicts, new reviews, escalation labels, SKIPPED-pipeline stalls, MERGED/CLOSED — and heartbeats `.claude/.pr-watch-armed-<PR#>` so the stop guard permits idling. Native push notifications remain a bonus accelerant, but they are not load-bearing: **merge-conflict transitions from main advancing are never delivered natively**, and CI/review notifications have observably failed to arrive (stuck PRs #6161/#6163). Treat `github_view_pr` and `ci_view_run` as one-shot lookups (e.g. to fetch a `runId` after a failure event), never poll targets — `Start-Sleep`/`sleep` + repeated reads are still banned. See the [mcp-first CI Operations section](../../mcp-first/references/service-operations.md#ci-operations).
>
> **On every wake-up**, re-check state before assuming the last known state still holds — events can supersede each other while the session is idle. Use the two-call wake procedure in [waiting-and-wakeups](../../mcp-first/references/waiting-and-wakeups.md#wake-procedure--one-turn-two-calls) (`github_pr_batch_status` + the state file); reach for `github_pr_why_blocked` only when that shows a blocker you cannot classify.
>
> **And a watch/notification only helps a bound, PR-branch session** — see the `worktree_set` gotcha below. If this session never completed Step 4 (PR-branch checkout + `worktree_set`) — e.g. it is a chip or cloud session still on its auto-generated `claude/<name>` branch — do not enter this loop at all: re-arm `bot:ready-for-review`, report the hand-off, and stop.

> **⛔ Desktop Auto-fix / Auto-merge toggles must stay OFF for PRs in this repo.** The Claude Code desktop app's CI status bar offers Auto-fix and Auto-merge toggles; both fight this repo's bot-review flow. Auto-fix replies to review threads in free-form text — the Reviewer Bot accepts only `FIX:`/`JUSTIFY:`/`CANNOT-COMPLY:` structured replies, so free-form replies trip its format-error path and inflate the cycle counter toward false `needs-human-arbitration` — and it pushes fixes without re-applying `bot:ready-for-review`, so its own fix-push fires no reviewer cycle. Auto-merge squash-merges as soon as checks pass, bypassing the Reviewer Bot → `merge-when-ready` → merge-queue gate (see [Label Ownership](label-ownership.md#label-ownership)). Handle review replies and merging through the [Author Agent Contract](author-agent-contract.md) instead.

> **Responding to a review is NOT a terminal state.** The single most common stall is a session that replies to every thread (or runs `/respond-to-review`), writes a summary, and ends its turn while the PR is still `CHANGES_REQUESTED` — which reads, from the outside, as "the PR got a review but nothing happened." A `JUSTIFY:` does not clear `CHANGES_REQUESTED`, and a passing review is moot while CI is red or `SKIPPED`. The loop may only stop at a true terminal state: `MERGED`, `CLOSED`, or a genuine human-only blocker that you have **surfaced with a label and an explicit message** (e.g. asking the maintainer to apply `review-bot-override` on a persistent bot false positive). See [Terminal states](#terminal-states-the-only-places-this-loop-may-stop) below and ["JUSTIFY standoff"](#justify-standoff-the-bot-keeps-re-raising-a-finding-you-disputed).

> **Precondition for any CI status read**: a push event has arrived (CI failure/pass, review, merge). Treat `ci_view_run`, `github_view_pr`, and `gh pr view --json statusCheckRollup` as one-shot lookups triggered by an event — not as poll targets. Repeated calls in a `sleep` loop have been observed burning 1–2M tokens per session for zero earlier signal than the native push notification.

> **`run:integration` runs can be orphaned by merge — accepted by design.** A PR-branch integration run still in flight when the PR merges (merge-queue squash + branch deletion) is cancelled or its result never consumed; the nightly full Playwright run on `main` is the backstop ([ADR 0014](../../../../docs/decisions/0014-integration-nightly-bisect.md)). When a `run:integration` result matters to the merge decision, **confirm the run completed before merging**, or re-validate on `main` afterward. Do not treat an in-flight run as a green signal (this bit LS-7876 / #5023).

React to each event as it arrives. Handle each event:

| Event                                                                                                                | Action                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checks_failed`                                                                                                      | If the failed check is `bot-review` or otherwise looks review-related by name/context, first inspect the status details (for example via `github_list_commit_statuses({ prNumber: <PR#> })` or the failed check URL) to confirm it is an unresolved-comments/review-threads blocker, then return to Step 5, Priority 3. Otherwise get run ID via `ci_list_runs`, inspect logs, fix or re-run (return to Step 5, Priority 2) |
| `checks_passed`                                                                                                      | CI is green — if the Reviewer Bot has APPROVED, it will add `merge-when-ready` itself. Author Agent does nothing here.                                                                                                                                                                                                                                                                                                      |
| `new_review_thread`                                                                                                  | Fix the review comment (return to Step 5, Priority 3)                                                                                                                                                                                                                                                                                                                                                                       |
| `review_approved`                                                                                                    | The Reviewer Bot adds `merge-when-ready` itself on APPROVED. Author Agent does **not** apply this label manually — doing so bypasses the review gate.                                                                                                                                                                                                                                                                       |
| `review_dismissed`                                                                                                   | A prior bot review was auto-dismissed by a push. **This is not a clean state** — the Reviewer Bot has not yet evaluated the new commits. Re-apply `bot:ready-for-review` to fire the next cycle. A `DISMISSED` review with no label is the most common form of "PR got a review but nothing happened" — the agent pushed fixes, GitHub dismissed the old review, and nothing re-triggered the bot.                          |
| `review_changes_requested`                                                                                           | Inspect the review, fix issues (return to Step 5, Priority 3). If you `JUSTIFY:` a finding and the bot re-raises it, follow [JUSTIFY standoff](#justify-standoff-the-bot-keeps-re-raising-a-finding-you-disputed) — do not stop on an open JUSTIFY.                                                                                                                                                                         |
| `conflicts` (label/comment/red "No Merge Conflicts" check observed on a wake-up — there is no native conflict event) | Rebase (return to Step 5, Priority 1)                                                                                                                                                                                                                                                                                                                                                                                       |
| `merged`                                                                                                             | Success — proceed to Step 7                                                                                                                                                                                                                                                                                                                                                                                                 |
| `closed`                                                                                                             | PR was closed externally — report and stop                                                                                                                                                                                                                                                                                                                                                                                  |

**Merge conditions** — the **Reviewer Bot** applies `merge-when-ready` itself once its verdict is APPROVED (label-add in `.github/scripts/reviewer/index.mjs`). The Author Agent's job is to make sure the Reviewer Bot can do its job:

- CI checks are passing
- No unresolved review threads
- `bot:ready-for-review` has been (re-)applied since the last fix-push so the Reviewer Bot fires

When the Reviewer Bot APPROVEs, it labels the PR with `merge-when-ready` itself and the merge queue (`.github/workflows/merge-queue.yml`) picks it up automatically. **Precondition for the merge step**: wait for the Bot's label rather than applying `merge-when-ready` yourself; manual application bypasses the gate that holds back PRs the Bot has rejected. Use `github_merge_pr` only when the workflow explicitly calls for an admin merge (`strategy: "direct"`) — the default path is the merge queue. See [Label Ownership](label-ownership.md#label-ownership).

If a clean PR sits without `merge-when-ready` for more than one Reviewer Bot cycle, the upstream cause is either (a) `bot:ready-for-review` was not (re-)applied after the last push, (b) the Reviewer Bot is rate-limited (`review-bot-degraded` label present), (c) the Reviewer Bot is out of LLM credits (`review-bot-billing` label present — retrying cannot help; escalate to the account owner), or (d) the Reviewer Bot's verdict is still CHANGES_REQUESTED. Fix the upstream cause — do not paper over with the label.

After handling an event, continue until `merged` or `closed`.

#### Terminal states (the ONLY places this loop may stop)

Do not end your turn until one of these is true. "I posted my replies" and "I pushed my fix" are **not** terminal — they are mid-loop events. Stopping anywhere else is the defect that makes a PR look reviewed-but-abandoned.

| Terminal state                           | How you confirm it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Merged**                               | `github_view_pr({ number: <PR#> })` returns `state: "MERGED"` (or `mergedAt` populated)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Closed without merge**                 | `state: "CLOSED"` with no `mergedAt` — report and stop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Genuine human-only blocker**           | You have applied the right label (e.g. `requires-human-review`) **and** posted a message naming the exact blocker and what the human must do. A blocker is not terminal until it is surfaced — silently parking is never allowed.                                                                                                                                                                                                                                                                                                        |
| **Held on external E2E blocker (armed)** | E2E failures were proven pre-existing on `main` (attribution gate passed), and **all four** hold conditions are met: blocker ticket filed/linked, `<!-- e2e-hold -->` marker comment + `blocked:e2e-on-main` label on the PR, user notified via push notification, and the long-poll monitor armed. The turn may end; the session resumes on the monitor event (rebase → revalidate → re-review). Full protocol: [e2e-hold.md](e2e-hold.md). A red E2E check with fewer than all four conditions is **not** this state — it is mid-loop. |

If none of these holds, you are still mid-loop — keep going.

#### JUSTIFY standoff: the bot keeps re-raising a finding you disputed

A `JUSTIFY:` reply does **not** clear `CHANGES_REQUESTED` — it leaves the thread open for the bot to adjudicate on the next cycle. If the Reviewer Bot re-raises the **same finding** you already justified (i.e. it is a false positive that won't die), you are in a standoff. Resolve it deterministically — never park on it:

1. **Confirm it's a true false positive**, not a real issue you mislabeled — re-read the flagged code and the bot's claim. If the bot is right, switch to `FIX:`.
2. **Leave a durable in-code/doc note** at the flagged line (or nearest `SKILL.md`/`references/` doc) explaining why the pattern is intentional, and push it — so the finding stops recurring and a maintainer can see the rationale at a glance. (Author Agent Contract §2.)
3. **Drive to the cycle cap.** Re-apply `bot:ready-for-review` and let the cycle counter advance. At Cycle 3+, reply `CANNOT-COMPLY: <issue-id>` (reason on the next line) on the disputed thread instead of another `JUSTIFY:`.
4. **Escalate to the maintainer for the override.** A persistent false-positive `CHANGES_REQUESTED` can only be cleared by a human applying `review-bot-override` (you must never apply it yourself — Author Agent Contract §5). Post a comment that quotes the finding, your evidence that it's wrong, and explicitly asks the maintainer to apply `review-bot-override`. **This ask — with the label named — is itself a terminal state** (genuine human-only blocker). Parking on an open JUSTIFY with no such ask is not.

#### AskUserQuestion may be unavailable in autonomous sessions

**Symptom** (LS-8378, broadened by LS-8400): `AskUserQuestion` fails outright with `Tool permission stream closed before response received` — not a timeout, the call never completes. First observed (LS-8378) in a session with an active `github-webhook-activity` PR subscription (this event loop) while PR events were arriving concurrently, and originally attributed to contention between the webhook event channel and the interactive prompt channel. LS-8400 reproduced the same error twice in a row in a plain autonomous session with no webhook subscription active — mid-decision on a rejected-push force-vs-new-commit choice — which rules out webhook contention as the sole trigger. The identical error string also hit the unrelated `delete_trigger` MCP tool in the same class of session (LS-8381, a stdio tool call with no interactive prompt channel at all; that ticket was closed `Won't Do` since the fix is in core harness plumbing, not this repo) — though that case is weaker corroboration than it looks (LS-9648): `delete_trigger` is flagged `requiresUserInteraction` and forces a permission prompt on **every** call by design, so an unattended session fails it without any plumbing bug. See [cloud-agent-mode § Trigger lifecycle](../../cloud-agent-mode/references/claude-code-remote.md#trigger-lifecycle-never-call-delete_trigger-ls-9648) — and never call `delete_trigger` from an agent session in the first place. Treat this as a known limitation of autonomous/background-driven sessions generally (an armed PR watch, a Routine, a dispatched chip, or any unattended session) rather than a bug to work around with retries.

**When this can bite**: mid-loop, when you hit a genuine decision only the user can make — e.g. an out-of-scope architectural conflict discovered while fixing CI, an ambiguous review comment, a rejected push needing a force-vs-new-commit call, or anything else that would normally warrant `AskUserQuestion`. It is not limited to sessions with an active PR-activity subscription.

**Do not retry `AskUserQuestion` in a loop** — there's no evidence a retry succeeds once the stream has closed, and looping just burns turns waiting on a response that may never arrive.

**Fallback**:

1. Proceed with your best-judgment call and **document the reasoning explicitly** — in the PR body/comment and, if a Jira ticket is linked, a ticket comment.
2. Post a PR comment naming the decision point, the option you chose, and why, so a human reviewer can override before merge.
3. If the decision is genuinely blocking (unsafe to proceed either way), treat it as the [Genuine human-only blocker terminal state](#terminal-states-the-only-places-this-loop-may-stop): apply `requires-human-review`, post the explicit question as a comment, and stop — do not keep calling `AskUserQuestion`.
4. Where available, `send_later` (claude-code-remote MCP) can schedule a check-in with the human instead of blocking indefinitely on a prompt that may never resolve. A single `send_later` call is a legitimate one-shot scheduling call, not polling — but Auto Mode's permission classifier can still deny it outright (`"Blocked by classifier"`); don't retry the identical call, fall back to pure webhook-driven PR watching instead (see [cloud-agent-mode Quirk 9](../../cloud-agent-mode/references/known-quirks.md#quirk-9-auto-modes-permission-classifier-can-block-a-legitimate-single-shot-ci_list_runssend_later-call-ls-8931)).

#### The CI pipeline must actually have run (not SKIPPED)

A review verdict is meaningless while the merge gate is red. Before you treat a review round as resolved, confirm the real CI ran:

- If `🚀 CI Pipeline` shows `SKIPPED` on the current HEAD SHA, the orchestrated suite (lint/typecheck/test/build/E2E) **did not run** — most often because `bot:ready-for-review` was not (re-)applied after the last push (CI orchestration is gated on the bot review event), or a prior label op cancelled the reviewer run. Re-apply `bot:ready-for-review` (it must be the last label op) and confirm the pipeline starts.
- A lingering `CI: *` failure label (e.g. `CI: Lint Failure`) with a `SKIPPED` pipeline means a real failure was never re-validated. Treat it as Priority 2 (CI failure), not as noise — fix the underlying check and push, do not just clear the label (you never clear `CI: *` labels manually anyway; they clear when the check passes).

### Step 7: Post-merge

After the PR merges:

1. **Jira transition** (if ticket was extracted):

   ```
   jira_transition(key: "LS-####", status: "Done")
   ```

   Skip if Jira Branch Sync already moved it — check with `jira_view(key: "LS-####")` first.

2. **Remove `agent-in-progress` label** (if present):

   ```
   github_manage_labels(prs: [<PR#>], remove: ["agent-in-progress"])
   ```

3. **Clean up worktree** (if one was created/attached): follow the standard cleanup in AGENTS.md Step 16.

### Step 8: MCP gap audit (mandatory)

After merge, run the MCP gap audit per [`../../mcp-first/references/gaps.md`](../../mcp-first/references/gaps.md) Phase 1:

1. Review all Bash commands from this session
2. Classify gaps: `missing-tool`, `missing-feature`, `missing-awareness`
3. Check for existing tickets under the current bucket epic (`jira_get_bucket_epic({ bucket: 'mcp-gaps' })`)
4. File new gap tickets as needed

### Step 9: Report results

Summarize:

- PR number and title
- Jira ticket (if extracted) and final status
- Actions taken (rebases, review fixes, CI fixes, re-runs)
- Final state: merged, or blocked with reason
- MCP gaps filed (if any)

## Gotchas

- **`worktree_set` is required for native CI event routing** — Claude Code Desktop routes CI/PR push notifications to the session whose active worktree matches the branch. Without calling `worktree_set` after any checkout or attach, the session enters the Step 6 event loop but never receives events and spins indefinitely. Note: `worktree_set` requires a local worktree entry to exist; for sessions that cannot create a local checkout, native events are unavailable — `worktree_watch_pr` (LS-7904) will close this gap when shipped.
- **`worktree_set` does NOT link the session to the PR in the desktop UI** — the session's branch association is snapshotted at creation, and MCP calls are invisible to the desktop's PR detection, so a pickup session's PR status bar usually stays empty. Stamp the PR with `bash scripts/link-pr-session.sh <PR#>` (Step 4) for provenance and the best available shot at linkage — but note the tested caveat in [create-pr.md § Agent-Session Marker](create-pr.md#agent-session-marker-pr--session-linkage--provenance--one-home-ls-8570): a body edit alone has not been observed to trigger desktop linkage; an empty status bar after stamping is an upstream desktop limitation, not a workflow bug (LS-8570).
- **Don't stop after the first fix** — the event loop is the core of this skill. A PR often needs multiple rounds (fix CI → new review → fix review → CI again → merge). Replying to a review or pushing a fix is a mid-loop event, never a stopping point — see [Terminal states](#terminal-states-the-only-places-this-loop-may-stop). The most common abandonment is exiting on an open `JUSTIFY:` or a `SKIPPED`/red CI pipeline.
- **`mergeable: UNKNOWN` is "unclassified", not "wait for an event"** — GitHub recomputes lazily and flips to `UNKNOWN` every time `main` advances, and **no event is delivered when `main` advancing causes a conflict** (see Step 6). Check next: the `CI: Conflicts` label and the failing **No Merge Conflicts** check — either one means conflicted, so go to Priority 1 (rebase). With neither, treat it as pending and re-check on the next wake; if it is still `UNKNOWN` after two wakes, run `github_pr_why_blocked` once for the unioned verdict. Full rule: [waiting-and-wakeups § Conflicted and behind](../../mcp-first/references/waiting-and-wakeups.md#conflicted-and-behind-ls-10377).
- **Check Runs vs. Commit Statuses** — `github_retrigger_check` only works on Check Runs. `bot-review` uses the Statuses API. If "check not found", use `github_list_commit_statuses({ prNumber: <PR#> })` instead. See pr-lifecycle SKILL.md Critical Rule 8.
- **Cap review fix rounds at 2** — after 2 rounds, resolve remaining threads and proceed. Infinite review loops are a common agent failure mode.
- **Always validate before pushing** — `make pc` locally; in cloud/timeout-prone sessions the seven `pc-*` chunks per [cloud-agent-mode](../../cloud-agent-mode/SKILL.md) (never monolithic `make pc`). Every push without validation risks a 40-60 min CI failure cycle.
- **Don't re-implement sub-skill logic** — delegate to `rebase`, `debugging`, and `pr-lifecycle` skills. This skill is the orchestrator, not the implementer.
- **Cloud agents report, not fix** — if the PR needs code changes and you're in a cloud environment, report what needs to be done rather than spinning on impossible operations.
- **Respect `agent-in-progress` if set by another agent** — if the label is present and you didn't set it, another agent may be actively working on this PR. Ask the user before proceeding.
