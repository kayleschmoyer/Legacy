---
name: fix-pr
description: 'Fix all outstanding issues on a single PR: rebase conflicts, fix review comments, resolve threads, debug CI failures, validate locally before pushing. Use when the user says "fix PR", "fix this PR", "clean up PR #N", or when a specific PR has multiple unresolved issues (conflicts + reviews + CI).'
---

# Skill: Fix PR

Unified single-PR remediation. Takes one PR number and drives it toward mergeable state by fixing every outstanding issue: conflicts, review comments, CI failures. Runs local validation before every push.

## When to Use

- User says "fix PR #N", "clean up this PR", "get PR N ready to merge"
- A specific PR has a combination of conflicts, unresolved reviews, and/or failing CI
- Resuming work on a PR after it went stale (behind main, reviews piled up, CI red)

**Not for**: sweeping all open PRs (use `/sweep-prs`), creating new PRs (use `/create-pr`), or working a ticket from scratch (use `/work-ticket`).

## Prerequisites

1. **GitHub auth**: `github_auth_status()` must return `configured: true`. If not, stop and prompt.
2. **Jira auth** (optional but recommended): `jira_auth_status()` — used to fetch ticket context before applying review fixes.
3. **Worktree**: you must be in a worktree for the PR's branch. If not, use `worktree_attach({ branch: "<branch>" })` or create one. This is also what binds PR event notifications to the session: a session spawned on an auto-generated `claude/<name>` branch (chip or launcher worktree) is **not** connected to the PR. Either check out the PR's head branch and call `worktree_set` (see [drive.md Step 4](./drive.md#step-4-enter-worktree-local-only)), or treat the session as fire-and-forget — fix → push → re-arm `bot:ready-for-review` → report — and never end the turn "waiting for the next event": an unbound session is never woken (branch binding is cached at session start — anthropics/claude-code#18690).
4. **Stamp the session onto the PR**: `bash scripts/link-pr-session.sh <PR#>` — leaves a provenance marker in the body and gives the desktop its best chance to link the session to the PR. See [create-pr.md § Agent-Session Marker](create-pr.md#agent-session-marker-pr--session-linkage--provenance--one-home-ls-8570).

## Workflow

### Step 0: Assess PR State

Gather all signals in parallel:

```
github_view_pr({ number: <PR#> })              # state, title, headRefName, mergeable
github_get_review_threads({ number: <PR#> })  # unresolved threads
github_pr_batch_status({ prs: [<PR#>] })       # mergeable, ciSummary, reviewDecision
```

Build a triage list:

| Signal                                                                             | Action needed        |
| ---------------------------------------------------------------------------------- | -------------------- |
| `mergeable: CONFLICTING`, `CI: Conflicts` label, or "No Merge Conflicts" check red | Rebase (Step 1)      |
| Unresolved review threads > 0                                                      | Fix reviews (Step 2) |
| CI checks failing (other than "No Merge Conflicts")                                | Fix CI (Step 3)      |
| All green                                                                          | Skip to Step 4       |

**Conflict signals**: the `CI: Conflicts` label and the required "No Merge Conflicts" check come from a deterministic `git merge` test (check-conflicts.yml + the base-push sweep) and are the source of truth. `mergeable` is GitHub's lazily-computed hint — it goes `UNKNOWN`/stale every time main advances. Any ONE of the three signals firing means rebase; never treat a red "No Merge Conflicts" check as a CI failure to debug.

**Jira-link marker check (do this during assessment)**: the PR body must carry the structured jira-link marker — the source of truth for ticket linkage (see [create-pr reference](./create-pr.md#jira-link-marker-source-of-truth-for-ticket-linkage)). It is a three-line block, and all three lines are required — an opening comment with no `primary:` line fails Jira Link Check:

```markdown
<!-- jira-link
primary: LS-####
-->
```

If the body from `github_view_pr` lacks it, add it via `github_edit_pr({ number: <PR#>, body: "<!-- jira-link\nprimary: LS-####\n-->\n\n<existing body>" })` with `primary:` set to the PR's ticket key (from title/branch), or `primary: none` for ticket-less bot PRs. Editing the body is the supported correction path — never force-push or rename the branch to fix linkage.

**Order matters**: always rebase first (Step 1), then fix reviews (Step 2), then fix CI (Step 3). Rebasing can resolve outdated review comments and change CI results.

**Single-round batching rule**: before touching code, take a complete snapshot of the PR's current blockers. If unresolved review threads and CI failures coexist, read **all** unresolved threads and collect CI evidence **before** deciding what to edit. Batch all addressable fixes into one remediation pass and one push; only split pushes when the first push is strictly required to surface the next blocker.

### Step 1: Rebase (if conflicting)

> Reference: load [rebase skill](../../worktree-workflow/references/rebase.md) for the full decision framework and conflict resolution patterns.

1. `git fetch origin` in the worktree
2. `worktree_rebase()` — fetches origin and rebases onto parent
3. If conflicts: use the rebase skill's decision framework (auto-generated files -> theirs; manual code -> evaluate)
4. `worktree_rebase_continue()` after resolving each conflict set
5. Post-rebase stabilization: `make install` ; codegen if needed ; validate with the seven `pc-*` chunks in order (`nx_run_pc_chunk`) — never monolithic `make pc`
6. If Step 2 and/or Step 3 still need changes, **do NOT push yet** — batch everything into the later single push.
7. If the PR only needed the rebase, force-push the rebased branch now so GitHub can recompute mergeability before Step 4 verification.

### Step 2: Fix Review Comments (if any unresolved threads)

> Reference: load [fix-reviews reference](./fix-reviews.md) for the full workflow, cloud tool substitutions, and two-round cap.

1. **Fetch ticket context first**: extract `LS-####` from PR title or branch name. If found and Jira is configured, call `jira_view(key: "LS-####")` to get acceptance criteria — use as a guardrail against contradictory suggestions.
2. **Read ALL unresolved threads** before making any changes — collect every `path`, `line`, `body`, and `id`.
3. **Apply all fixes in one pass** — do not commit between individual fixes. If a comment is unclear or contradicts ticket AC, reply explaining the conflict but still queue the thread for resolution.
4. **Validate**: `make pc` (minimum: `make format && make lint-fix && make typecheck`)
5. **Self-review fix code**: re-read every file you changed in full. Check fixes against `./common-review-patterns.md` — fix code often introduces the same anti-patterns that triggered the original review. This prevents another review cycle.
6. **Commit + push once**: single commit covering all review fixes and any already-identified CI/root-cause fixes you intentionally batched into the same round.
7. **Resolve threads immediately after push**: call `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` — include all addressed threads. GitHub does not auto-resolve threads. **Precondition for any GraphQL / `Invoke-RestMethod` / `curl` fallback**: first call `github_resolve_threads` and receive a connection error or explicit tool-not-found response. The MCP tool handles thread-ID batching and worktree-path resolution; shell fallbacks bypass both.
8. **Apply `bot:ready-for-review` label**: `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })` — fires the next Reviewer (W1) cycle. Copilot review triggers automatically; no explicit `github_request_review` call needed.

**Two-round cap**: Round 1 fixes security/bugs/type safety. Round 2 fixes remaining actionable comments. After round 2, resolve remaining threads as "acknowledged" and proceed.

### Step 3: Fix CI Failures (if checks failing)

> Reference: load [debugging skill](../../debugging/SKILL.md) and its [CI failure reference](../../debugging/references/ci-failure.md) for evidence-first methodology and pipeline architecture.

1. **Route `bot-review` correctly before reading logs**: if the failing check is `bot-review`, or otherwise looks review-related by name/context, this is **not** a CI-logs-first problem. First inspect the status/check details — for example via `github_list_commit_statuses({ prNumber: <PR#> })` or by opening the failed check URL — to confirm it is actually reporting unresolved comments, review threads, or `Copilot review blocked`. Once confirmed, re-evaluate unresolved review threads now — whether Step 2 was skipped earlier because none existed yet, or new threads appeared after a prior push — and fold any current review fixes into this remediation round before reading Actions logs for the remaining non-review failures.
2. **Get the PR branch**: `github_view_pr({ number: <PR#> })` and capture `headRefName`.
3. **Resolve the latest CI run**: `ci_list_runs({ branch: "<headRefName>", limit: 1 })` and capture the returned `runId`.
4. **Inspect failure details**: `ci_view_run({ runId })` to identify failing jobs; `github_pr_batch_status({ prs: [<PR#>] })` is fine for high-level check status but does not provide a CI `runId`.
5. **Read logs**: `ci_get_logs({ runId, failedOnly: true })` to pull failing-job logs, or after `ci_view_run({ runId })` identify a failing `jobId` and use `ci_get_logs({ jobId })` — find the actual error, not just the job name.
6. **Fix the code** based on the error evidence. If you already collected unresolved review threads in the current round, batch those fixes into the same working pass rather than pushing twice.
7. **Validate locally**: `make pc` — the whole point is to catch issues before pushing, not after.
8. **Self-review fix code**: re-read changed files in full and check against `./common-review-patterns.md` before pushing.
9. **Commit + push once for the round**.
10. **Wait for CI**: continue to the next workflow step after pushing — Claude Code surfaces CI pass/fail as push notifications, so `github_view_pr` / `ci_view_run` are one-shot lookups (e.g. after a failure event), not poll targets. `Start-Sleep`/`sleep` + repeated reads never deliver earlier signal. See [mcp-first CI Operations](../../mcp-first/references/service-operations.md#ci-operations). **Binding caveat**: those notifications only reach a session bound to the PR branch (Prerequisite 3). If this session started on a different branch and never completed the checkout + `worktree_set` binding, do not wait — re-arm `bot:ready-for-review`, report the hand-off, and stop; the next `/sweep-prs` pass (or the PR's author session) owns the next event.

### Step 4: Final Verification

After all fixes are applied and pushed:

1. Re-check PR status: `github_pr_batch_status({ prs: [<PR#>] })`
2. Confirm: `mergeable != CONFLICTING`, `CI: Conflicts` label gone (it clears automatically once the re-run check passes — never remove it yourself), no unresolved threads, CI green
3. If new issues appeared (Copilot re-review found new problems, CI regressed), loop back to the relevant step — but cap total iterations at 3.
4. Confirm `bot:ready-for-review` is on the PR (`github_view_pr`) and add it **only if missing** (`github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })`) — the push itself fires a fresh Reviewer cycle on the new HEAD, and a rebase-only fix for a conflict never needs the label re-applied ([ruling](ci-event-response.md#when-to-re-apply-botready-for-review)). The Reviewer Bot will add `merge-when-ready` itself on APPROVED — **do not apply it manually** (see [Label Ownership](label-ownership.md#label-ownership)).

## Iteration Cap

| Scope             | Cap | After cap                                                      |
| ----------------- | --- | -------------------------------------------------------------- |
| Review fix rounds | 2   | Resolve remaining as "acknowledged — out of scope for this PR" |
| Full fix loop     | 3   | Report remaining blockers to user, do not loop further         |

## Gotchas

- **Rebase before reviews**: outdated review threads may auto-resolve after rebase — always rebase first to avoid fixing stale comments.
- **`mergeable: UNKNOWN`** does not mean blocked — GitHub may still be computing. Call `github_view_pr` and check `state` + `mergedAt` to confirm actual status.
- **Check Runs vs Commit Statuses**: `github_retrigger_check` only works on Check Runs. `bot-review` uses the Statuses API — push a new commit or dispatch the workflow to clear it. See [pr-lifecycle skill](../SKILL.md) rule 8.
- **Route `bot-review` to reviews, not CI debugging** — if the failure text is about unresolved comments or blocked Copilot review, fetch unresolved threads first instead of digging through Actions logs.
- **Always validate before pushing** — `make pc` locally; in cloud/timeout-prone sessions the seven `pc-*` chunks per [cloud-agent-mode](../../cloud-agent-mode/SKILL.md) (never monolithic `make pc`). Every push that fails CI costs 40-60 min of pipeline time.
- **Batch review fixes** — push once per round, not once per comment. Each push triggers Copilot re-review.

## Related Skills

- [rebase](../../worktree-workflow/references/rebase.md) — conflict resolution decision tree and post-rebase stabilization
- [pr-lifecycle](../SKILL.md) — PR creation, self-review, thread resolution workflow
- [fix-reviews reference](./fix-reviews.md) — detailed review fixing, cloud workflow, two-round cap
- [debugging](../../debugging/SKILL.md) — CI failure debugging, evidence-first methodology
- [debugging/ci-failure](../../debugging/references/ci-failure.md) — CI pipeline architecture and failure patterns
- [sweep](./sweep.md) — sweep orchestrator (multi-PR, not single-PR)
