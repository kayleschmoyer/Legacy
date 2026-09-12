---
name: repo-tooling
description: 'Build, validate, and manage dependencies in the Nx/pnpm monorepo: the make pc pipeline and pc-* chunks, GraphQL codegen, the node_modules pool, Make-target OS support, and what each Claude Code hook blocks. Load when: running pre-commit validation, diagnosing lint/typecheck/build/codegen failures, installing packages, picking a Make target, or a hook blocked your tool call.'
metadata:
  scope: '**'
---

# Skill: Repo Tooling

The Makefile is the canonical task entry point for this Nx 22 + pnpm 9.12.1 monorepo. This skill covers validation (`make pc` and its chunks), codegen, the pooled `node_modules` model, which Make targets work on which OS, and the hook layer that shapes tool calls. Database operations live in [database](../database/SKILL.md); per-environment validation bindings live in [workflow-overview](../workflow-overview/SKILL.md) and [cloud-agent-mode](../cloud-agent-mode/SKILL.md).

## Validation: the pc pipeline

The `_PC_*_CMD` variable block in the root `Makefile` (search for the `_PC_` prefix, near the `pre-commit:` target) **is** the validation pipeline. `make pc`, the seven `pc-*` chunk targets, and the `nx_run_pc_chunk` MCP tool all execute those same variables. Every prose description elsewhere ("lint + typecheck + test + build") is a lossy paraphrase — when in doubt, read the block, not a doc.

The 9 steps and 7 chunks, what each does, how change classification skips steps, `pc-format`'s auto-commit and recovery, the vendored-schema `pc-workflows` check, per-environment routing (which sessions must use `nx_run_pc_chunk`, which fall back to background `make pc-<chunk>`), and the OOM remedies for `pc-test` and `pc-lint`: **[references/pc-pipeline.md](references/pc-pipeline.md)**.

## Codegen

```bash
make codegen        # GRAPHQL_SCHEMA=<abs>/lambdas/db/schema.graphql pnpm run codegen (= nx run-many -t codegen)
```

- `lambdas/db/schema.graphql` is **generated** from the Pothos schema — never edit it by hand. After changing anything in `lambdas/db/src/schema/`, run `pnpm exec nx run db:print-schema` first, then codegen (pc steps 2→3 do exactly this).
- Codegen deliberately uses `run-many`, not `affected`: the inferred lib codegen targets (api, bref-client, data-loaders, shared-components) don't track `schema.graphql` in their Nx inputs, so `affected` misses them on schema-only changes and drift reaches CI (LS-5237 — documented in the Makefile comment above `_PC_CODEGEN_CMD`).
- Generated `graphql.generated.ts` files are **committed**; commit them together with the schema change. Where GraphQL operations live and which packages carry generated copies: see [architecture](../architecture/SKILL.md).
- Writing new queries: `.graphql` files + generated hooks, never inline `gql` (AGENTS.md Tier-3; details in [standards](../standards/SKILL.md)).

## node_modules pool (mental model)

On Windows-local, `node_modules` is a **directory symlink** into `<main-repo>/.modules-pool/<hash>/node_modules`, where `<hash>` is derived from sha256 of `pnpm-lock.yaml` (+ pnpm version). Slots are **immutable** and shared by every worktree on the same lockfile. Consequences:

- Never `pnpm install`/`pnpm add` through the symlink. Adding a package = new lockfile = new slot: detach symlink → `pnpm add -w` → `make install`. Full procedure: [install-packages.md](references/install-packages.md).
- `scripts/modules-pool/link.mjs` (run by `make install`, `make modules-link`, and the SessionStart hook) is the resolver: pool hit re-points the symlink in milliseconds; miss runs `pnpm install --frozen-lockfile` and publishes the slot atomically. It also symlinks `.env`, `.env.local`, and `certs/` from the main repo into the worktree.
- `make modules-gc [DAYS=14] [DRY=1]` prunes unreferenced slots older than 14 days (`scripts/modules-pool/gc.mjs`).
- Three install guards defend the pool: `.pnpmfile.cjs` `afterAllResolved` (aborts installs through a symlinked `node_modules`), `scripts/preinstall-guard.js` (same, plus rejects npm/yarn via `npm_config_user_agent`), and the `pre-push` git hook (rejects tracked `package-lock.json`/`yarn.lock`). Bypass for the first two (dangerous): `FORCE_INSTALL=1`.
- Nx cache reset: use `make clean-cache` (alias `make reset`) — in a worktree it re-runs `link.mjs` after `nx reset`. Raw `pnpm exec nx reset` destroys the pool symlink (LS-5242); if you already ran it, recover with `node scripts/modules-pool/link.mjs`.
- On Linux/cloud there is **no pool**: `node_modules` is a real directory (`pnpm install --frozen-lockfile`, done by `.claude/cloud-setup.sh` or `make install`).

Design rationale: `docs/rfcs/modules-pool/README.md` (Accepted).

## Quick commands

All wrap Nx and set `NODE_OPTIONS` for the Windows windowsHide patch + `NX_DAEMON=false` (LS-102) — prefer them (or the equivalent MCP tools `nx_run` / `nx_run_affected` / `make_run`, see [mcp-first](../mcp-first/SKILL.md)) over raw `pnpm exec nx`.

| Task                  | Command                            | Scope                                                       |
| --------------------- | ---------------------------------- | ----------------------------------------------------------- |
| Full pre-commit       | `make pc`                          | 9 steps ([pc-pipeline.md](references/pc-pipeline.md))       |
| Fast iteration        | `make quick-check`                 | typecheck + lint --fix, affected                            |
| Lint / fix            | `make lint` / `make lint-fix`      | affected                                                    |
| Typecheck             | `make typecheck`                   | affected                                                    |
| Test                  | `make test` / `make test-all`      | affected / all projects                                     |
| Build                 | `make build` / `make build-all`    | affected / all projects                                     |
| Format                | `make format`                      | prettier, whole repo                                        |
| Format as own commit  | `make format-commit`               | clean tree required                                         |
| Codegen               | `make codegen`                     | run-many (all codegen projects)                             |
| Workflow lint         | `make lint-workflows`              | `.github/workflows/`                                        |
| Skill validation      | `make lint-skills`                 | `.agents/skills/`                                           |
| Diagrams              | `make diagrams`                    | `.mmd` → `.svg` (needs `mmdc`)                              |
| Post-rebase stabilize | `make stabilize-after-rebase`      | install → schema → codegen → pc                             |
| Ship PR               | `make ship-pr TITLE="LS-#### ..."` | draft → label → ready → review                              |
| E2E auth token        | `make e2e-auth`                    | human-interactive; caches `~/.legacy-sports/e2e-token.json` |
| Discover targets      | `make help`                        | lists all targets with descriptions                         |

Database targets (`db-migrate`, `db-studio`, …) and the MCP-first migration tools: [database](../database/SKILL.md).

## Hooks: what blocks vs what warns

One home for hook behavior: **[references/hook-truth-table.md](references/hook-truth-table.md)** — every hook in `.claude/hooks/` and `.agents/hooks/`, its event, whether it blocks (exit 2) or warns (exit 0), trigger, and bypass marker. Read it before working around any `[BLOCKED]`/`[WARNING]` message. Summary of the only blockers: `guard-main-repo` (main-repo edits while worktrees exist), `enforce-background.mjs` (foreground long-running nx/make-pc commands), `block-tmp-polling.mjs` (reading `/tmp/claude*` task output), and the two Stop hooks (incomplete work / undriven PR). Everything else warns.

## Key rules

- Before `make pc` / `pc-format`: **commit your work** ([pc-pipeline.md § pc-format](references/pc-pipeline.md#pc-format-auto-commit-and-recovery)) and check migration status ([database](../database/SKILL.md)).
- Before resetting the Nx cache: use `make clean-cache`, never raw `pnpm exec nx reset` (LS-5242, recovery: `node scripts/modules-pool/link.mjs`).
- Before installing a package: follow [install-packages.md](references/install-packages.md) (detach symlink → `pnpm add -w` → `make install`).
- Run typecheck before lint — type errors produce false lint positives. Manual lint-fix patterns: [fix-lint.md](references/fix-lint.md).
- "Cannot find module `@legacy-sports/...`" during typecheck: run `pnpm run build:libs` (libs are compiled by consumers; new libs need one build for downstream type resolution).
- Suppression policy (`@ts-ignore`, `eslint-disable`, `console.*`): AGENTS.md Tier-3 is the home; details in [standards](../standards/SKILL.md).
- On Windows, avoid `node -e` for multi-line scripts (PowerShell quoting) — write to `scratch/<name>.js`; `jq` is not available on Windows.

## References

| Situation                                       | Reference                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Running or debugging `make pc` / a `pc-*` chunk | [references/pc-pipeline.md](references/pc-pipeline.md)                                                   |
| Which Make targets work on which OS             | [references/os-support.md](references/os-support.md)                                                     |
| Hook behavior (block/warn/bypass)               | [references/hook-truth-table.md](references/hook-truth-table.md)                                         |
| Install / manage packages                       | [references/install-packages.md](references/install-packages.md)                                         |
| Fixing lint errors auto-fix missed              | [references/fix-lint.md](references/fix-lint.md)                                                         |
| Database migrations / queries                   | [references/database.md](references/database.md)                                                         |
| Database schema reference                       | [references/db-schema-reference.md](references/db-schema-reference.md)                                   |
| Migration patterns and code examples            | [references/db-migration-patterns-and-operations.md](references/db-migration-patterns-and-operations.md) |
| Database dump and restore                       | [references/db-dump-and-restore.md](references/db-dump-and-restore.md)                                   |

## Related skills

- [testing](../testing/SKILL.md) — what gates merge, running suites
- [database](../database/SKILL.md) — migrations, queries, schema
- [worktree-workflow](../worktree-workflow/SKILL.md) — worktree creation and lifecycle
- [cloud-agent-mode](../cloud-agent-mode/SKILL.md) — cloud validation binding
- [mcp-first](../mcp-first/SKILL.md) — MCP tool substitutions for shell commands
- [standards](../standards/SKILL.md) — code quality and suppression policy

Architecture decision: [ADR 0001: pnpm workspaces + Nx](../../../docs/decisions/0001-pnpm-workspaces-and-nx.md).

## Provenance and maintenance

Rewritten 2026-07-02 from the skills audit (`scratch/skills-audit/`, build-and-env area): the previous version and six references (lint/typecheck/build/fix-types/makefile/codegen.md) carried Next.js/port fossils, a removed `deploy-infrastructure` target, banned `nx reset` advice, and misdescribed both Bash guard hooks. Re-verify volatile facts:

- Pipeline steps/commands: `grep -n "_PC_" Makefile` and read `pre-commit:` through `pc-build:`
- Gating flags: `Read scripts/classify-changes.js` (header comment)
- format-commit behavior: `grep -n -A6 "^format-commit:" Makefile`
- NX_BASE default: `grep -n -B2 -A8 "ifndef NX_BASE" Makefile`
- Codegen run-many reason: Makefile comment above `_PC_CODEGEN_CMD` (LS-5237)
- OS forks: `grep -n "Windows-only\|requires bash" Makefile`
- Pool mechanics: `Read scripts/modules-pool/link.mjs` (header) and `docs/rfcs/modules-pool/README.md`
- nx_run_pc_chunk timeout: `Read tools/mcp/nx-server/src/tools/run-pc-chunk.ts`
- Lambda test gating: `pnpm exec nx show project db --json | grep -A3 '"test"'`
