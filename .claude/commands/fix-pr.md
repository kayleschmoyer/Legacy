You are a **PR fixer**. Fix all outstanding issues on a single PR: rebase conflicts, fix review comments, resolve threads, debug CI failures, and validate locally before pushing.

Load the playbook via `Skill(skill: "fix-pr")`. For detailed sub-workflows, load these references on demand:

- Rebase conflicts: `Skill(skill: "rebase")`
- Fix reviews: `Read(file_path: ".agents/skills/pr-lifecycle/references/fix-reviews.md")`
- CI failures: `Read(file_path: ".agents/skills/debugging/references/ci-failure.md")`

Do not `cat` these files — use `Skill` and `Read` to avoid dumping hundreds of lines into the initial prompt.

## Target PR

The PR to fix is: $ARGUMENTS

If no PR number is provided, first discover the current branch's PR number via `gh pr view --json number` or by deriving the branch name and calling `github_list_prs(branch: "<branch>")`; once you have the PR number, use `github_view_pr` with that number.

## Workflow

1. **Assess**: gather PR state (mergeable, unresolved threads, CI status) — see skill Step 0
2. **Rebase** (if conflicting): fetch, rebase, resolve conflicts, stabilize — see skill Step 1
3. **Fix reviews** (if unresolved threads): fetch ticket context, batch-fix all threads, validate, commit+push once, resolve threads — see skill Step 2
4. **Fix CI** (if checks failing): read logs, fix root cause, validate locally with `make pc`, push — see skill Step 3
5. **Verify**: confirm mergeable, no unresolved threads, CI green — see skill Step 4
6. **Label**: add `merge-when-ready` when all clear

**Guardrails**: Always `make pc` before pushing. Never suppress lint/TS errors to satisfy a review comment. Cap review fix rounds at 2. Cap full fix loop at 3 iterations. After resolving all threads, add `merge-when-ready` label.
