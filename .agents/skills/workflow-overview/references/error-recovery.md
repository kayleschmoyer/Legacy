# Error Recovery Playbook

Quick-reference decision trees for the most common failure scenarios agents encounter during the workflow. When something goes wrong, find the matching scenario below before retrying blindly.

## General Principle

- **Reversible action failed?** Diagnose the cause, fix it, retry.
- **Irreversible action uncertain?** Stop and ask the user.
- **Multiple things broken?** Fix the root cause first (usually the earliest failure in the chain).

---

## Scenario 1: MCP Server Unavailable Mid-Session

**Symptom**: MCP tool call returns a connection error or timeout after previously working.

**Decision tree**:

1. Retry the same call once after ~5 seconds — transient network blips resolve themselves.
2. If still failing, check whether other MCP tools on the same server work (e.g., if `worktree_push` fails, try `worktree_status`).
   - If the whole server is down: fall back to shell equivalents (see `mcp-first/SKILL.md` substitution table). Treat this as a degraded mode, not normal — note the failure for the MCP gap audit.
   - If only one tool fails: the tool may have a bug. Try the shell equivalent for that specific operation only.
3. If the `legacy-sports-github` or `legacy-sports-jira` server is down, do NOT silently fall back — these require auth. Stop and tell the user.

## Scenario 2: `make pc` Fails

**Symptom**: One or more validation steps fail during `make pc` / `make_run(target: "pc")`.

**Decision tree**:

1. Read the error output — `make_run` returns structured results showing which step failed.
2. Common fixes by step:
   - **Typecheck**: read the error file/line, fix the type issue, re-run `make_run(target: "typecheck")` before retrying full `make pc`.
   - **Lint**: run `make_run(target: "lint-fix")` — most issues auto-fix. Remaining issues need manual fixes.
   - **Format**: run `make_run(target: "format")` — pure auto-fix. If `make pc` auto-committed formatter changes (`autoFormatterCommit: true`), amend the commit message.
   - **Test**: run the failing test in isolation with `--verbose` to get the full error. Fix the test or the code, not the assertion (unless the assertion is wrong).
   - **Build**: usually a downstream symptom of type/lint errors. Fix those first.
3. After fixing, run `make pc` again from scratch — partial fixes can mask other issues.

## Scenario 3: Git Merge Conflicts During Rebase

**Symptom**: `worktree_rebase` or `twig rebase` reports conflicts.

**Decision tree**:

1. Read the conflict markers in each file (`Grep` for `<<<<<<<`).
2. If the conflicts are in generated files (`*.generated.ts`, `schema.graphql`): accept the incoming (main) version and re-run `make codegen`.
3. If the conflicts are in code you wrote: manually resolve by reading both sides, keeping the intent of your changes while incorporating main's updates.
4. If the conflicts are in code you didn't write and you can't determine the correct resolution: stop and ask the user.
5. After resolving all conflicts: `worktree_stabilize` (runs install + codegen + format), then `make pc` before pushing.

## Scenario 4: PR Creation Fails

**Symptom**: `github_create_pr` returns an error.

**Decision tree**:

1. **"A pull request already exists"**: a PR for this branch already exists. Use `github_view_pr` to find it and continue from there.
2. **Auth error (401/403)**: run `github_auth_status()`. If `configured: false`, stop and tell the user.
3. **"No commits between base and head"**: your branch has no changes relative to `main`. Check that you committed and pushed your work.
4. **Network error**: retry once. If persistent, fall back to `gh pr create` CLI.

## Scenario 5: CI Fails After Push

**Symptom**: CI fails after push (`checks_failed` event).

**Decision tree**:

1. Get the run ID: `ci_list_runs({ branch: "<headRefName>", limit: 1 })`.
2. Get the failure details: `ci_get_logs({ runId, errorSummary: true })`.
3. Common failure patterns:
   - **Same error as local `make pc` would catch**: you pushed before validating. Fix locally, push again.
   - **E2E test failure**: check if it's flaky by looking at other recent runs first (`ci_list_runs` for the branch or relevant PRs, then inspect each run with `ci_get_logs` / `ci_search_logs` for the test name within that run/job). If it has failed intermittently across recent runs, `ci_rerun({ runId, failedOnly: true })`. If persistent after 2 reruns, investigate the test.
   - **Schema drift / migration check**: run `make codegen` or `db_migrate`, push the results.
   - **Branch behind main**: rebase with `worktree_rebase`, stabilize, `make pc`, push.
4. After pushing fixes, continue handling PR events until CI passes.

## Scenario 6: Copilot Review Loops

**Symptom**: Copilot keeps posting new comments after you fix the previous round.

**Decision tree**:

1. Cap at 2 fix rounds (this is a hard rule — see `pr-lifecycle/SKILL.md`).
   - **Round 1**: fix security, bugs, and type safety issues.
   - **Round 2**: fix remaining actionable comments.
2. After round 2, resolve any remaining threads as "acknowledged" via `github_resolve_threads`.
3. Re-request review. If `bot-review` still fails, the merge queue's thread check may be seeing outdated threads. Push a no-op commit (add a comment or whitespace) to re-trigger the Copilot auto-approve workflow.

## Scenario 7: Jira API Calls Fail

**Symptom**: `jira_*` MCP tools return errors despite `jira_auth_status` showing `configured: true`.

**Decision tree**:

1. If the error is `fetch failed` — this is the cloud egress proxy block (see `cloud-agent-mode/SKILL.md` Quirk 1). Switch to the Atlassian plugin (`mcp__claude_ai_Atlassian__*`) with `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"`.
2. If the error is `transitionJiraIssue` validation — this is the cold-start quirk (Quirk 2). Retry after ~30 seconds of other activity.
3. If the error is a 404 — the ticket key may be wrong. Verify with `jira_view`.
4. If auth is genuinely broken — stop and tell the user.

## Scenario 8: Partial Workflow Failure

**Symptom**: Work completed part-way through the workflow (e.g., code committed but PR not created, or PR created but Jira not transitioned).

**Decision tree**:

1. Determine what state you're in:
   - **Code committed, not pushed**: `worktree_push({ setUpstream: true })`, then continue from step 12 (Ship).
   - **Pushed, no PR**: `github_create_pr({ title: "<pr title>", body: "<pr body>", draft: true })`, then continue from step 12a.
   - **PR exists, not marked ready**: `github_manage_labels({ prs: [<PR#>], add: ["agent-in-progress"] })`, then `github_mark_pr_ready({ number: <PR#> })`, then continue.
   - **PR ready, Jira not transitioned**: `jira_transition({ key: "LS-####", status: "In Review" })`, then continue to step 13 (Watch).
   - **PR merged, no gap audit**: run the gap audit (step 14), then complete tracking tasks (step 15).
2. The workflow is designed to be resumable from any step — find where you stopped and pick up from there.

## Scenario 9: GitHub Rate Limiting

**Symptom**: GitHub API calls return 403 with `X-RateLimit-Remaining: 0`.

**Decision tree**:

1. Check the `X-RateLimit-Reset` header for when the limit resets (Unix timestamp).
2. If reset is within 5 minutes: wait, then retry.
3. If reset is further out: tell the user. Do not retry in a loop.
4. Rate limits apply per-token — if using a GitHub App installation token, the limits are typically 5000/hour (sufficient for normal workflows).

## Scenario 10: Flaky Test Determination

**Symptom**: A test fails in CI but passes locally, or fails intermittently.

**Decision tree**:

1. Re-run the failing job once: `ci_rerun({ runId, failedOnly: true })`.
2. If it passes on re-run: it was flaky. Note the test name — if this is a known flaky test, move on.
3. If it fails again with the same error: it's a real failure. Investigate.
4. If it fails again with a different error: likely infrastructure flake. Re-run one more time (max 2 re-runs total).
5. After 2 failed re-runs: investigate the root cause. Read the test code, check for timing dependencies (`waitForTimeout` anti-pattern), network dependencies, or state leakage between tests.

## When to Ask the User

Use this heuristic when the scenarios above don't cover your situation:

- **Reversible + low risk**: proceed without asking (edit files, run tests, create draft PRs).
- **Reversible + high risk**: inform the user what you're about to do, then proceed unless they object (rebase, force-push feature branches).
- **Irreversible or product decision**: always ask first (delete branches, close PRs/tickets, push to shared branches, make architectural choices not specified in the ticket).
