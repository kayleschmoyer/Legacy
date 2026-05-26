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

1. **Activate worktree context (FIRST)**: call `worktree_set({ key: "LS-####" })` (sibling worktrees) or `worktree_set({ key: "<absolute .claude/worktrees/... path>" })` (ephemeral worktrees). Do this before any git operations — it ensures `worktree_diff`, `worktree_commit`, and `worktree_push` target the correct worktree path. Never use raw `git -C <path> diff/commit/push` when a worktree MCP tool is available.
2. **Fetch threads**: `github_get_review_threads(number: <PR#>, unresolvedOnly: true)`
3. **Fix ALL threads before modifying files**: read every thread's `path`, `line`, and `body` first, then apply all fixes in one pass. Do not commit or push until all threads are addressed.
   - **Re-ground in ticket scope before applying any fix**: extract the Jira ticket key from the PR title (`LS-\d+` pattern), then call `jira_view(key: "LS-####")` and re-read the ticket's **Acceptance Criteria** and **Out of Scope** sections. Use them as a guardrail when triaging suggestions:
     - Reviewer suggestions that **support** an AC → apply.
     - Reviewer suggestions that **contradict** an AC or would change intended behavior → reply explaining the conflict, do not apply. (Copilot threads, unlike reviewer-bot `JUSTIFY:` replies, do not require bot adjudication — still resolve in step 7.) **If the finding is a false positive** (the existing pattern is intentional, not just out of scope), also add an inline code comment at the flagged line(s) or a note in the nearest relevant doc (a `SKILL.md` or `references/` file) — this prevents the same flag from recurring on future PRs.
     - Reviewer suggestions outside the ticket's scope ("while you're here, also rename foo()" / "consider refactoring this nearby helper") → reply that the change is out of scope for this PR and should be a separate ticket, do not apply. The `Out of Scope` section of the ticket is a hard boundary even when a reviewer asks you to cross it.
   - If a comment is unclear or incorrect, note it for a reply — but do not stop, continue fixing the other threads. To post the reply, use `github_reply_to_review({ threadId: "PRRT_...", body: "explanation" })` (ToolSearch: `"reply review"` or `"github_reply_to_review"`). Do **not** use `gh api` or a scratch script — the MCP tool works for both local and cloud sessions.
4. **Validate**: `make pc` (or at minimum `make typecheck && make lint-fix`)
5. **Self-review fix code (BEFORE push)**: re-read every file you changed in full (not just the lines you edited). Check your fixes against [common-review-patterns.md](common-review-patterns.md) — fix code frequently introduces the same anti-patterns that triggered the original review (e.g., wrong mock paths, `LOGGER.error({ error })` wrapping, missing null checks). A 2-minute scan here prevents another 30–60 min review cycle.
6. **Commit & push once**: one commit covering all fixes from this round, conventional commit message describing the fixes. Use `worktree_commit({ message: "..." })` (MCP, preferred) or `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"` — **never `git commit` without `-m`**, which opens `$EDITOR` and blocks the agent
7. **Resolve threads (MANDATORY)**: After pushing, immediately resolve every thread you addressed:
   - Collect all thread `id` values from the threads you fixed in step 3
   - Call `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` for up to 100 thread IDs per call; if you have more than 100 threads to resolve, split the IDs into multiple calls until all addressed threads are resolved
   - GitHub does NOT auto-resolve threads when code changes — you must explicitly resolve them
   - For threads you chose not to fix (disagreed / out of scope), reply with an explanation, then resolve
   - **Never leave addressed threads unresolved** — this blocks the merge queue and triggers re-review
   - **Always invoke `github_resolve_threads` directly — never reach for raw GraphQL mutations or shell commands without first calling this tool and getting a connection error or tool-not-found response. Assuming the tool is unavailable without trying it is not acceptable.**
   - **Check bot-review after resolution**: `github_resolve_threads` with `prNumber` attempts to re-dispatch the Copilot Auto-Approve workflow, but may be silently skipped if the app token lacks `actions: write`. If `bot-review` still shows failure after resolving all threads, re-dispatch manually: `ci_dispatch_workflow({ workflow: "Copilot Auto-Approve", ref: "<branch>", inputs: { pr_number: "<PR#>" } })`. Wait ~20 seconds and verify `bot-review` flips to success before attempting merge.
8. **⛔ Apply `bot:ready-for-review` label — MANDATORY, most commonly missed step**: `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })`. Without this label after a fix-push, no new reviewer cycle starts: `Reviewer (W1)` fires on `opened`, `ready_for_review`, this label, or `synchronize` **only while this label is present** — a push without the label starts nothing. The `Legacy Sports CI Orchestrator` is gated on the `pull_request_review` event the bot emits, so **no orchestrated CI runs** on your fix commit without it. The label is auto-removed by the reviewer workflow once it picks up the run; if you push another fix later, re-apply it. (If the label is already present — e.g., a prior cycle was rate-limited — remove then re-add it to re-trigger.)
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
2. For each PR: check out branch in worktree, fix comments, validate, commit, push, **then resolve threads**
3. At batch scale (>10 PRs): skip `make pc` per-PR and rely on CI
4. **Thread resolution is part of the push step, not a separate phase.** Resolve threads for each PR immediately after pushing — do not defer to a later "resolve pass". Collect thread `id` values when reading threads (step 2) and call `github_resolve_threads` right after the push succeeds. This ensures re-triggered Copilot reviews see a clean thread state.

## Cloud Workflow (Claude Code on the web)

On Claude Code on the web, use the **custom `legacy-sports-github` MCP server** for fetching and resolving threads — it returns GraphQL thread node IDs required for resolution. Use the **built-in `mcp__github__*` tools** only for operations where authorship is visible (replying, requesting Copilot review) to prevent agent comments appearing under the user's personal GitHub username.

> **Custom server startup**: the `legacy-sports-github` MCP server may take a few seconds to initialize in cloud environments. If a call returns a connection error on first attempt, wait ~10 seconds and retry once before concluding the server is unavailable.

### Cloud tool substitutions

| Step               | Custom MCP tool (preferred)                                                                                                                                      | Built-in fallback (only if custom unavailable)                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch threads      | `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })` ✅ returns GraphQL `id`                                                                     | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` ⚠️ no thread node IDs — resolve step will fail      |
| Reply to thread    | `github_reply_to_review({ threadId: "PRRT_...", body })` ✅ works local + cloud; pass `commentId` + `number` instead of `threadId` if you only have a databaseId | `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })` ✅ bot identity                                   |
| Resolve threads    | `github_resolve_threads({ threadIds, prNumber: <PR#> })` ✅ batch                                                                                                | `mcp__github__resolve_review_thread({ threadId })` per thread ⚠️ requires node IDs — only viable if threads were fetched via custom server above |
| Re-request Copilot | ⚠️ app tokens silently fail for Copilot                                                                                                                          | `mcp__github__request_copilot_review({ owner, repo, pullNumber })` ✅ platform auth                                                              |

### Cloud workflow steps

1. **Fetch threads**: `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })` — the custom server returns GraphQL thread `id` values needed for step 7. If the first call fails with a connection error, wait 10s and retry (server may still be starting). Only fall back to `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` if the custom server is confirmed unavailable — but note: the built-in does **not** return thread node IDs, so step 7 cannot use `mcp__github__resolve_review_thread` without them.
2. **Fix code & validate**: same as local workflow (`make pc`)
3. **Self-review fix code**: same as local workflow step 5 — re-read changed files in full, check fixes against common-review-patterns.md before pushing.
4. **Commit & push**: `worktree_commit({ message: "..." })` + `worktree_push()` (preferred). If using shell: `git commit -m "$(cat <<'EOF'\n...\nEOF\n)"` + `git push` — **never `git commit` without `-m`**
5. **Reply to threads**: Use `github_reply_to_review({ threadId: "PRRT_...", body: "explanation" })` (custom server, preferred — ToolSearch: `"reply review"` or `"github_reply_to_review"`). If the custom server is unavailable, fall back to `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId: <numeric>, body })` (built-in tool, bot identity).
6. **Resolve threads**: `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` — thread IDs from step 2. If step 2 used the built-in fallback and thread IDs are unavailable, make one more attempt with `github_get_review_threads` (server may be up by now) before surfacing the blocker to the user.
7. **Re-request Copilot review**: `mcp__github__request_copilot_review({ owner, repo, pullNumber })` — platform handles auth natively; the custom server's app token is silently dropped by GitHub for Copilot requests
8. **Apply `bot:ready-for-review` label (MANDATORY to fire the Code Reviewer Bot + CI)**: `github_manage_labels({ prs: [<PR#>], add: ["bot:ready-for-review"] })`. Same gating as the local workflow — the `Reviewer (W1)` workflow only fires on `opened`/`ready_for_review`/this label, and `Legacy Sports CI Orchestrator` only runs after the bot emits a `pull_request_review`. Pushing fix commits without this label leaves the PR stuck with stale CI labels and no new review. Apply it after every fix-and-push round.
9. **Loop**: after each push/re-review request, rely on Claude Code's native PR activity surfacing and, if needed, re-run `github_get_review_threads` to check for newly created unresolved threads; cap at 2 rounds

> **Why split tools?** Fetching/resolving threads uses the custom server (only source of GraphQL thread node IDs). Replying and requesting review uses built-in tools (platform auth ensures bot identity, not user's personal token).

## Guardrails

- **Never** suppress a lint/type error to satisfy a review comment — fix the root cause
- **Never** resolve a thread without either fixing it or explaining why it's not applicable
- **Never** enter more than 2 fix-review rounds on the same PR
- After resolving all threads and pushing fixes, (re-)apply `bot:ready-for-review` so the Reviewer Bot fires a fresh cycle. The Reviewer Bot adds `merge-when-ready` itself on APPROVED — **never apply it manually** (see [Label Ownership in AGENTS.md](../../../../AGENTS.md#label-ownership))
