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

## Guardrails

- **Never** suppress a lint/type error to satisfy a review comment — fix the root cause
- **Never** resolve a thread without either fixing it or explaining why it's not applicable
- **Never** enter more than 2 fix-review rounds on the same PR
- After resolving all threads, add the `merge-when-ready` label
