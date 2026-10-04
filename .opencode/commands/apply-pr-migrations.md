---
description: 'Use when you want to apply unapplied database migrations from open PRs to the shared dev RDS.'
---

<!--
  AUTO-GENERATED — DO NOT EDIT.
  Source of truth: .claude/commands/apply-pr-migrations.md — edit that file instead.
  Regenerate: make sync-agent-prompts · Drift check: make lint-agent-prompts
-->

You are an **apply-pr-migrations operator**. Find open PRs that add an unapplied database migration and apply those migrations to the shared dev RDS via the hosted `legacy-sports-db-admin` MCP server.

> Specific invocation: `/apply-pr-migrations` to sweep all open PRs, or `/apply-pr-migrations 4928` to apply just one PR's migration.

Load the full playbook via `.agents/skills/apply-pr-migrations/SKILL.md` before doing anything else.

## Algorithm

### 1. Pre-flight auth (gate — stop if it fails)

Confirm `github_auth_status`. The hosted db-admin server authenticates per-connect with its own Cognito bearer; no AWS SSO is needed.

### 2. Find candidates

`github_list_prs(state: "open", label: "CI: Migration")` — server-side exact-label filter, auto-paginates up to 500 (request the next page and merge whenever the response sets `hasMore`). Prefer it over `github_pr_dashboard`, whose 100-PR cap can silently drop candidates. The exact filter excludes PRs labelled only `CI: Custom Checks` (a different problem — could be an edited committed migration, or any other unrelated `custom-checks` script failure; see the run log).

### 3. Confirm each candidate actually adds a migration

For each candidate branch (the `CI: Migration` label goes stale when a PR falls behind main):

```
git fetch origin <branch>
git diff --name-status --diff-filter=AM origin/main...origin/<branch> -- lib/db-client/migrations/
```

Empty output → stale label, **skip and report** (PR needs a rebase, not a migration). Non-empty → record the file path(s).

### 4. Stage + apply

For each migration file: `git checkout origin/<branch> -- <path>` into the active worktree (not `git show ref:path` — breaks on Windows). Then call `db_migrate` (hosted MCP from `legacy-sports-db-admin`) — it transpiles each pending `.ts` migration to CJS and POSTs them to the in-VPC server. Confirm `success: true` and that each target filename appears in `appliedNames`.

### 5. Clean the worktree

The staged files belong to other PRs — do not commit them. `git rm --cached <paths>` + `rm -f <paths>`, then `git status --short` must be empty.

### 6. Report

One row per PR: applied (migration name + one-line schema summary) / skipped (stale label) / failed (error). Flag competing migrations across PRs and note that unmerged-PR schema lingers in dev until cleaned up. Then stop — do not loop or poll.

## Guardrails

- Apply only `CI: Migration` PRs; never act on `CI: Custom Checks`.
- Leave the operator's worktree clean (no staged foreign migration files). $ARGUMENTS
