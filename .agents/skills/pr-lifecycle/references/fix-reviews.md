---
name: fix-copilot-reviews
description: 'Fix Copilot review comments on open PRs. Load when the user says "fix reviews", "fix comments", or when a PR has unresolved Copilot review threads.'
---

# Skill: Fix Copilot Reviews

You are a **review fixer** — you read Copilot review comments, understand the requested change, apply the fix in code, validate, and resolve the thread. Be methodical: fix **all** comments from the current round in a single pass before pushing.

## Critical: Batch Fixes Within a Round

**Fix ALL unresolved threads before making any commit or push.** Do not push after fixing each individual comment.

Every `worktree_push()` triggers a full Copilot re-review of the accumulated diff. Pushing N commits for N comments creates N re-review cycles — this is the primary driver of cyclical review rounds. The correct rhythm:

1. Fetch all threads
2. Apply all fixes (no commits yet)
3. Validate once
4. Commit + push **once**
5. Resolve all threads

This aims to keep most PRs to ≤ 2 review rounds by avoiding unnecessary re-review cycles, though newly uncovered issues, CI failures, or human-requested changes can still require additional rounds.

## Workflow (single PR)

1. **Activate worktree context (FIRST)**: call `worktree_set({ key: "LS-####" })` (sibling worktrees) or `worktree_set({ key: "<absolute .claude/worktrees/... path>" })` (ephemeral worktrees). Do this before any git operations — it ensures `worktree_diff`, `worktree_commit`, and `worktree_push` target the correct worktree path. Never use raw `git -C <path> diff/commit/push` when a worktree MCP tool is available. If this session did not create the PR, also stamp it for provenance: `bash scripts/link-pr-session.sh <PR#>` ([why](create-pr.md#agent-session-marker-pr--session-linkage--provenance--one-home-ls-8570)).
2. **Fetch threads**: `github_get_review_threads(number: <PR#>)`
3. **Fix ALL threads before modifying files**: read every thread's `path`, `line`, and `body` first, then apply all fixes in one pass. Do not commit or push until all threads are addressed.
   - **Re-ground in ticket scope before applying any fix**: extract the Jira ticket key from the PR title (`LS-\d+` pattern), then call `jira_view(key: "LS-####")` and re-read the ticket's **Acceptance Criteria** and **Out of Scope** sections. Use them as a guardrail when triaging suggestions:
     - Reviewer suggestions that **support** an AC → apply.
     - Reviewer suggestions that **contradict** an AC or would change intended behavior → reply explaining the conflict, do not apply. (Copilot threads, unlike reviewer-bot `JUSTIFY:` replies, do not require bot adjudication — still resolve in step 7.) **If the finding is a false positive** (the existing pattern is intentional, not just out of scope), also add an inline code comment at the flagged line(s) or a note in the nearest relevant doc (a `SKILL.md` or `references/` file) — this prevents the same flag from recurring on future PRs.
     - Reviewer suggestions outside the ticket's scope ("while you're here, also rename foo()" / "consider refactoring this nearby helper") → reply that the change is out of scope for this PR and should be a separate ticket, do not apply. The `Out of Scope` section of the ticket is a hard boundary even when a reviewer asks you to cross it.
   - If a comment is unclear or incorrect, note it for a reply — but do not stop, continue fixing the other threads. To post the reply, use `github_reply_to_review({ threadId: "PRRT_...", body: "explanation" })` (ToolSearch: `"reply review"` or `"github_reply_to_review"`). Do **not** use `gh api` or a scratch script — the MCP tool works for both local and cloud sessions.
4. **Validate**: `make pc` (or at minimum `make typecheck && make lint-fix`)
5. **Self-review fix code (BEFORE push)**: re-read every file you changed in full (not just the lines you edited). Check your fixes against [common-review-patterns.md](common-review-patterns.md) — fix code frequently introduces the same anti-patterns that triggered the original review (e.g., wrong mock paths, `LOGGER.error({ error })` wrapping, missing null checks). A 2-minute scan here prevents another 30–60 min review cycle.
6. **Commit & push once**: one commit covering all fixes from this round, conventional commit message describing the fixes. Use `worktree_commit({ message: "..." })` (MCP, preferred) or `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"` — **never `git commit` without `-m`**, which opens `$EDITOR` and blocks the agent
7. **Finish the round (MANDATORY — prefer the one-shot)**: After pushing, call `github_finish_fix_round({ prNumber: <PR#>, replies: [{ threadId, kind: "FIX", sha: "<pushed-sha>" }, ...] })`. This is the semantic one-shot for the Author Agent Contract end-of-round — it validates every reply BEFORE any side effect (FIX requires `sha`; JUSTIFY/CANNOT-COMPLY require `body`), emits FIX bodies as exactly `FIX: <sha>` (strict bot format), resolves only the FIX threads, and applies `bot:ready-for-review` in one call. Partial reply failures appear in `errors[]` and do not block successful replies (the failed threads are NOT resolved). It replaces the three-tool sequence below — use the legacy path only if the one-shot is unavailable.

   Legacy path — resolve every thread you addressed:
   - Collect all thread `id` values from the threads you fixed in step 3
   - Call `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` for up to 100 thread IDs per call; if you have more than 100 threads to resolve, split the IDs into multiple calls until all addressed threads are resolved
   - GitHub does NOT auto-resolve threads when code changes — you must explicitly resolve them
   - For threads you chose not to fix (disagreed / out of scope), reply with an explanation, then resolve
   - **Never leave addressed threads unresolved** — this blocks the merge queue and triggers re-review
   - **Always invoke `github_resolve_threads` directly — never reach for raw GraphQL mutations or shell commands without first calling this tool and getting a connection error or tool-not-found response. Assuming the tool is unavailable without trying it is not acceptable.**
   - **Check bot-review after resolution**: `github_resolve_threads` with `prNumber` attempts to re-dispatch the Copilot Auto-Approve workflow, but may be silently skipped if the app token lacks `actions: write`. If `bot-review` still shows failure after resolving all threads, re-dispatch manually: `ci_dispatch_workflow({ workflow: "Copilot Auto-Approve", ref: "<branch>", inputs: { pr_number: "<PR#>" } })`. Wait ~20 seconds and verify `bot-review` flips to success before attempting merge.

8. **⛔ Apply `bot:ready-for-review` label — MANDATORY, most commonly missed step**: `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })`. Without this label after a fix-push, no new reviewer cycle starts: `Reviewer (W1)` fires on `opened`, `ready_for_review`, this label, or `synchronize` **only while this label is present** — a push without the label starts nothing. The `Legacy Sports CI Orchestrator` is gated on the `pull_request_review` event the bot emits, so **no orchestrated CI runs** on your fix commit without it. The label is auto-removed by the reviewer workflow once it picks up the run; if you push another fix later, re-apply it. (If the label is already present — e.g., a prior cycle was rate-limited — remove then re-add it to re-trigger.) **Exception (LS-9983):** if `review-bot-degraded` is on _several_ PRs at once, the per-minute quota is saturated repo-wide. Each of those runs already auto-waited the throttle out before failing, so re-applying the label on each PR only deepens the contention — wait for the queue to drain instead. A cycle still waiting on quota is a **pending** `bot-review` ("Queued behind reviewer rate limit … no action needed"), not a failure: leave it alone. **Exception (LS-9812):** if `review-bot-billing` is on the PR, the reviewer is out of LLM credits — re-applying the label burns another run that fails identically. Escalate to the account owner to top up billing instead.
9. New threads from the re-review are a separate round; loop back to step 2 until no unresolved threads remain or the 2-round cap is hit

## Two-Round Cap

Cap fix iterations at **2 rounds**:

- **Round 1**: Fix all Tier 1-2 issues (security, bugs, error handling, type safety)
- **Round 2**: Fix remaining actionable comments
- **After round 2**: Resolve any remaining threads as "acknowledged — out of scope for this PR" and proceed to merge

Do not enter a fix-review loop beyond 2 rounds.

## Batch Processing (all open PRs)

For fixing across multiple PRs:

1. `github_pr_scan()` to find PRs with unresolved reviews (draft PRs are excluded by default — they are still being worked on by their creating agent)
   1b. **Batch-fetch ticket context upfront**: extract the Jira ticket key from each PR title (`LS-\d+` pattern), then call `jira_view(keys: [<all extracted keys>])` (up to 50) to retrieve ACs and Out of Scope for every PR in one round-trip. Store the resulting `tickets` map so step 3's re-grounding uses local data instead of a per-PR `jira_view` call.
2. For each PR: check out branch in worktree, look up ticket context from the map fetched in step 1b (no additional `jira_view` call needed), fix comments, validate, commit, push, **then resolve threads**
3. At batch scale (>10 PRs): skip `make pc` per-PR and rely on CI
4. **Thread resolution is part of the push step, not a separate phase.** Resolve threads for each PR immediately after pushing — do not defer to a later "resolve pass". Collect thread `id` values when reading threads (step 2) and call `github_resolve_threads` right after the push succeeds. This ensures re-triggered Copilot reviews see a clean thread state.

## Cloud Workflow (Claude Code on the web)

On Claude Code on the web, use the **custom `legacy-sports-github` MCP server** for fetching and resolving threads — it returns GraphQL thread node IDs required for resolution. Use the **built-in `mcp__github__*` tools** only for operations where authorship is visible (e.g. replying) to prevent agent comments appearing under the user's personal GitHub username.

> **Custom server startup**: the `legacy-sports-github` MCP server may take a few seconds to initialize in cloud environments. If a call returns a connection error on first attempt, wait ~10 seconds and retry once before concluding the server is unavailable.

### Cloud tool substitutions

| Step            | Custom MCP tool (preferred)                                                                                                                                      | Built-in fallback (only if custom unavailable)                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch threads   | `github_get_review_threads({ number: <PR#> })` ✅ returns GraphQL `id`                                                                                           | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` ⚠️ no thread node IDs — resolve step will fail      |
| Reply to thread | `github_reply_to_review({ threadId: "PRRT_...", body })` ✅ works local + cloud; pass `commentId` + `number` instead of `threadId` if you only have a databaseId | `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })` ✅ bot identity                                   |
| Resolve threads | `github_resolve_threads({ threadIds, prNumber: <PR#> })` ✅ batch                                                                                                | `mcp__github__resolve_review_thread({ threadId })` per thread ⚠️ requires node IDs — only viable if threads were fetched via custom server above |

### Cloud workflow steps

1. **Fetch threads**: `github_get_review_threads({ number: <PR#> })` — the custom server returns GraphQL thread `id` values needed for step 7. If the first call fails with a connection error, wait 10s and retry (server may still be starting). Only fall back to `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` if the custom server is confirmed unavailable — but note: the built-in does **not** return thread node IDs, so step 7 cannot use `mcp__github__resolve_review_thread` without them.
2. **Fix code & validate**: same as local workflow (`make pc`)
3. **Self-review fix code**: same as local workflow step 5 — re-read changed files in full, check fixes against common-review-patterns.md before pushing.
4. **Commit & push**: `worktree_commit({ message: "..." })` + `worktree_push()` (preferred). If using shell: `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"` + `git push` — **never `git commit` without `-m`**
5. **Reply to threads**: Use `github_reply_to_review({ threadId: "PRRT_...", body: "explanation" })` (custom server, preferred — ToolSearch: `"reply review"` or `"github_reply_to_review"`). If the custom server is unavailable, fall back to `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId: <numeric>, body })` (built-in tool, bot identity).
6. **Resolve threads**: `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` — thread IDs from step 2. If step 2 used the built-in fallback and thread IDs are unavailable, make one more attempt with `github_get_review_threads` (server may be up by now) before surfacing the blocker to the user.
7. **Apply `bot:ready-for-review` label (MANDATORY to fire the Code Reviewer Bot + CI)**: `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })`. Same gating as the local workflow — the `Reviewer (W1)` workflow only fires on `opened`/`ready_for_review`/this label, and `Legacy Sports CI Orchestrator` only runs after the bot emits a `pull_request_review`. Pushing fix commits without this label leaves the PR stuck with stale CI labels and no new review. Apply it after every fix-and-push round.
8. **Loop**: after each push/re-review request, rely on Claude Code's native PR activity surfacing and, if needed, re-run `github_get_review_threads` to check for newly created unresolved threads; cap at 2 rounds

> **Why split tools?** Fetching/resolving threads uses the custom server (only source of GraphQL thread node IDs). Replying uses built-in tools (platform auth ensures bot identity, not user's personal token).

## Review Thread Workflow (bot-review failures)

When `bot-review` CI check fails or Copilot posts review comments, use this MCP-first workflow:

> **Classification rule**: `bot-review`, `Copilot review blocked`, and `Copilot review has unresolved comments` are review blockers, not generic CI-debugging tasks. Fetch unresolved review threads first; do not start by reading Actions logs unless another non-review check is also failing.

1. **Get unresolved threads**: `github_get_review_threads({ number: PR# })`
   - Default (no `includeResolved`) returns only unresolved threads — exactly the ones blocking merge.
   - Returns thread-level fields: `id` (PRRT\_ node ID), `isResolved`, `isOutdated`, `isCollapsed`, `path`, `line`, `startLine` — plus a `comments` array with `databaseId`, `author`, `body`, `path`, `line` per comment.
2. **Inspect the returned comments and fix the code** in the flagged files/lines
3. **Reply to threads** (when a comment needs acknowledgment or explanation rather than a code fix):
   - Use `github_reply_to_review` — available for **both local and cloud** sessions via the custom `legacy-sports-github` MCP server.
   - Pass either `threadId` (GraphQL node ID from `github_get_review_threads`) or `commentId` + `number` (REST databaseId + PR number): `github_reply_to_review({ threadId: "PRRT_...", body: "explanation" })`
   - **ToolSearch query**: search `"reply review"`, `"reply to review comment"`, or `"github_reply_to_review"` — not `"reply to PR comment"` (which may not surface it).
   - Do **not** reach for `gh api repos/.../pulls/.../comments` or a Python scratch script — the MCP tool handles both auth paths.
4. **Commit and push** the fix
5. **Resolve threads**: `github_resolve_threads({ threadIds: [<thread-id>, ...], prNumber: PR# })`
   - Thread node IDs come from the `id` field of each thread in `github_get_review_threads` output (PRRT\_... format).
   - **Alternative**: if you only have numeric comment `databaseId` values (e.g. from `mcp__github__*` `get_review_comments`), pass them as `commentDatabaseIds` instead — the tool maps them to thread IDs internally: `github_resolve_threads({ commentDatabaseIds: [<databaseId>, ...], prNumber: PR# })`.
   - **If bot-review still fails after resolution**: `github_resolve_threads` with `prNumber` attempts to re-dispatch the Copilot Auto-Approve workflow, but may be silently skipped if the app token lacks `actions: write`. If `bot-review` still shows failure after thread resolution, re-dispatch manually: `ci_dispatch_workflow({ workflow: "Copilot Auto-Approve", ref: "<branch>", inputs: { pr_number: "<PR#>" } })`. Wait ~20 seconds for the recheck job and verify `bot-review` flips to success before attempting merge.
6. **Apply `bot:ready-for-review` label**: `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })` — this fires the next Reviewer (W1) cycle. Copilot review is triggered automatically by the platform; no explicit `github_request_review` call is needed.
   - **Events arrive — do not poll**: the review event arrives automatically as a push notification. Call `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: PR# })` only if that built-in tool is present in the session's tool list (it is absent from most current sessions — absence is not a monitoring failure). In environments with no event delivery at all (cloud/headless), do **not** fall back to a retry loop — arm a wake per [waiting-and-wakeups](../../mcp-first/references/waiting-and-wakeups.md) and end the turn.

> **`bot-review` still stuck after resolving threads?** Manually re-dispatch the recheck using the `ci_dispatch_workflow` MCP tool — **never** `gh workflow run copilot-auto-approve.yml` via Bash:
>
> ```
> ci_dispatch_workflow(workflow: "copilot-auto-approve.yml", inputs: { pr_number: "<PR#>" })
> ```
>
> In cloud sessions, this may return 403 (app lacks `actions:write`) — see [cloud-agent-mode/references/known-quirks.md](../../cloud-agent-mode/references/known-quirks.md#quirk-4-ci_dispatch_workflow-returns-403-in-cloud--agent_author_app-lacks-actionswrite).

Before the next push, also check whether any other blockers are already known on the PR (conflicts, non-review failing checks). Batch all currently known fixes into one validation + push round whenever possible. Do **not** push a CI-only change while known review threads remain unresolved, or vice versa, unless one blocker must be cleared first to reveal the next.

> **Avoid `gh api graphql` to enumerate review threads** — prefer `github_get_review_threads`, which returns structured data including GraphQL thread node IDs (required for resolution). Use `gh api graphql` only as a last resort when MCP or another documented tool is unavailable or does not return the needed thread IDs.

> **Mapping comment IDs to thread IDs**: `github_resolve_threads` now handles this automatically. If you have a comment's `databaseId` (numeric) but not its thread's PRRT\_ node ID, pass the `databaseId` values via `commentDatabaseIds` with `prNumber` — no raw GraphQL fallback needed.

## Guardrails

- **Never** suppress a lint/type error to satisfy a review comment — fix the root cause
- **Never** resolve a thread without either fixing it or explaining why it's not applicable
- **Never** enter more than 2 fix-review rounds on the same PR
- After resolving all threads and pushing fixes, (re-)apply `bot:ready-for-review` so the Reviewer Bot fires a fresh cycle. The Reviewer Bot adds `merge-when-ready` itself on APPROVED — **never apply it manually** (see [Label Ownership](label-ownership.md#label-ownership))
