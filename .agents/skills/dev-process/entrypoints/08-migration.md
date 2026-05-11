# Entrypoint 08: Migration (Schema, Data, Infra)

**Trigger**: a database schema change, a data backfill, or an infrastructure change (Terraform, Lambda config, networking).

**Default risk tier**: High

**Required artifacts**: [RFC](../artifacts/rfc.md), [ADR](../artifacts/adr.md) (for any non-reversible decision), [test plan](../artifacts/test-plan.md), **rollback plan**.

## Path notes

Migrations are the highest-risk normal work. They run once, in production, often without an undo button. The framework adds two artifacts beyond the spine default: an explicit rollback plan, and stricter staging.

### Phase 1: Frame

- Identify the kind of migration:
  - **Schema** (DDL): add column, drop column, change type, add index, rename table.
  - **Data** (DML): backfill, transform, dedupe, archive.
  - **Infra**: Terraform resource changes, IAM changes, Lambda config, networking.
- Identify the **blast radius**: rows touched, tables locked, downtime window, cost impact.
- Risk-tier almost always High; only adding a nullable column with no read-side change is Medium.

### Phase 2: Design

- RFC mandatory. Required sections in addition to standard RFC:
  - **Forward migration steps** (numbered).
  - **Rollback plan**: how to undo if it goes wrong mid-execution. "Drop the column" is not a rollback plan if the column has been written to.
  - **Lock window analysis**: what locks are taken, for how long, on what tables.
  - **Backfill strategy**: chunked? online? scheduled?
  - **Staging plan**: dev → staging → prod, with verification at each step.
- ADR for any non-reversible decision (e.g., "we are dropping this column rather than deprecating because…").

### Phase 3: Implement

- Migration files are **immutable once landed** — enforced by the pre-commit hook at [`scripts/git-hooks/pre-commit`](../../../../scripts/git-hooks/pre-commit) (the "Migration immutability check" step that fails commits modifying or deleting any migration in `lib/db-client/migrations/`). If you need to change a landed migration, write a new one that corrects it.
- Schema migrations and code that depends on them go in **separate PRs**:
  1. PR 1: add the schema change (forwards-compatible).
  2. PR 2: change the code to use it.
  3. PR 3 (later): remove the old code path.
- For data migrations: the migration script must be idempotent — safe to re-run if interrupted.

### Phase 4: Verify

- Run the migration locally against a snapshot of production-shaped data.
- Run the rollback plan locally. If you cannot rollback in dev, you cannot rollback in prod — fix the plan.
- For data migrations on large tables: dry-run with row count assertion ("expect to update ~N rows; got M").
- Verify lock window with `EXPLAIN` and / or controlled timing.

### Phase 5: Document

- Update the schema docs / ERD if the project maintains one.
- Note the migration in any operational runbook for the affected service.
- For infra changes: update Terraform module docs.

### Phase 6: Handoff

- Standard PR flow + **migration owner reviews mandatory**. The PR template should request reviewers from the area's CODEOWNERS.
- After merge: watch the migration apply in dev, then staging, then prod. Do not start the next ticket until the migration is confirmed applied in prod.
- For data migrations: monitor metrics for the affected tables for at least 1 hour post-apply.

## Anti-patterns

- ❌ Migration + code change in one PR. Forces simultaneous deploy; loses forward-compat staging.
- ❌ "DROP COLUMN x" as the first PR after writing to it. Always deprecate, then remove later.
- ❌ Rollback plan: "restore from backup." That is a disaster recovery plan, not a rollback plan.
- ❌ Schema migration that takes an exclusive lock on a hot table without scheduling. Ask before running.
- ❌ Editing a previously-landed migration file. Always a new migration.
- ❌ Data backfill without idempotency. Crashes mid-run leave the system in an indeterminate state.

## Related skills

- [repo-tooling](../../repo-tooling/SKILL.md) — `db_migrate` MCP tool and operational migration commands
- [terraform-local-apply](../../terraform-local-apply/SKILL.md) — infra apply mechanics
- [infrastructure](../../infrastructure/SKILL.md)
