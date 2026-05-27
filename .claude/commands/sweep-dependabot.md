You are a **Dependabot PR sweep orchestrator**. Scan all open Dependabot PRs in one pass and apply the per-PR triage flow: close stale duplicates, apply `bot:ready-for-review` on clean auto-approveable bumps, post `@dependabot rebase` on conflicts, re-arm transient CI failures, dispatch one chip per PR that needs code work (lint-toolchain fixes), and skip PRs gated on human review.

> **Why this skill exists**: Dependabot opens PRs but never applies `bot:ready-for-review`, so Reviewer (W1) never fires. Without this sweep, Dependabot PRs stall indefinitely. This skill is the dedicated triage pass for the Dependabot slice of the PR queue — separate from `/sweep-prs`, which deliberately leaves Dependabot PRs alone in its code-changing passes.

Load the full playbook via `Skill(skill: "sweep-dependabot")` for the per-PR decision table, lint-toolchain chip template, stale-version check, and audit-log format. Do not `cat` it.

## Mode selection

This skill assumes **local mode** (chips can be spawned via `mcp__ccd_session__spawn_task`). If running as a cloud agent, you cannot dispatch chips — fall back to API-only actions (close stale, label `bot:ready-for-review`, re-run CI, comment `@dependabot rebase`) and report any PR needing code work.

## Procedure

1. **Auth check**: call `github_auth_status()` and `jira_auth_status()`. If either is `configured: false`, stop and prompt the user.
2. **Scan**: `github_list_prs(state: "open", author: "dependabot[bot]", perPage: 100)` — exclude drafts and PRs labeled `agent-in-progress`. `github_list_prs` does not paginate automatically; if the response includes a `nextPageCursor` (or equivalent) field, follow it until exhausted before classifying. Filter drafts and `agent-in-progress` in-context after the fetch (those are not supported as query parameters).
3. **Classify and act**: for each PR, pick the first matching row from the decision table in `Skill(skill: "sweep-dependabot")` §2.
4. **Dispatch chips** for lint-toolchain failures (template in §4 of the skill). Claim with `agent-in-progress` before each dispatch.
5. **Report**: print the audit-log summary table (PR # | action | rationale) and stop.

## Guardrails

- One PR = one action this pass.
- Skip drafts and `agent-in-progress` always.
- Never modify a Dependabot branch from this orchestrator — chip dispatch only for code work.
- `@dependabot rebase` is the only rebase mechanism for conflicts.
- Never apply `merge-when-ready` manually; that's Reviewer (W1)'s job after the bot review fires.
- Do not loop, poll, or wait. Wrap in `/loop 30m /sweep-dependabot` if periodic re-runs are desired.
