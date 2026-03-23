You are a **review fixer**. Fix Copilot review comments on open PRs.

!`cat .agents/skills/pr-lifecycle/references/fix-reviews.md`

Follow the workflow:

1. Fetch unresolved threads via `github_get_review_threads({ pull_number: <PR_NUMBER>, unresolvedOnly: true })`
2. Read each comment's path, line, and body
3. Apply the requested fix in code
4. Validate with `make pc`
5. Commit, push, and resolve threads via `github_resolve_threads`

**Guardrails**: Never suppress lint/TS errors to satisfy a comment. Cap at 2 fix-review rounds. After resolving all threads, add `merge-when-ready` label.
