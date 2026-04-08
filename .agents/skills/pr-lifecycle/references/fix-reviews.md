---
name: fix-copilot-reviews
description: 'Fix Copilot review comments on open PRs. Load when the user says "fix reviews", "fix comments", or when a PR has unresolved Copilot review threads.'
---

# Skill: Fix Copilot Reviews

You are a **review fixer** — you read Copilot review comments, understand the requested change, apply the fix in code, validate, and resolve the thread. Be methodical: fix all comments in a single pass when possible.

## Workflow (single PR)

1. **Fetch threads**: `github_get_review_threads(number: <PR#>, unresolvedOnly: true)`
2. **For each unresolved thread**:
   - Read `path`, `line`, and `body` to understand the requested fix
   - Navigate to the file and apply the change
   - If the comment is unclear or incorrect, resolve with a reply explaining why
3. **Validate**: `make pc` (or at minimum `make typecheck && make lint-fix`)
4. **Commit & push**: conventional commit message describing the fixes
5. **Resolve threads (MANDATORY)**: After pushing, immediately resolve every thread you addressed:
   - Collect all thread `id` values from the threads you fixed in step 2
   - Call `github_resolve_threads({ threadIds: [...] })` with all IDs in a single batch
   - GitHub does NOT auto-resolve threads when code changes — you must explicitly resolve them
   - For threads you chose not to fix (disagreed / out of scope), reply with an explanation, then resolve
   - **Never leave addressed threads unresolved** — this blocks the merge queue and triggers re-review
6. Copilot re-reviews automatically on push; new threads from the re-review are a separate round

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

| Step                | Custom MCP tool (preferred)                                                                  | Built-in fallback (only if custom unavailable)                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch threads       | `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })` ✅ returns GraphQL `id` | `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` ⚠️ no thread node IDs — resolve step will fail      |
| Reply to thread     | ⚠️ may post under user's GitHub username                                                     | `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId, body })` ✅ bot identity                                   |
| Resolve threads     | `github_resolve_threads({ threadIds })` ✅ batch                                             | `mcp__github__resolve_review_thread({ threadId })` per thread ⚠️ requires node IDs — only viable if threads were fetched via custom server above |
| Re-request Copilot  | ⚠️ app tokens silently fail for Copilot                                                      | `mcp__github__request_copilot_review({ owner, repo, pullNumber })` ✅ platform auth                                                              |
| Subscribe to events | N/A                                                                                          | `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber })` ✅                                                                             |

### Cloud workflow steps

1. **Subscribe**: `mcp__github__subscribe_pr_activity({ owner, repo, pullNumber: <PR#> })` — receive `<github-webhook-activity>` messages when Copilot posts comments or CI completes
2. **Fetch threads**: `github_get_review_threads({ number: <PR#>, unresolvedOnly: true })` — the custom server returns GraphQL thread `id` values needed for step 6. If the first call fails with a connection error, wait 10s and retry (server may still be starting). Only fall back to `mcp__github__pull_request_read({ method: "get_review_comments", owner, repo, pullNumber })` if the custom server is confirmed unavailable — but note: the built-in does **not** return thread node IDs, so step 6 cannot use `mcp__github__resolve_review_thread` without them.
3. **Fix code & validate**: same as local workflow (`make pc`)
4. **Commit & push**: `worktree_commit({ message: "..." })` + `worktree_push()` (or `git commit` + `git push`)
5. **Reply to threads**: `mcp__github__add_reply_to_pull_request_comment({ owner, repo, pullNumber, commentId: <numeric>, body: "explanation" })` — use the built-in tool so replies appear under bot identity, not the user's GitHub username
6. **Resolve threads**: `github_resolve_threads({ threadIds: [...], prNumber: <PR#> })` — thread IDs from step 2. If step 2 used the built-in fallback and thread IDs are unavailable, make one more attempt with `github_get_review_threads` (server may be up by now) before surfacing the blocker to the user.
7. **Re-request review**: `mcp__github__request_copilot_review({ owner, repo, pullNumber })` — platform handles auth natively; the custom server's app token is silently dropped by GitHub for Copilot requests
8. **Loop**: wait for new `<github-webhook-activity>` events, cap at 2 rounds

> **Why split tools?** Fetching/resolving threads uses the custom server (only source of GraphQL thread node IDs). Replying and requesting review uses built-in tools (platform auth ensures bot identity, not user's personal token).

## Guardrails

- **Never** suppress a lint/type error to satisfy a review comment — fix the root cause
- **Never** resolve a thread without either fixing it or explaining why it's not applicable
- **Never** enter more than 2 fix-review rounds on the same PR
- After resolving all threads, add the `merge-when-ready` label
