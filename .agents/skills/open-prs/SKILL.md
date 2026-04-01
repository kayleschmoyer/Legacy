---
name: open-prs
description: 'Orchestrate PR maintenance across all open PRs: scan for conflicts/reviews/CI failures, rebase conflicting branches, fix review comments, debug CI failures, label clean PRs merge-when-ready, and report results. Burns through every open PR until each reaches a settled state (clean or labeled requires-human-review for blockers outside agent reach). Supports full overnight sweep (loop until all settled) or individual operations (rebase only, reviews only, label only). Works in both local (worktree) and cloud agent (read-only) modes. Use when asked to clean up PRs, sweep open PRs, fix all PR issues, rebase all PRs, label clean PRs, or get PRs ready to merge.'
---

# Skill: PR Operations

## Overview

Orchestrate PR maintenance across all open PRs. This skill is a **coordinator** — it discovers problems, delegates to specialized sub-skills for the actual fixes, and manages the overall flow.

The core principle is **burn through until settled**: every PR must reach a terminal state before the sweep ends. A PR is **settled** when it is either clean (no conflicts, CI passing, no unresolved threads) or labeled `requires-human-review` because the blocker is genuinely outside agent reach (see Critical Rules for valid/invalid reasons).

Supports three modes:

- **Full sweep** (local) — loop through all open PRs fixing conflicts, reviews, and CI until every PR is settled
- **Targeted operation** — run a single operation (e.g., "rebase all conflicting PRs", "label clean PRs")
- **Cloud agent sweep** — scan, triage, and take all API-only actions (label, re-run CI, resolve threads, request reviews); label `requires-human-review` only for blockers outside agent reach and report

> **Scope note** — The batch PR triage tools (`github_pr_scan`, `github_pr_dashboard`, `github_pr_batch_status`, `github_resolve_threads`) are provided by the `legacy-sports-github` MCP server and are available to both local and cloud agents for API-only operations (scan, triage, label, resolve threads, request reviews). In this skill, "local-only" refers specifically to actions that require a git checkout/commit/push (e.g., rebases, code edits, CI-fix branches), which must be handled by a local agent or human developer.

## Environment Compatibility

| Operation                          | Local Agent | Cloud Agent | Cloud Tool                                              |
| ---------------------------------- | :---------: | :---------: | ------------------------------------------------------- |
| Scan & classify all PRs            |     ✅      |     ✅      | `github_pr_dashboard`                                   |
| Detailed PR inspection             |     ✅      |     ✅      | `github_view_pr`, `github_pr_batch_status`              |
| Request Copilot reviews            |     ✅      |     ✅      | `github_request_review` (required for bot-authored PRs) |
| Re-run flaky / failed CI           |     ✅      |     ✅      | `ci_rerun`                                              |
| Diagnose CI failures (read logs)   |     ✅      |     ✅      | `ci_get_logs`, `ci_search_logs`                         |
| Resolve process/meta threads       |     ✅      |     ✅      | `github_resolve_thread`                                 |
| Fetch review thread details        |     ✅      |     ✅      | `github_get_review_threads`                             |
| Rebase conflicting PRs             |     ✅      |     ❌      | — (requires git checkout + push)                        |
| Fix review comments (code changes) |     ✅      |     ❌      | — (requires file edits + commit)                        |
| Fix CI failures (code changes)     |     ✅      |     ❌      | — (requires file edits + commit)                        |
| Post-rebase stabilization          |     ✅      |     ❌      | — (requires make pc + push)                             |

> **Cloud agents cannot commit or push code.** Any operation that requires file edits, git commits, or git push must be deferred to a local agent or human developer. The cloud workflow focuses on API-only actions and producing an actionable report.

## When to Use

- "Clean up all open PRs overnight"
- "Sweep open PRs and get them ready to merge"
- "Rebase all conflicting PRs" _(local only)_
- "Fix all review comments across PRs" _(local only)_
- "Check PR status across the board"
- "Re-run failed CI on all PRs"
- "Request Copilot reviews on all PRs"
- Periodic maintenance before a release cut

## Decision Table

| User Intent                                        | Operation                                        | Cloud? |
| -------------------------------------------------- | ------------------------------------------------ | :----: |
| "Sweep all PRs" / "overnight cleanup"              | Full sweep (all passes, outer loop)              |   ❌   |
| "Cloud sweep" / "triage all PRs"                   | Cloud sweep (API-only actions + report)          |   ✅   |
| "Rebase all PRs" / "fix conflicts"                 | Pass 1 only                                      |   ❌   |
| "Fix review comments" / "address Copilot feedback" | Pass 2 only (delegates to `fix-copilot-reviews`) |   ❌   |
| "Fix CI failures"                                  | Pass 3 only (delegates to `debug-ci-failure`)    |   ❌   |
| "Re-run failed CI" / "retry flaky CI"              | CI rerun only                                    |   ✅   |
| "Request Copilot reviews"                          | Request on all PRs missing Copilot review        |   ✅   |
| "Check PR status" / "scan PRs"                     | Scan + report only (no fixes)                    |   ✅   |

## Sub-Skills (Load on Demand)

This skill delegates to specialized sub-skills for each operation category. Load them when you encounter that problem type:

| Operation               | Sub-Skill                                 | When to Load                                 | Cloud? |
| ----------------------- | ----------------------------------------- | -------------------------------------------- | :----: |
| Rebase conflicting PRs  | `skills/rebase/SKILL.md`                  | PR has merge conflicts                       |   ❌   |
| Resolve merge conflicts | `skills/resolve-merge-conflicts/SKILL.md` | Rebase produces conflicts needing manual fix |   ❌   |
| Fix review comments     | `skills/pr-lifecycle/SKILL.md`            | PR has unresolved Copilot review threads     |   ❌   |
| Debug CI failures       | `skills/debugging/SKILL.md`               | PR has failing CI checks                     |   ❌   |
| Enter a worktree        | `skills/worktree-workflow/SKILL.md`       | Need to create or access a PR's worktree     |   ❌   |
| Create a PR             | `skills/pr-lifecycle/SKILL.md`            | Need to open a new PR after fixes            |   ❌   |

## Prerequisites

### Local Agent

- Running from the main repo directory (`D:\code\legacy-sports`)
- `gh` CLI authenticated with repo access
- `twig` available on PATH
- AWS SSO session active (for any Lambda-related CI fixes)

### Cloud Agent

- `gh` CLI authenticated (automatic via GitHub token)
- MCP servers available: `legacy-sports-github`, `legacy-sports-ci`
- No worktrees, twig, or AWS access needed

## CRITICAL RULES

### Both Environments

- **Skip draft PRs** — draft PRs are still being worked on by their creating agent. The `github_pr_scan` and `github_pr_dashboard` tools exclude drafts by default (`excludeDrafts: true`). Never fix, rebase, label, or review a draft PR — wait for the creating agent to mark it ready via `github_mark_pr_ready`.
- **Remove `@me` filter** — use `--limit 200` to catch all open PRs, not just yours
- **Resolve review threads after fixing** — leaving threads unresolved is incomplete work
- **Proactively label clean PRs** — when a PR has no unresolved review threads, add `merge-when-ready` immediately via `github_manage_labels(number: <PR#>, add: ["merge-when-ready"])`. Failing CI will automatically remove the label, so there is no risk in labeling early. The `copilot-auto-approve` bot also adds this label, but the agent should not wait for it.
- **Dashboard CI summary can be stale** — the dashboard reports `ciStatus` as `none`, `pass`, `fail`, or `pending`. Stale checks (e.g., Enhanced Merge Queue on an old SHA) can cause a PR to show `fail` or `pending` even when current-SHA checks all pass. Use `github_pr_batch_status` to inspect actual job-level results: if all CI Pipeline and Security Scanning jobs are SUCCESS/SKIPPED, the PR is clean regardless of dashboard `ciStatus`.
- **Burn through until settled** — every PR must reach a terminal state. A PR is settled when it is clean, has CI pending after the final pass, or labeled `requires-human-review` with a comment explaining the blocker. Do not stop the sweep while actionable PRs remain (subject to the max-passes safety cap).
- **`requires-human-review` — only for blockers outside agent reach** — this label means the PR is blocked on something no agent can fix, no matter how many retries or approaches it tries. Valid reasons: missing credentials/secrets the agent cannot access, product or design decisions that require human judgment, blocked on an external team or system, or requires manual infrastructure access. **Invalid reasons (never label for these):** CI failures (rebase, fix the code, or re-run), review comments (read the code and fix them), dependabot/dependency bumps (rebase and regenerate lockfile), complexity or multiple failed attempts (try a different approach). Before labeling, the agent **must** have attempted at least one fix. When the label is genuinely needed, add it via `github_manage_labels(number: <PR#>, add: ["requires-human-review"])` with a PR comment explaining the specific blocker that is outside agent capability.

### Local Agent Only

- **One worktree per PR** — never mix fixes for different PRs in the same worktree
- **All file edits happen in the worktree**, never in `D:\code\legacy-sports`
- **Always `make pc` before pushing** — do not push broken code. **Every agent that modifies code must validate before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time.**
- **Dirty-tree guard before push** — after `make pc` passes, check `worktree_status(worktree: "LS-####")`. If the working tree is dirty (formatting auto-amend may leave changes on Windows), commit with `worktree_commit(message: "style: apply formatting", worktree: "LS-####")` and re-run `make pc` before pushing.
- **Always `--force-with-lease`** when pushing rebased branches — `worktree_push` uses this by default

### Cloud Agent Only

- **Never attempt git commit or push** — cloud agents cannot modify branches
- **Use MCP tools over raw `gh` commands** — the MCP servers handle error formatting and retries
- **Always produce an actionable report** — flag items that need a local agent or human developer

### MCP Fallback Protocol

When an MCP tool fails, **do not assume the entire server is down**. Different tools have different permission requirements — one tool failing does not mean all tools on that server are broken.

**Before falling back to `gh` CLI:**

1. **Test another tool on the same server** — e.g., if `github_pr_scan` fails, try `github_list_prs`. If a simpler tool works, only the failing tool has an issue.
2. **Distinguish GitHub auth failures, scope failures, and MCP outages:**
   - **GitHub auth/permissions failure** (401/403 on all GitHub MCP tools) → credentials or scopes are invalid. Use `github_auth_status` first; if needed, confirm with `gh auth status`. Fix auth or scopes rather than switching tools — raw `gh` will hit the same GitHub errors.
   - **Scope/permission failure on a specific tool** (403 on one tool while others on the same server work) → that tool's query or operation needs broader scopes. Continue using the server for everything else and fall back to simpler tools (`github_list_prs` + `github_view_pr`, etc.) for the failing operation.
   - **MCP server / transport failure** (connection errors, 5xx from the MCP layer, or multiple tools timing out) → treat as an MCP availability problem. In this case only, fall back to raw `gh` CLI for critical GitHub operations until the MCP server recovers.
3. **Check other MCP servers independently** — a GitHub MCP failure does not affect CI MCP tools. Always use `ci_list_runs`, `ci_view_run`, `ci_get_logs`, `ci_search_logs` for CI operations regardless of GitHub MCP status.

**Known scope-sensitive tools:**

- `github_pr_scan` uses a heavier GraphQL query (including `mergeable` and other enriched fields) that may fail with `Resource not accessible by integration` on tokens with limited scopes, while simpler tools (`github_list_prs`, `github_request_review`) often continue to work. Note that `github_view_pr` also queries `statusCheckRollup` and may share similar scope limitations, so it is not a guaranteed fallback when `github_pr_scan` fails due to permissions.
- `github_pr_dashboard` and `github_pr_batch_status` also use enriched queries — fall back to `github_list_prs` + individual `github_view_pr` if they fail

---

# Local Agent Workflow

> The following steps (Step 1 through Full Sweep) require a **local agent** with worktree access, git push, and `make pc`. For cloud agents, skip to [Cloud Agent Mode](#cloud-agent-mode) below.

## Step 1: Scan All Open PRs

Every operation starts with a scan. This produces a single snapshot used by all passes.

```powershell
Set-Location D:\code\legacy-sports
.\scripts\scan-prs.ps1
$scan = Get-Content scratch/pr-scan.json | ConvertFrom-Json
```

The scan produces categorized lists:

| Field               | Contains                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| `$scan.totalOpen`   | Total open PR count                                                              |
| `$scan.conflicting` | PRs with merge conflicts (`{ number, title, headRefName }`)                      |
| `$scan.reviews`     | PRs with unresolved review threads (`{ number, title, headRefName, threads[] }`) |
| `$scan.ciFailing`   | PRs with failing CI (`{ number, title, headRefName, failedChecks[] }`)           |
| `$scan.ciPending`   | PRs with in-progress CI (`{ number, title, headRefName }`)                       |
| `$scan.clean`       | PRs with no issues (MERGEABLE, CI passing, no unresolved threads)                |

Print the summary:

```powershell
Write-Host "Open PRs: $($scan.totalOpen)"
Write-Host "  Conflicting: $($scan.conflicting.Count)"
Write-Host "  Unresolved reviews: $($scan.reviews.Count)"
Write-Host "  CI failing: $($scan.ciFailing.Count)"
Write-Host "  CI pending: $($scan.ciPending.Count)"
Write-Host "  Clean: $($scan.clean.Count)"
```

> For a **scan-only** request, stop here and report the results.

---

## Step 2: Find and Enter a PR Worktree

Every fix operation needs a worktree. **Use `worktree_list` to discover existing worktrees** — do not use `ls D:/code/legacy-sports-worktrees/ | grep` or similar shell patterns.

### Discover worktrees (MCP)

```
worktree_list()
```

This returns all worktrees with paths, branches, and ticket IDs. Match the PR's branch name or ticket number from the response to find the correct worktree path. Then set it active:

```
worktree_set(key: "LS-####")
```

> **Disambiguation**: `worktree_set` resolves by ticket key, full branch name, or directory name. If multiple worktrees share the same ticket key (e.g., `LS-1234/feature-a` and `LS-1234/feature-b`), passing just `LS-1234` will return an ambiguity error. In that case, pass the full branch name or directory name from the `worktree_list` response instead (e.g., `worktree_set(key: "LS-1234/feature-a")`).

### Create a worktree if none exists

If no worktree exists for the PR's branch, create one using the worktree workflow skill.

### Shell fallback

Only when MCP is unavailable:

```powershell
Set-Location D:\code\legacy-sports
$branch = $pr.headRefName
$wtPath = .\scripts\pr-enter-worktree.ps1 -Branch $branch
Set-Location $wtPath
```

Always return to the main repo before processing the next PR:

```powershell
Set-Location D:\code\legacy-sports
```

---

## Pass 0: Request Copilot Reviews

Before fixing anything, ensure every open PR has a Copilot review. The repository ruleset (`review_on_push: true`) auto-triggers Copilot for user-authored PRs, but **not for PRs authored by GitHub Apps** (the `requestReviewers` REST API silently drops Copilot when called with installation tokens). Since most agent-created PRs are authored by `legacy-sports-code-bot`, this step is essential.

For each PR without a Copilot review (check `reviews` in the scan results):

```
github_request_review(number: <PR#>)
```

The MCP tool uses a user OAuth token (via `gh auth token`) for Copilot requests, bypassing the default app token that would silently fail.

---

## Pass 1: Rebase Conflicting PRs

For each PR in `$scan.conflicting`:

1. Enter the worktree (Step 2)
2. **Rebase via MCP**: `worktree_rebase(worktree: "LS-####")` — this fetches the latest remote state and rebases onto the parent branch in one operation. Worktrees have their own fetch state and may be stale even if the main repo fetched recently.
3. If conflicts arise → load `skills/rebase/SKILL.md` and `skills/resolve-merge-conflicts/SKILL.md`
4. **Post-rebase stabilization**: `worktree_stabilize(worktree: "LS-####")` — reinstalls deps, regenerates schema, and runs affected codegen so `make pc` does not fail on stale artifacts.
5. After rebasing ALL PRs, batch-validate with parallel `make pc` (see Parallelization Strategy below)
6. **Dirty-tree guard**: after `make pc` passes, run `worktree_status(worktree: "LS-####")`. If dirty (e.g., `tsconfig.base.json` reformatted), commit with `worktree_commit(message: "style: apply formatting after rebase", worktree: "LS-####")` and re-run `make pc`.
7. Push passing PRs: `worktree_push(worktree: "LS-####")`

> **Shell fallback** (only when MCP unavailable): `git -C "$wtPath" fetch origin && git -C "$wtPath" rebase origin/main`, then `git -C "$wtPath" push --force-with-lease origin HEAD`.

> **Multiple PRs touching the same files**: When several PRs add code to the same location (e.g., tool registrations in `index.ts`), they conflict with each other — not just with main. After one merges, the next will conflict with the updated main. Rebase these sequentially, fetching whenever `main` changes (e.g., after each merge and before rebasing the next PR). Consider alphabetizing shared files (imports, registrations) so git can auto-merge concurrent additions.

If a rebase fails irrecoverably: `git rebase --abort`, comment on the PR with the failure reason, and move on. Only label `requires-human-review` if the conflict requires human judgment (e.g., schema design decisions) — routine merge conflicts should be retried in a future sweep. The PR is now **settled**.

> **Full step-by-step rebase instructions** are in `skills/rebase/SKILL.md`. Do not duplicate them here — load the skill.

---

## Pass 2: Fix Unresolved Review Comments

**Parallel by default** — PRs with review comments are independent and can be fixed concurrently. Spawn up to 3 sub-agents, each working in its own worktree. See [sweep-and-parallelization.md](../pr-lifecycle/references/sweep-and-parallelization.md) for the agent prompt template and failure handling.

For each PR in `$scan.reviews` (in parallel batches of 3):

1. Enter the worktree (Step 2)
2. **Load `skills/pr-lifecycle/SKILL.md`** — it contains the full workflow: reading comments, applying fixes, validating, committing, resolving threads, and the common-patterns reference table
3. After pushing, re-check for new threads (Copilot re-reviews on push)
4. If a review fix sub-agent **cannot complete the task but runs successfully**, analyze why, and optionally do **one** orchestrator-driven retry with a different approach (e.g., read the module source, check related files for patterns, try an alternative implementation). If it still cannot resolve the comments, comment on the PR with the diagnosed blocker. Only label `requires-human-review` if the blocker is outside agent reach (needs credentials, product decisions, or external dependencies) — otherwise leave it unlabeled for a future sweep attempt. If the sub-agent **execution itself fails** (crash, timeout, or tool error), do not retry — comment on the PR with the failure details and continue to the next PR (do not label, as the failure may be transient).

> **No manual labeling needed.** The `copilot-auto-approve` bot labels clean PRs automatically after Copilot re-reviews the pushed fixes.
>
> **Fall back to sequential** when fewer than 3 PRs need fixes or when PRs touch overlapping files.

---

## Pass 3: Fix Failing CI

**Parallel by default** — CI fixes for different PRs are independent. After the orchestrator classifies each failure (3a), spawn up to 3 sub-agents for PRs that need code fixes. PRs needing only a CI re-run (`flaky`, `infrastructure`) are handled inline by the orchestrator — no sub-agent needed. See [sweep-and-parallelization.md](../pr-lifecycle/references/sweep-and-parallelization.md) for details.

For each PR in `$scan.ciFailing` (in parallel batches of 3 for code fixes):

### 3a. Automated CI Triage

Before diving into manual debugging, use existing CI MCP tools to diagnose the failure:

1. **Get logs**: `ci_get_logs(runId: <runId>)` to retrieve full CI output
2. **Search for patterns**: `ci_search_logs(runId: <runId>, pattern: "error|failed|Error")` to find failure points
3. **Classify** the failure based on log output and apply the appropriate fix:

| Classification   | Fix Action                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| `formatting`     | Run `pnpm exec nx format:write` in the worktree, commit and push          |
| `stale_branch`   | Rebase onto main via `worktree_rebase`, then re-run CI                    |
| `codegen`        | Run `make codegen` in the worktree, commit and push                       |
| `type_error`     | Check if error exists on main — if not, rebase (stale); if so, manual fix |
| `test_failure`   | Load `skills/debugging/SKILL.md` for investigation                        |
| `lint`           | Run `pnpm exec nx affected -t lint --fix`, commit and push                |
| `flaky`          | Re-run CI: `ci_rerun(runId: <id>, failedOnly: true)` — no code change     |
| `infrastructure` | Re-run CI — timeout or GitHub Actions infra issue                         |
| `unknown`        | Load `skills/debugging/SKILL.md` for manual investigation                 |

### 3b. Stale Branch Detection

The most common CI failure is **type errors from stale branches** — errors that don't exist on main but appear because the PR branch is missing recent main commits. Signs:

- Type errors referencing identifiers that exist on main but not on the branch
- "Duplicate identifier" errors from overlapping PRs
- Import errors for modules that were renamed/moved on main

**Fix**: Rebase the branch onto main using `worktree_rebase`, then re-run CI. No code changes needed.

### 3c. Remove CI Failure Labels After a Successful Fix

**After every successful CI fix push**, remove the corresponding `ci-failure-*` label. The CI system re-adds labels automatically when CI fails again, so clearing them avoids stale labels misleading the next sweep pass.

```
github_manage_labels(number: <PR#>, remove: ["ci-failure-<type>"])
```

Remove only the label(s) matching the failure type(s) you fixed (e.g., `ci-failure-lint`, `ci-failure-typecheck`, `ci-failure-build`). Remove after push succeeds — not before — so a failed push doesn't prematurely clear the label.

The `github_pr_scan` tool syncs these labels automatically (`applyLabels: true`) on each scan, but it only runs at pass boundaries. Removing labels inline after each fix keeps the scan snapshot accurate during a pass and prevents the orchestrator from re-queuing an already-fixed PR.

### 3d. Manual Debugging Fallback

If automated classification returns `unknown` or the auto-fix doesn't resolve the issue:

1. Enter the worktree (Step 2)
2. **Load `skills/debugging/SKILL.md`** — it contains the full diagnostic playbook
3. Apply the fix based on error category
4. Validate: `make pc`
5. Commit and push
6. **If the push succeeded**, remove the `ci-failure-*` label: `github_manage_labels(number: <PR#>, remove: ["ci-failure-<type>"])` — the CI system will re-add it if the fix didn't hold. **Do not remove the label if the push failed or if you end up in step 7 below.**
7. If the fix attempt fails or is unfixable, comment on the PR with the diagnosed root cause and what was attempted. Only label `requires-human-review` if the failure requires something outside agent reach — otherwise leave it unlabeled for a future sweep. The PR is now **settled**.

### Pending CI

PRs in `$scan.ciPending` are NOT skipped — continue with other work and circle back. If pending CI is the only remaining work, wait ~3 minutes and re-scan.

---

## Label Clean PRs

After each pass, proactively label PRs that have no unresolved review threads with `merge-when-ready`:

```
github_manage_labels(number: <PR#>, add: ["merge-when-ready"])
```

This is safe to do even if CI is still running or pending — failing CI will automatically remove the label. Do not wait for the `copilot-auto-approve` bot; label immediately when reviews are clean.

> **Do not manually add or remove `merge-to-parent`** — that label is managed manually for stacked PRs targeting non-main branches.

---

## Full Sweep: Outer Loop

For full sweeps, run passes 0–3 in a loop until every PR is **settled** — either clean, CI-pending, or labeled `requires-human-review` for a blocker outside agent reach. Fixing one category often creates issues in another (rebase → CI fail, fix → new review), so multiple passes are expected.

**Settled states** — a PR is settled when it reaches any of these terminal states:

| State                     | Meaning                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| **Clean**                 | No conflicts, CI passing, no unresolved threads                       |
| **requires-human-review** | Blocker is outside agent reach (see Critical Rules for valid reasons) |
| **CI pending (final)**    | CI is running after the last fix pass — settled on exit               |

**Algorithm:**

```
settled = {}  # PR numbers that have reached a terminal state

REPEAT (max 10 passes):
  Scan all open PRs (Step 1)
  all_prs = scan.conflicting + scan.reviews + scan.ciFailing + scan.ciPending + scan.clean
  unsettled = [pr for pr in all_prs if pr.number not in settled]

  IF unsettled is empty → EXIT (all settled)

  Pass 0: Request Copilot reviews on PRs that have none
    - github_request_review(number: <PR#>) for each PR without a Copilot review
    - The repo ruleset auto-triggers for user-authored PRs; bot-authored PRs
      need this explicit request (uses user OAuth token via gh auth)
  Pass 1: Rebase unsettled conflicting PRs (SEQUENTIAL — cascade invalidation)
    - On irrecoverable failure → comment blocker, label requires-human-review only if outside agent reach → add to settled
  Pass 2: Fix unsettled PRs with unresolved reviews (PARALLEL — batches of 3 sub-agents)
    - On unfixable review → comment blocker, label requires-human-review only if outside agent reach → add to settled
  Pass 3: Fix unsettled PRs with failing CI (PARALLEL — batches of 3 sub-agents)
    - On unfixable CI failure → comment blocker, label requires-human-review only if outside agent reach → add to settled
  Each sub-agent runs make pc before pushing (NEVER skip — see callout below)
  Collect results from all sub-agents; verify passing PRs have their branches/PRs updated

  Mark clean PRs (no conflicts, CI pass, no threads) → add to settled
  Mark PRs with only pending CI after final pass → add to settled

  IF all PRs in settled → EXIT
```

> **⚠️ CRITICAL: Run `make pc` before pushing.** Every agent that modifies code must validate before pushing. Skipping saves 5 min but each CI failure costs 40-60 min in re-dispatch + CI queue time. Minimum alternative: `make format && make lint-fix && make typecheck`. When dispatching sub-agents, always include "Run `make -C $wt pc` before committing" in the agent prompt.

**Key differences from a simple pass counter:**

- PRs that are settled (clean or labeled) are **skipped** in subsequent passes — no wasted effort
- The loop exits when all PRs are settled, not after a fixed number of passes
- The max 10 pass cap is a safety net, not the expected exit condition
- If the cap is hit with unsettled PRs remaining, comment the blocker on each and report them in the summary — but do **not** auto-label them `requires-human-review` just because the cap was hit (the blocker may still be agent-fixable in a future sweep)

> 📎 **Parallelization details**: see [references/sweep-and-parallelization.md](../pr-workflow/references/sweep-and-parallelization.md)

---

## Final Summary

After completion, print a summary table. Every PR must show a settled status — no PR should be left in an ambiguous state.

```
| PR    | Title                        | Conflicts | Reviews | CI      | Label                  | Settled | Reason                                  |
|-------|------------------------------|-----------|---------|---------|------------------------|---------|-----------------------------------------|
| #101  | feat(scoring): new algo      | Rebased   | Fixed 3 | —       | merge-when-ready       | ✅      | Clean                                   |
| #102  | fix(ui): button color        | —         | —       | Fixed   | merge-when-ready       | ✅      | Clean                                   |
| #103  | feat(db): add index          | Failed    | —       | —       | —                      | ⏳      | Rebase conflict — retryable next sweep  |
| #104  | chore(deps): bump lodash     | —         | Fixed 1 | Fixed   | merge-when-ready       | ✅      | Clean                                   |
| #105  | feat(ws): reconnect logic    | —         | —       | Pending | —                      | ✅      | CI running after final pass             |
| #106  | feat(auth): token refresh    | —         | —       | Failed  | requires-human-review  | ✅      | Needs prod DB credentials (not in env)  |
```

Report:

- Total PRs processed
- PRs settled as **clean** (count)
- PRs settled as **requires-human-review** (count + PR numbers + reasons — must each cite a blocker outside agent reach)
- PRs **unsettled** (count + PR numbers + reasons — agent-fixable issues to retry in next sweep)
- PRs settled as **CI pending** (count — CI running after final pass)
- Issues fixed per category (conflicts rebased, reviews fixed, CI fixed)
- Number of passes required
- Whether the max-pass safety cap was hit

---

# Cloud Agent Mode

Cloud agents (Copilot Coding Agent) cannot commit or push code. This section covers the full cloud-compatible workflow: scan, triage, take all API-only actions, and produce an actionable report for items that need a local agent.

**Available MCP servers:** `legacy-sports-github`, `legacy-sports-ci`

## Cloud Step 1: Scan All Open PRs

Use the `github_pr_dashboard` MCP tool to get a full snapshot of all open PRs in a single call. It returns mergeable status, CI status, unresolved review threads, labels, and review decision for each PR.

```
github_pr_dashboard(state: "open", limit: 100)
```

The response includes a `summary` object with counts (`total`, `conflicting`, `ciFailing`, `ciPending`, `ciPassing`, `withUnresolvedThreads`, `drafts`, `approved`) and a `prs` array with per-PR details.

For detailed inspection of specific PRs, use `github_pr_batch_status` with an array of PR numbers.

> For a **scan-only** request, stop here and report the results.

## Cloud Step 2: Label Clean PRs

Proactively add `merge-when-ready` to any PR with no unresolved review threads:

```
github_manage_labels(number: <PR#>, add: ["merge-when-ready"])
```

This is safe even if CI is pending — failing CI will automatically remove the label. Do not wait for the `copilot-auto-approve` bot.

## Cloud Step 3: Re-run Flaky / Failed CI

For each PR where `ciStatus` is `fail`, inspect the failed checks to determine if the failure looks transient (flaky test, timeout, infrastructure error) vs. a real code issue.

### 3a. Diagnose the failure

Use the CI MCP tools to read logs:

```
ci_list_runs(branch: "<headRefName>", status: "failure", limit: 1)
ci_get_logs(runId: <runId>, failedOnly: true)
ci_search_logs(runId: <runId>, pattern: "error|FAIL|Error:", context: 5)
```

### 3b. Decide: re-run or escalate

| Log Evidence                                     | Action                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Flaky test (different test fails each run)       | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`                     |
| Timeout / infrastructure error                   | Re-run: `ci_rerun(runId: <id>, failedOnly: true)`                     |
| Consistent lint/type/build/test error            | Comment diagnosed root cause on PR — requires code fix by local agent |
| Formatting failure (`nx format:write` would fix) | Comment diagnosed root cause on PR — requires code fix by local agent |

```
ci_rerun(runId: <runId>, failedOnly: true)
```

After re-running, the PR moves to `ciPending`. Track these for the final report.

## Cloud Step 4: Request Copilot Reviews

Find PRs without a Copilot review and request one. This is **required** for bot-authored PRs (e.g. `legacy-sports-code-bot`) — the repository ruleset only auto-triggers Copilot review for user-authored PRs. The `requestReviewers` REST API silently drops Copilot when called with GitHub App installation tokens (`ghs_*`); only user OAuth tokens work.

```
github_request_review(number: <PR#>, copilot: true)
```

> **Note**: The MCP tool automatically uses a user OAuth token (via `gh auth token`) for Copilot requests, bypassing the default app token. If no user token is available, it will report an error instead of silently failing.

## Cloud Step 5: Resolve Process / Meta Review Threads

Some review threads suggest no code change — they are process comments, "nice to have" suggestions, or scope observations (pattern #10 in the common Copilot review patterns). These can be resolved directly without code changes.

For each PR with unresolved threads, fetch the thread details:

```
github_get_review_threads(number: <PR#>, unresolvedOnly: true)
```

For each thread, read the comment body. If the thread is a **process/meta comment** that does not require a code change (e.g., "Consider extracting this into a utility in a future PR", "Nice improvement", suggestions about documentation outside the PR scope), resolve it:

```
github_resolve_thread(threadId: "<threadId>")
```

**Do NOT resolve threads that request actual code changes** — those require a local agent. If a PR has unresolved threads that all require code changes, comment on the PR listing the unresolved threads. The PR is now **settled** (needs local agent — do not label `requires-human-review` since a local agent can fix code).

## Cloud Step 6: Final Report

After completing all API-only actions, produce a summary report. This is the primary deliverable of a cloud sweep.

### Summary Table

```
| PR    | Title                        | Mergeable   | CI        | Threads | Label                  | Cloud Action         | Settled | Reason                        |
|-------|------------------------------|-------------|-----------|---------|------------------------|----------------------|---------|-------------------------------|
| #101  | feat(scoring): new algo      | MERGEABLE   | pass      | 0       | merge-when-ready       | Verified clean       | ✅      | Clean                         |
| #102  | fix(ui): button color        | CONFLICTING | —         | 0       | —                      | Diagnosed            | ⏳      | Needs local rebase            |
| #103  | feat(db): add index          | MERGEABLE   | fail      | 2       | —                      | Re-ran CI            | ⏳      | CI re-running                 |
| #104  | chore(deps): bump lodash     | MERGEABLE   | pass      | 1       | —                      | Resolved 1 thread    | ✅      | Clean                         |
| #105  | feat(ws): reconnect logic    | MERGEABLE   | fail      | 0       | —                      | Diagnosed            | ⏳      | Type error needs local fix    |
| #106  | fix(auth): token refresh     | MERGEABLE   | pass      | 3       | requires-human-review  | Resolved 1 meta      | ✅      | Needs prod DB creds (no env)  |
```

### Report Sections

1. **Actions Taken** — list every API action performed:
   - PRs labeled `merge-when-ready` (count + PR numbers)
   - PRs labeled `requires-human-review` (count + PR numbers + reasons — must each cite a blocker outside agent reach)
   - CI runs re-triggered (count + PR numbers + run IDs)
   - Review threads resolved (count + PR numbers)
   - Copilot reviews requested (count + PR numbers)

2. **Needs local agent** — PRs that need code changes a cloud agent cannot make (blocker commented on each):
   - PRs with merge conflicts (need local rebase)
   - PRs with CI failures requiring code fixes (include the diagnosed root cause)
   - PRs with unresolved review threads requiring code changes (include thread summaries)

3. **Needs human** — PRs labeled `requires-human-review` (blockers outside any agent's reach):
   - Missing credentials, product/design decisions, external dependencies

4. **Pending** — items where status is not yet final:
   - PRs with CI still running or re-running
   - PRs where Copilot review was just requested (no results yet)

All PRs should appear in exactly one settled category. No PR should be left unaccounted for.

## Cloud Full Sweep Algorithm

For a full cloud sweep, run steps 1–8 in order. Unlike the local sweep, there is no outer loop because the cloud agent cannot fix code issues that cascade. The cloud agent settles every PR by confirming it is clean, commenting the blocker for issues a local agent can fix, or labeling `requires-human-review` only for blockers outside any agent's reach.

1. Scan all open PRs (Cloud Step 1)
2. Re-run flaky CI (Cloud Step 3) — do this early so CI has time to complete
3. Request Copilot reviews on unreviewed PRs (Cloud Step 4) — triggers auto-approve for clean PRs
4. Resolve process/meta review threads (Cloud Step 5)
5. Comment on PRs with issues the cloud agent cannot fix — explain the blocker on each. Only label `requires-human-review` if the blocker is outside any agent's reach (not just "needs code changes")
6. Wait ~3 minutes if any CI re-runs were triggered, then re-scan
7. Verify clean PRs are labeled (Cloud Step 2)
8. Produce final report (Cloud Step 6) — every PR must appear in a settled category

---

## Troubleshooting

| Problem                                      | Fix                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Rebase aborts repeatedly on same commit      | `git rebase --skip` if commit already applied; load `skills/rebase/SKILL.md` |
| Copilot keeps re-reviewing with same comment | After 2 cycles on the same thread, resolve it and move on                    |
| CI failure is flaky (passes on re-run)       | Re-trigger: `ci_rerun(runId: <id>, failedOnly: true)` — do not change code   |
| Too many PRs to process in one session       | Prioritize: conflicts → CI → reviews                                         |
| `make pc` fails after rebase stabilization   | Load `skills/rebase/SKILL.md` for post-rebase steps                          |
