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
5. After resolving all conflicts, stage the resolved files with `worktree_run({ command: "git add <file>" })` then call `worktree_rebase_continue()` to continue the rebase. **Do NOT use `GIT_EDITOR=true git -C ... rebase --continue`** — `worktree_rebase_continue` suppresses the editor prompt internally and auto-resolves the worktree path.
6. After the rebase completes: `worktree_stabilize` (runs install + codegen + format), then `make pc` before pushing.

## Scenario 4: PR Creation Fails

**Symptom**: `github_open_pr` returns an error.

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
   - **Same error as local `make pc` would catch**: validation hadn't run yet (normal while the PR is still draft — the [spine gate](ticket-to-merge-spine.md#critical-gates-preconditions) is `make pc` before **mark-ready**, not before push) or was skipped. Fix locally, re-run the failing chunk, push again.
   - **E2E test failure**: check if it's flaky by looking at other recent runs first (`ci_list_runs` for the branch or relevant PRs, then inspect each run with `ci_get_logs` / `ci_search_logs` for the test name within that run/job). If it has failed intermittently across recent runs, `ci_rerun({ runId, failedOnly: true })`. If persistent after 2 reruns, investigate the test.
   - **Schema drift / migration check**: run `make codegen` or `pnpm --prefix lib/db-client run db:up`, push the results.
   - **Branch behind main**: rebase with `worktree_rebase`, stabilize, `make pc`, push.
4. After pushing fixes, continue handling PR events until CI passes.

## Scenario 6: Copilot Review Loops

**Symptom**: Copilot keeps posting new comments after you fix the previous round.

**Decision tree**:

1. Cap at 2 fix rounds — the hard cap is **2** everywhere (see `pr-lifecycle/SKILL.md`; escalate to the user after round 2).
   - **Round 1**: fix security, bugs, and type safety issues.
   - **Round 2**: fix remaining actionable comments.
2. After round 2, resolve any remaining threads as "acknowledged" via `github_resolve_threads`.
3. Re-request review. If `bot-review` still fails, the thread recheck may be seeing outdated threads — push a new commit to refresh the `bot-review` status (see `pr-lifecycle/SKILL.md` for the current recheck mechanics).

## Scenario 7: Jira API Calls Fail

**Symptom**: `jira_*` MCP tools return errors despite `jira_auth_status` showing `configured: true`.

**Decision tree**:

1. If the error is `fetch failed` — this is the cloud egress proxy block (see `cloud-agent-mode/SKILL.md` Quirk 1). Switch to the Atlassian plugin (`mcp__claude_ai_Atlassian__*`) with `cloudId: "fb294606-6c8f-4b52-9a41-11fe45b77528"`.
2. If the error is `transitionJiraIssue` validation — this is the cold-start quirk (Quirk 2). Retry after ~30 seconds of other activity.
3. If the error is a 404 — the ticket key may be wrong. Verify with `jira_view`.
4. If auth is genuinely broken — stop and tell the user.

## Scenario 8: Partial Workflow Failure

**Symptom**: Work completed part-way through the workflow (e.g., code committed but PR not created, or PR created but Jira not transitioned).

**Decision tree** — step numbers are the [ticket-to-merge spine](ticket-to-merge-spine.md#the-sequence)'s canonical Steps 0–16 (the ordering home; do not infer order from this table):

1. Determine what state you're in and resume at the matching spine step:
   - **Code committed, not pushed**: `worktree_push({ setUpstream: true })`, then resume at spine Step 9 (open the **draft** PR — this comes _before_ validation).
   - **Pushed, no PR**: `github_open_pr({ title: "<pr title>", body: "<pr body>", draft: true })` + `github_manage_labels({ prs: [<PR#>], add: ["agent-in-progress"] })` + continuation checkpoint — spine Step 9 — then resume at Step 10.
   - **Draft PR exists, validation not run**: resume at spine Step 11 (migrations) then Step 12 (validate).
   - **Validation green, PR not marked ready**: complete self-review (spine Step 13) if not done, then `github_mark_pr_ready({ number: <PR#> })` — spine Step 14.
   - **PR ready, Jira not transitioned**: `jira_transition({ key: "LS-####", status: "In Review" })` (tail of spine Step 14), then resume at Step 15 (watch to merge).
   - **PR merged, no gap audit**: resume at spine Step 16 (gap audit + complete tracking tasks).
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

## Scenario 11: Wrong Commit Author (Cloud Sessions)

**Symptom**: a cloud-session stop hook (or self-review) flags a commit's author as not matching the expected bot identity (e.g. not `noreply@anthropic.com`), or you notice a commit was authored under the wrong identity after a rebase/amend.

**Decision tree**:

1. Fix it in place with one call: `worktree_commit({ amend: true, resetAuthor: true })` — this sets `user.email`/`user.name` and runs `--reset-author` on the tip commit. Do **not** hand-roll `git config` + `git commit --amend --reset-author` via Bash, and do **not** create a separate local branch to stage the fix — amend the branch you're already on.
2. Push it with `worktree_push()` — it already bakes in `--force-with-lease` and refuses only `main`. Pushing a corrected commit on your **own** unmerged draft-PR branch is the same risk tier as any other feature-branch force-push (see [When to Ask the User](#when-to-ask-the-user)): **inform, then proceed** — note it in the PR/checkpoint comment, do not stop and wait for explicit sign-off.
3. If the branch has also diverged from `main` (conflicts), resolve those first per Scenario 3, then do the author fix as the last step before the final push so you only force-push once.

## Scenario 12: Auto-Mode Classifier Denies a Routine Same-Session Action (LS-8407, LS-8411, LS-9307)

**Symptom**: a harness-level tool call (e.g. `github_manage_labels` adding `agent-in-progress` to a PR) is denied with `Permission for this action was denied by the Claude Code auto mode classifier`, and the stated reason is factually wrong for this session — e.g. it claims the agent didn't create an item it created moments earlier in the same run, or it cites an unrelated prior denial (a blocked `git reset`/`checkout`) as grounds for blocking a completely unrelated read-only call. A third observed shape (LS-9307): `worktree_reset({ sha, mode: "hard" })` denied outright even though the target SHA is a verified ancestor of HEAD — i.e. the MCP tool's own ancestor-only/non-main safety invariant already held before the classifier was consulted.

**This is not a repo bug.** The auto-mode classifier is part of the Claude Code harness itself — no file in this repository implements or configures it, and `.claude/settings.json#permissions` (tool allow/deny lists) does not influence its reasoning. Nothing here can be edited to fix the classifier's logic — including allow-listing `worktree_reset` calls that already pass the tool's own preconditions; there is no hook point in this repo to express that rule to the classifier.

**Decision tree**:

1. Retry the exact same call once. Both originally observed instances (LS-8407: label add on a self-created PR; LS-8411: a read-only `github_get_check_runs` call) succeeded on retry, with the second attempt's own denial/allow reason citing a "Stage 2 classifier error — blocking based on stage 1 assessment (usually transient)". Treat the first denial as likely transient before escalating.
2. If the retry also denies the call with the same or a similarly nonsensical reason: do not silently skip the step (e.g. do not drop the `agent-in-progress` label and move on) and do not spend a turn re-litigating the classifier's stated reasoning with yourself. Surface it to the user in one line — the tool call, the denial reason, and that this is a known harness-level false positive (LS-8407/LS-8411/LS-9307) — then proceed with the rest of the workflow; the label/action can be applied manually or on a later pass.
   - For a `worktree_reset` denial specifically (LS-9307), the manual fallback is: `worktree_show_file` to read the target SHA's clean content, hand-write it back into the working tree, then `worktree_commit({ amend: true })`. See the rebase troubleshooting table's ["Lost commits" row](../../worktree-workflow/references/rebase.md) for the full recovery flow this substitutes for.
3. File or reference an MCP-gap ticket only if one doesn't already exist for this subsystem (check `jira_get_bucket_epic({ bucket: 'mcp-gaps' })` descendants) — LS-8407, LS-8411, and LS-9307 already cover the three known symptoms. Report new symptoms via product feedback, since the fix is outside this repo's reach.

## Scenario 13: Session Reports a "Tool-Call Budget" Blocking Further Calls

**Symptom**: an agent's status update says something like "the tool-call budget is now blocking even read-only checks" and that it is stopping per "the budget governor's instruction," despite work being otherwise complete and checkpointed (e.g. PR green, status comment posted).

**Root cause is not confirmed.** No file in this repository implements or names a "budget governor" — it is not a concept defined in AGENTS.md, any skill, or `.claude/settings.json`. Do not assume the mechanism this note describes is exactly what's happening; treat it as the best available read on a harness-level circuit breaker, not a verified spec. If you can capture the raw system-reminder/tool-error text from a session where this fires, update this scenario with the confirmed mechanism instead of the description below.

**Working hypothesis**: sessions that fall into manual re-polling (checking `ci_view_run`/`github_view_pr`/PR notifications in a loop instead of arming `Monitor`/`subscribe_pr_activity`, per [mcp-first "Waiting on CI"](../../mcp-first/SKILL.md#waiting-on-ci-no-polling-no-sleep) and [pr-lifecycle SKILL.md](../../pr-lifecycle/SKILL.md)) burn through a session-wide call budget that a harness-level governor eventually trips. Once tripped, the block is reported as blanket — it does not appear to distinguish read-only checks from mutating calls.

**Decision tree**:

1. **Don't fight it in the same turn.** Retrying the same or a different tool call against a live block is itself another blocked call — there is no tool exposed to this session (or to the affected session) to raise or reset the ceiling.
2. **Try one fresh turn first, cheaply.** Some such governors are scoped to a call-count window rather than a permanent session ban. If you (the user) can send one new message into the affected session asking it to continue, that's worth one attempt before treating the session as done. Do not retry more than once — a second block is a strong signal it's a hard per-session cap, not a window.
3. **If still blocked, treat the session as terminated and hand off durably instead of unlocking it.** This is exactly what the "hand off durably" behavior in AGENTS.md and the [continuation checkpoint](ticket-to-merge-spine.md) are for: if the work is already checkpointed (PR pushed, status comment posted, checkpoint written), a **new session** can resume from that checkpoint with zero loss — there is no need to revive the blocked session.
4. **Prevent it upstream, not at unlock time.** The actual fix is ensuring the PR watch (`Monitor` with an absolute script path, or `subscribe_pr_activity` in CCR) gets armed successfully near the top of the session, per AGENTS.md Tier 2 rule "Never poll CI in-context; arm the PR watch before idling." A session that goes idle between real events should never accumulate enough calls to reach this governor in the first place. If a session reports this symptom, check whether its watch was ever actually armed — not just attempted — before assuming the governor itself is at fault. A `Monitor` call given a relative script path (instead of an absolute one) can die silently with `No such file or directory`, leaving the session to fall back into manual polling without realizing its watch never took hold; see AGENTS.md's `scripts/watch-pr.sh` guidance for the required absolute-path form.
5. File an MCP-gap ticket only once the mechanism above is confirmed from a real transcript — filing against an unverified hypothesis would misdirect the fix.

## When to Ask the User

Use this heuristic when the scenarios above don't cover your situation:

- **Reversible + low risk**: proceed without asking (edit files, run tests, create draft PRs).
- **Reversible + high risk**: inform the user what you're about to do, then proceed unless they object (rebase, force-push feature branches, amending/fixing authorship on commits on your own unmerged draft-PR branch — see Scenario 11).
- **Irreversible or product decision**: always ask first (delete branches, close PRs/tickets, push to shared branches, make architectural choices not specified in the ticket).

**If you do decide a situation is genuinely irreversible-or-product-decision and must wait for the user**: ask once, clearly, with a concrete question and the exact action you're proposing. If you're then woken again by an unrelated event (a GitHub webhook, a CI status change) before the user has answered, do **not** re-explain the situation from scratch or repeat the same paragraph verbatim — that produces a wall of identical "still holding" messages with no new information, which is confusing and wastes the resume cycle. Instead: silently check whether anything relevant changed; if not, reply with a single short line ("No update — still waiting on `<the specific question>`.") or nothing at all if the event was purely mechanical (e.g. a label sync) and not addressed to you. Re-read the situation with fresh eyes each time, too — a "must wait" call made early in a session may turn out to have a fully pre-authorized path once you check (e.g. Scenario 11 above is a common case of an agent freezing on something that was actually already sanctioned).
