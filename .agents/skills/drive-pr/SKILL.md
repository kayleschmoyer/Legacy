---
name: drive-pr
description: 'Pick up an existing PR by number and shepherd it to merge. Inspects current state (CI, reviews, conflicts), fixes whatever is blocking, and loops through github_wait_for_pr_event until the PR merges. Handles CI failures, review comments, merge conflicts, and stale branches. Extracts the linked Jira ticket and manages status transitions. Works in both local (worktree) and cloud (API-only) modes. Use when given a PR number/URL and asked to drive it to merge, land it, ship it, or get it merged.'
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
| Request Copilot review             |     YES     |     YES     |
| Jira status transitions            |     YES     |     YES     |
| Merge the PR                       |     YES     |     YES     |

> **Cloud agents cannot commit or push code.** If the PR needs code changes (conflict resolution, review fixes, CI fixes), the cloud agent should comment with the specific blockers, stop, and ask the user to rerun `/drive-pr` from a local/worktree session. Only label `requires-human-review` when the blocker is genuinely outside any agent's reach (for example: missing credentials, a product decision, or an external dependency).

## Sub-Skills (Load on Demand)

This skill is a **coordinator** — it delegates to specialized sub-skills for actual fixes:

| Problem                    | Sub-Skill                                             |
| -------------------------- | ----------------------------------------------------- |
| Merge conflicts            | `skills/rebase/SKILL.md`                              |
| Copilot review comments    | `skills/pr-lifecycle/SKILL.md` (Phase 3: Fix Reviews) |
| CI failures (code changes) | `skills/debugging/SKILL.md`                           |
| Worktree setup             | `skills/worktree-workflow/SKILL.md`                   |

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
github_pr_batch_status(numbers: [<PR#>])
```

This returns `mergeable`, `ciSummary`, `reviewDecision`, and `unresolvedThreadCount` in one call.

Also fetch review threads if there are unresolved ones:

```
github_get_review_threads(number: <PR#>, unresolvedOnly: true)
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
  ```
- **Starting from the main repo** (parallel/batch flow): create a sibling worktree via `worktree_attach`:
  ```
  worktree_attach(branch: "<headRefName>")
  ```

Then set up node_modules (required in both cases):

```
worktree_setup_node_modules()
```

### Step 5: Fix blocking issues

Work through blockers in priority order. After each fix, commit, push, and re-enter the wait loop.

#### Priority 1: Merge conflicts

If `mergeable: "CONFLICTING"`:

1. Load the rebase skill: read `skills/rebase/SKILL.md`
2. Rebase onto the base branch (usually `origin/main`)
3. Resolve conflicts
4. Run post-rebase stabilization: `worktree_stabilize()`
5. Validate the worktree: `make_run(target: "pc")`
6. Force-push: `worktree_push()`

#### Priority 2: CI failures

If CI is failing:

1. Get the run ID: `ci_list_runs(branch: "<headRefName>", limit: 1)`
2. Check if it's a flaky test — `ci_rerun(runId: <id>, failedOnly: true)` if it looks transient
3. If persistent, get logs: `ci_get_logs(runId: <id>, errorSummary: true)`
4. Load debugging skill if code changes are needed: read `skills/debugging/SKILL.md`
5. Fix, validate with `make pc`, self-review fix code against `skills/pr-lifecycle/references/common-review-patterns.md`, then commit and push

#### Priority 3: Review comments

If there are unresolved review threads:

1. Fetch threads: `github_get_review_threads(number: <PR#>, unresolvedOnly: true)`
2. For each thread, read the comment's path/line/body
3. Cross-reference with Jira ticket context (don't apply suggestions that contradict AC)
4. Fix the code, validate with `make pc`, self-review fix code against `skills/pr-lifecycle/references/common-review-patterns.md`, then commit and push
5. Resolve threads: `github_resolve_threads(threadIds: [...], prNumber: <PR#>)`
6. Re-request review: `github_request_review(number: <PR#>)`

Cap at **2 fix-review rounds**. After round 2, resolve remaining threads as "acknowledged" and proceed.

#### Priority 4: Stale branch

If the branch is behind `main` but not conflicting, rebase to pick up the latest:

```
worktree_rebase()
worktree_stabilize()
make_run(target: "pc")
worktree_push()
```

### Step 6: Wait-for-event loop

After fixing all known issues, enter the event loop:

```
github_wait_for_pr_event({ number: <PR#> })
```

This blocks until an agent-actionable event fires. Handle each event:

| Event                      | Action                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `checks_failed`            | Get run ID via `ci_list_runs`, inspect logs, fix or re-run (return to Step 5, Priority 2) |
| `checks_passed`            | CI is green — if reviews are also clear, add `merge-when-ready` label                     |
| `new_review_thread`        | Fix the review comment (return to Step 5, Priority 3)                                     |
| `review_approved`          | If CI is also passing, add `merge-when-ready` label                                       |
| `review_changes_requested` | Inspect the review, fix issues (return to Step 5, Priority 3)                             |
| `conflicts`                | Rebase (return to Step 5, Priority 1)                                                     |
| `merged`                   | Success — proceed to Step 7                                                               |
| `closed`                   | PR was closed externally — report and stop                                                |

**Merge conditions** — add `merge-when-ready` label when ALL of:

- CI checks are passing
- No unresolved review threads
- Review decision is APPROVED (or no reviews required)
- PR is mergeable

```
github_manage_labels(number: <PR#>, add: ["merge-when-ready"])
```

This triggers the repo's label-driven merge queue (`.github/workflows/merge-queue.yml`). Do **not** call `github_merge_pr` directly — it may bypass or conflict with branch protection and merge-queue enforcement. Continue the `github_wait_for_pr_event` loop after labeling; the merge queue will produce a `merged` event when the PR lands.

After handling an event, call `github_wait_for_pr_event({ number: <PR#> })` again. Continue until `merged` or `closed`.

### Step 7: Post-merge

After the PR merges:

1. **Jira transition** (if ticket was extracted):

   ```
   jira_transition(key: "LS-####", status: "Done")
   ```

   Skip if Jira Branch Sync already moved it — check with `jira_view(key: "LS-####")` first.

2. **Remove `agent-in-progress` label** (if present):

   ```
   github_manage_labels(number: <PR#>, remove: ["agent-in-progress"])
   ```

3. **Clean up worktree** (if one was created/attached): follow the standard cleanup in AGENTS.md Step 16.

### Step 8: MCP gap audit (mandatory)

After merge, run the MCP gap audit per `skills/mcp-gaps/SKILL.md` Phase 1:

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

- **Don't stop after the first fix** — the event loop is the core of this skill. A PR often needs multiple rounds (fix CI → new review → fix review → CI again → merge).
- **`mergeable: UNKNOWN` is not a blocker** — GitHub may still be computing. Wait for the next event rather than treating it as an error.
- **Check Runs vs. Commit Statuses** — `github_retrigger_check` only works on Check Runs. `bot-review` uses the Statuses API. If "check not found", use `github_list_commit_statuses({ number: <PR#> })` instead. See pr-lifecycle SKILL.md Critical Rule 8.
- **Cap review fix rounds at 2** — after 2 rounds, resolve remaining threads and proceed. Infinite review loops are a common agent failure mode.
- **Always `make pc` before pushing** — every push without validation risks a 40-60 min CI failure cycle.
- **Don't re-implement sub-skill logic** — delegate to `rebase`, `debugging`, and `pr-lifecycle` skills. This skill is the orchestrator, not the implementer.
- **Cloud agents report, not fix** — if the PR needs code changes and you're in a cloud environment, report what needs to be done rather than spinning on impossible operations.
- **Respect `agent-in-progress` if set by another agent** — if the label is present and you didn't set it, another agent may be actively working on this PR. Ask the user before proceeding.
