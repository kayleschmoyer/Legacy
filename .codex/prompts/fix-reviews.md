---
description: 'Use when Copilot review comments on open PRs need to be addressed and resolved.'
argument-hint: '[PR number]'
---

<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/fix-reviews.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

You are a **review fixer**. Fix Copilot review comments on open PRs.

Load the fix-reviews reference via `.agents/skills/pr-lifecycle/references/fix-reviews.md`. Do not use `cat` — use `Read` to avoid bloating the initial prompt.

## Target PR

The PR to fix is: $ARGUMENTS

> Specific invocation: `/fix-reviews <N>` — pass the PR number directly; omit to use the current branch's PR.

If no PR number is provided, derive the current branch name and call `github_list_prs(state: "open", branch: "<branch>")` to find its open PR. If no open PR exists, stop and tell the user.

Follow the workflow:

1. Fetch unresolved threads via `github_get_review_threads(number: <PR_NUMBER>)` — save all `threads[].id` values
2. Read each comment's path, line, and body
3. **Fetch ticket context before applying any fixes** — first call `github_view_pr(number: <PR_NUMBER>)` and read the `title` and `headRefName` fields. Extract the Jira ticket key from either field using the pattern `LS-\d+`. If a key is found, call `jira_auth_status()` — if Jira is configured and authenticated, call `jira_view(key: "LS-####")` to retrieve the ticket's description and acceptance criteria. If Jira is not configured or the call fails, **stop and prompt the user** before proceeding (per AGENTS.md). Use ticket context as a guardrail: if a reviewer suggestion contradicts the ticket's acceptance criteria or would change the intended behavior, **do not apply it blindly** — instead reply on the thread explaining the conflict, and still queue that thread's `id` for resolution.
4. Apply the requested fix in code
5. Validate with `make pc`
6. Commit and push
7. **Reply + resolve + label in one call** via `github_finish_fix_round({ prNumber: <PR_NUMBER>, replies: [{ threadId, kind: "FIX", sha: "<pushed-sha>" }, ...] })` — this replaces the legacy three-tool dance (`github_reply_to_review_thread` → `github_resolve_threads` → `github_manage_labels(add: ["bot:ready-for-review"])`). It validates every reply before any side effect (FIX requires `sha`; JUSTIFY/CANNOT-COMPLY require `body`), emits FIX bodies as exactly `FIX: <sha>` (strict bot format — no trailing prose), resolves only FIX threads, and applies `bot:ready-for-review`. Partial failures surface in `errors[]` and do not block successful replies. GitHub does NOT auto-resolve threads when code changes.

**Guardrails**: Never suppress lint/TS errors to satisfy a comment. Cap at 2 fix-review rounds. The Reviewer Bot adds `merge-when-ready` itself on APPROVED — never apply it manually.
