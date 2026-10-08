---
name: apply-pr-migrations
description: 'Find open PRs that add an unapplied database migration and apply those migrations to the shared dev RDS via the hosted db-admin MCP server. Load when: a PR''s "Verify All Migrations Applied" CI check is failing, you see the `CI: Migration` label, or someone asks to "apply the migrations from the open PRs".'
metadata:
  scope: '**'
---

# Skill: Apply PR Migrations

Open PRs that add a migration leave it **unapplied to the shared dev RDS** until an operator applies it. The `Verify All Migrations Applied` CI check fails until the migration is journaled on the dev RDS. This skill applies those migrations in one pass via the hosted DB MCP server (exposed as `legacy-sports-db` in connector sessions; repo-side alias `legacy-sports-db-admin` — see [mcp-first](../mcp-first/references/tool-surfaces.md#db-server-name)) and reports per-PR results.

The migration files live on each PR's branch, not on `main`. The flow is: discover candidate PRs → confirm each truly adds a migration → `db_migrate` **by ref** (hosted MCP — the server fetches each file from the PR branch itself and reaches dev RDS over HTTPS, LS-10974) → report. Nothing is staged into your worktree.

## Critical preconditions

- **Before trusting a `CI: Migration` label, confirm the branch actually adds a migration.** The label goes stale when a PR falls behind `main`. Diff the migrations directory against the merge-base (step 2). An empty diff means skip-and-report, not apply.
- **`CI: Migration` ≠ `CI: Custom Checks`.** `CI: Custom Checks` fires for any `custom-checks` job script failure — sometimes an _edited committed migration_ violation (handled by the immutability soft-reset recipe, not this skill), sometimes an unrelated script (LS-9630). Only act on `CI: Migration`.
- **No SSM tunnel needed.** The hosted `legacy-sports-db-admin` MCP server runs inside the VPC and reaches RDS directly. The old `db_migrate_tunnel` flow is gone — use the hosted `db_migrate` MCP tool. Pass each migration as `ref: { branch, path }` — the server fetches it from `bkrupa/legacy-sports` at that branch, transpiles it, and an async worker applies it as `migration_user` (LS-8563). Never transcribe or paste migration source into the call (LS-10974: an ~82 KB seed migration truncated in transit).
- **Destructive/renaming migrations need a deploy-health check before applying.** Before step 5's `db_migrate`, read the migration's `up()` on its branch (`git fetch origin <branch>` then `git diff origin/main...origin/<branch> -- <path>`) for `RENAME COLUMN`, `DROP COLUMN`, a narrowing `ALTER COLUMN ... TYPE`, or `DROP TABLE`. Any of these breaks a currently-deployed lambda still reading the old shape. A passing `Verify All Migrations Applied` check is **necessary but not sufficient** here — it proves the migration is journaled on the dev RDS, not that deployed code is compatible with the new shape (LS-7934: the LS-7824 `email`→`canonical_email` rename applied cleanly pre-merge while lambda deploys were separately wedged, opening an outage window that check couldn't see). Before applying such a migration, check the most recent `Deploy` workflow run on `main` (`ci_list_runs` / `mcp__github__actions_list`). If its conclusion is not `success`, **stop and escalate to a human** instead of calling `db_migrate` — do not treat the green CI check alone as clearance. See [database Hard Rules](../database/references/migrations.md#hard-rules) for the same rule stated for local/manual application.

## Workflow

Transcribe these into TaskCreate entries at the start so each gates the next:

1. **Pre-flight auth** — confirm `github_auth_status`. The hosted db-admin server authenticates per-connect with its own Cognito bearer; no AWS SSO is needed for the migrate step.
2. **Find candidate PRs** — `github_list_prs(state: "open", label: "CI: Migration")`. This filters server-side by the exact label and auto-paginates (up to 500; if the response sets `hasMore`, request the next page and merge before proceeding). Prefer it over `github_pr_dashboard`, whose 100-PR cap can silently drop candidates. Because the label match is exact, PRs labelled only `CI: Custom Checks` (a different problem — could be an edited committed migration, or any other unrelated `custom-checks` script failure) are excluded automatically; if a PR carries both labels, treat it as a `CI: Migration` candidate.
3. **Confirm + locate the migration file(s)** — fetch each candidate branch and diff against the merge-base for added/modified migrations:

   ```bash
   git fetch origin <branch>
   git diff --name-status --diff-filter=AM origin/main...origin/<branch> -- lib/db-client/migrations/
   ```

   - Empty output → stale label. **Skip and report** (the PR likely just needs a rebase). Do not error.
   - One or more files → these are the migrations to apply.

4. **Build the by-ref payload** — one item per path from step 3, using the PR's head branch (or its head SHA from `github_view_pr`, to pin exactly what you checked):
   ```
   migrations: [{ ref: { branch: "<branch>", path: "lib/db-client/migrations/<file>.ts" } }, ...]
   ```
   No files are staged locally and no source is transpiled or pasted (LS-10974).
5. **Apply via the hosted db-admin server** — pass that array as the `migrations` argument to `db_migrate` (hosted MCP tool from `legacy-sports-db-admin`). Confirm each entry of the returned `sources` has the expected `path`, and that its `blobSha` matches `git rev-parse origin/<branch>:<path>` if you need proof of what ran. The call is **async** (LS-8563): it returns `{ jobId, status: "running" }` immediately (or joins an already-running job). Poll `db_migration_status({ jobId })` every ~5s until `terminal: true`, then confirm `success: true` and that each target filename appears in `appliedNames` (already-applied entries land in `skipped`). An `orphaned` status means the worker died — re-submit; already-applied migrations are skipped. The runner applies all pending migrations (it will also catch up any backlog the dev RDS is behind on — that is expected and safe).
6. **Fallback only — server rejects `ref`** (a pre-LS-10974 deployment): stage the file with `git checkout origin/<branch> -- <path>` (not `git show <ref>:<path>`, which breaks under Git Bash on Windows), pass it as inline `tsSource`, then `git rm --cached <paths> && rm -f <paths>` so the worktree ends clean. Large files cannot go this route reliably; escalate to a human for a local `db:up` instead.
7. **Report** — one row per PR: **applied** (with migration name + one-line schema summary), **skipped** (stale label, needs rebase), or **failed** (with the error).

## Edge cases to surface in the report

- **Competing migrations** — two PRs can add different implementations of the same feature (e.g. password-reset columns-on-`users` vs. a dedicated `password_reset_tokens` table). Applying both to dev is harmless, but flag the overlap so a human picks one before merge.
- **Unmerged schema lingers** — applying an unmerged PR's migration to the shared dev RDS is exactly what the CI check verifies, but if a PR is later abandoned its schema stays in dev until cleaned up. Call this out so operators aren't surprised.
- **Same timestamp, different name** — match on the full filename, not the date prefix; two migrations can share a `YYYYMMDD_HHMMSS` prefix.

## Single-PR mode

When invoked with a PR number, skip the dashboard scan: resolve that PR's branch (`github_view_pr`), then run steps 3–7 for just that branch.

## Related skills

- [database](../database/SKILL.md) — local migration tooling and migration authoring.
- [mcp-first Auth Model](../mcp-first/references/auth-and-routing.md#auth-model) — auth-check / re-auth rules.
- [pr-lifecycle (unblock reference)](../pr-lifecycle/references/unblock.md) — broader stuck-PR triage; a stale `CI: Migration` label usually means the PR needs a rebase, which that workflow dispatches.
