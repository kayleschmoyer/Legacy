---
name: apply-pr-migrations
description: 'Find open PRs that add an unapplied database migration and apply those migrations to the shared dev RDS through the SSM tunnel. Load when: a PR''s "Verify All Migrations Applied" CI check is failing, you see the `CI: Migration` label, or someone asks to "apply the migrations from the open PRs".'
---

# Skill: Apply PR Migrations

Open PRs that add a migration leave it **unapplied to the shared dev RDS** until an operator applies it. The `Verify All Migrations Applied` CI check fails until the migration is journaled on the dev RDS. This skill applies those migrations in one pass through the SSM tunnel and reports per-PR results.

The migration files live on each PR's branch, not on `main`. The flow is: discover candidate PRs → confirm each truly adds a migration → stage the new file(s) into the active worktree → `db_migrate_tunnel` (applies all pending, idempotent) → clean the worktree → report.

## Critical preconditions

- **Before opening the tunnel, verify AWS auth.** Call `aws_sso_status`. If `authenticated` is false, surface the hint verbatim — `Run aws sso login --profile default in your terminal to refresh your SSO session.` — and **stop**. Running `aws sso login` (or any auth-generation command) is a user-only action (AGENTS.md Tier 1). Wait for the user to re-auth, then continue.
- **Before trusting a `CI: Migration` label, confirm the branch actually adds a migration.** The label goes stale when a PR falls behind `main`. Diff the migrations directory against the merge-base (step 2). An empty diff means skip-and-report, not apply.
- **`CI: Migration` ≠ `CI: Migration Immutability`.** `CI: Migration Immutability` is an _edited committed migration_ violation — a different problem handled by the immutability soft-reset recipe, not this skill. Only act on `CI: Migration`.
- **Use the tunnel, not plain `db_migrate`.** In the standard dev setup `DB_HOST` is a VPC-private RDS endpoint not directly reachable, so `db_migrate` fails. `db_migrate_tunnel` opens an SSM port-forward, applies, and tears it down.

## Workflow

Transcribe these into TaskCreate entries at the start so each gates the next:

1. **Pre-flight auth** — `aws_sso_status` authenticated (see precondition); confirm `github_auth_status`.
2. **Find candidate PRs** — `github_list_prs(state: "open", label: "CI: Migration")`. This filters server-side by the exact label and auto-paginates (up to 500; if the response sets `hasMore`, request the next page and merge before proceeding). Prefer it over `github_pr_dashboard`, whose 100-PR cap can silently drop candidates. Because the label match is exact, PRs labelled only `CI: Migration Immutability` (a different, edited-migration problem) are excluded automatically; if a PR carries both labels, treat it as a `CI: Migration` candidate.
3. **Confirm + locate the migration file(s)** — fetch each candidate branch and diff against the merge-base for added/modified migrations:

   ```bash
   git fetch origin <branch>
   git diff --name-status --diff-filter=AM origin/main...origin/<branch> -- lib/db-client/migrations/
   ```

   - Empty output → stale label. **Skip and report** (the PR likely just needs a rebase). Do not error.
   - One or more files → these are the migrations to apply.

4. **Stage the new file(s) into the active worktree** — for each path:
   ```bash
   git checkout origin/<branch> -- <migration path>
   ```
   Prefer `git checkout origin/<ref> -- <path>`; do **not** use `git show <ref>:<path>` (the colon separator breaks under Git Bash on Windows).
5. **Apply via the tunnel** — `db_migrate_tunnel(worktreePath: <active worktree absolute path>)`. The runner applies all pending migrations (it will also catch up any backlog the dev RDS is behind on — that is expected and safe). Confirm `success: true` and that each target filename appears in `appliedNames`.
   - If `db_migration_status` (or the tunnel) reports a `DB_CERT_PATH` / SSL error, the worktree's `certs/` symlink is missing — run `make wt-setup` (or the worktree cert setup) first, then retry.
6. **Clean the worktree** — the staged files belong to other PRs and must not land on the operator's branch. Remove them so the worktree ends clean:
   ```bash
   git rm --cached <paths> && rm -f <paths>
   git status --short          # expect empty
   ```
7. **Report** — one row per PR: **applied** (with migration name + one-line schema summary), **skipped** (stale label, needs rebase), or **failed** (with the error).

## Edge cases to surface in the report

- **Competing migrations** — two PRs can add different implementations of the same feature (e.g. password-reset columns-on-`users` vs. a dedicated `password_reset_tokens` table). Applying both to dev is harmless, but flag the overlap so a human picks one before merge.
- **Unmerged schema lingers** — applying an unmerged PR's migration to the shared dev RDS is exactly what the CI check verifies, but if a PR is later abandoned its schema stays in dev until cleaned up. Call this out so operators aren't surprised.
- **Same timestamp, different name** — match on the full filename, not the date prefix; two migrations can share a `YYYYMMDD_HHMMSS` prefix.

## Single-PR mode

When invoked with a PR number, skip the dashboard scan: resolve that PR's branch (`github_view_pr`), then run steps 3–7 for just that branch.

## Related skills

- [database](../database/SKILL.md) — local migration tooling (`db_migration_status`, `db_migrate`) and migration authoring.
- [credentials](../credentials/SKILL.md) — auth-check / re-auth rules (AWS SSO is user-only).
- [unblock-prs](../unblock-prs/SKILL.md) — broader stuck-PR triage; a stale `CI: Migration` label usually means the PR needs a rebase, which that skill dispatches.
