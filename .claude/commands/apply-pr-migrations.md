You are an **apply-pr-migrations operator**. Find open PRs that add an unapplied database migration and apply those migrations to the shared dev RDS through the SSM tunnel.

> Specific invocation: `/apply-pr-migrations` to sweep all open PRs, or `/apply-pr-migrations 4928` to apply just one PR's migration.

Load the full playbook via `Skill(skill: "apply-pr-migrations")` before doing anything else.

## Algorithm

### 1. Pre-flight auth (gate — stop if it fails)

`aws_sso_status` must be authenticated; the tunnel needs AWS. If not, surface the hint verbatim — `Run aws sso login --profile default in your terminal to refresh your SSO session.` — and **stop**. Never run `aws sso login` yourself (user-only, AGENTS.md Tier 1). Also confirm `github_auth_status`.

### 2. Find candidates

`github_list_prs(state: "open", label: "CI: Migration")` — server-side exact-label filter, auto-paginates up to 500 (request the next page and merge whenever the response sets `hasMore`). Prefer it over `github_pr_dashboard`, whose 100-PR cap can silently drop candidates. The exact filter excludes PRs labelled only `CI: Migration Immutability` (a different problem — edited committed migration).

### 3. Confirm each candidate actually adds a migration

For each candidate branch (the `CI: Migration` label goes stale when a PR falls behind main):

```
git fetch origin <branch>
git diff --name-status --diff-filter=AM origin/main...origin/<branch> -- lib/db-client/migrations/
```

Empty output → stale label, **skip and report** (PR needs a rebase, not a migration). Non-empty → record the file path(s).

### 4. Stage + apply

For each migration file: `git checkout origin/<branch> -- <path>` into the active worktree (not `git show ref:path` — breaks on Windows). Then `db_migrate_tunnel(worktreePath: <active worktree absolute path>)`. Confirm `success: true` and that each target filename appears in `appliedNames`. On a `DB_CERT_PATH`/SSL error, run `make wt-setup` first and retry.

### 5. Clean the worktree

The staged files belong to other PRs — do not commit them. `git rm --cached <paths>` + `rm -f <paths>`, then `git status --short` must be empty.

### 6. Report

One row per PR: applied (migration name + one-line schema summary) / skipped (stale label) / failed (error). Flag competing migrations across PRs and note that unmerged-PR schema lingers in dev until cleaned up. Then stop — do not loop or poll.

## Guardrails

- Apply only `CI: Migration` PRs; never act on `CI: Migration Immutability`.
- A missing AWS session stops the run cleanly — never attempt to mint or refresh tokens.
- Leave the operator's worktree clean (no staged foreign migration files).
- Use `db_migrate_tunnel`, never plain `db_migrate` (DB_HOST is VPC-private). $ARGUMENTS
