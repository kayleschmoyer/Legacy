---
name: repo-tooling
description: 'Build, validate, and manage dependencies in the Nx/pnpm monorepo: the make pc pipeline and pc-* chunks, GraphQL codegen, the node_modules pool, Make-target OS support, and what each Claude Code hook blocks. Load when: running pre-commit validation, diagnosing lint/typecheck/build/codegen failures, installing packages, picking a Make target, or a hook blocked your tool call.'
metadata:
  scope: '**'
---

# Skill: Repo Tooling

The Makefile is the canonical task entry point for this Nx 22 + pnpm 9.12.1 monorepo. This skill covers validation (`make pc` and its chunks), codegen, the pooled `node_modules` model, which Make targets work on which OS, and the hook layer that shapes tool calls. Database operations live in [database](../database/SKILL.md); per-environment validation bindings live in [workflow-overview](../workflow-overview/SKILL.md) and [cloud-agent-mode](../cloud-agent-mode/SKILL.md).

## Single source of truth for validation

The `_PC_*_CMD` variable block in the root `Makefile` (search for the `_PC_` prefix, near the `pre-commit:` target) **is** the validation pipeline. `make pc`, the seven `pc-*` chunk targets, and the `nx_run_pc_chunk` MCP tool all execute those same variables. Every prose description elsewhere ("lint + typecheck + test + build") is a lossy paraphrase — when in doubt, read the block, not a doc.

## The pc pipeline: 9 steps, 7 chunks

`make pc` (alias for `make pre-commit`) runs nine steps. The seven standalone chunk targets exist because the monolith exceeds cloud-session transport timeouts (LS-7906); they are equivalent to `make pc` **only when all seven run in this order**:

| #   | Step                            | Command (from `_PC_*_CMD`)                                              | Chunk target   | Runs when            |
| --- | ------------------------------- | ----------------------------------------------------------------------- | -------------- | -------------------- |
| 1   | Migration immutability          | `node scripts/check-migration-immutability.js --branch`                 | `pc-db-prep`   | `PC_HAS_DB=1`        |
| 2   | Schema generation               | `pnpm exec nx run db:print-schema`                                      | `pc-db-prep`   | `PC_HAS_DB=1`        |
| 3   | Codegen                         | `GRAPHQL_SCHEMA=<abs>/lambdas/db/schema.graphql nx run-many -t codegen` | `pc-db-prep`   | `PC_HAS_DB=1`        |
| 4   | Typecheck                       | `pnpm exec nx affected -t typecheck --base=$(NX_BASE)`                  | `pc-typecheck` | `PC_DOCS_ONLY=0`     |
| 5   | Format (prettier + auto-commit) | `_PC_FORMAT_RECIPE` (see below)                                         | `pc-format`    | always               |
| 6   | Lint (auto-fix)                 | `pnpm exec nx affected -t lint --fix --base=$(NX_BASE)`                 | `pc-lint`      | `PC_DOCS_ONLY=0`     |
| 7   | Workflow validation             | `node scripts/validate-workflows.js`                                    | `pc-workflows` | `PC_HAS_WORKFLOWS=1` |
| 8   | Test                            | `pnpm exec nx affected -t test --base=$(NX_BASE)`                       | `pc-test`      | `PC_DOCS_ONLY=0`     |
| 9   | Build                           | `pnpm exec nx affected -t build --base=$(NX_BASE)`                      | `pc-build`     | `PC_DOCS_ONLY=0`     |

Canonical chunk order: `pc-db-prep` → `pc-typecheck` → `pc-format` → `pc-lint` → `pc-workflows` → `pc-test` → `pc-build`.

As of 2026-07-02, lambda unit suites run under `nx affected -t test` like every other project (the `jest --onlyChanged` gap was closed by adding `project.json` jest targets — `lambdas/db` excepted, deliberately ungated pending red-suite cleanup) — so step 8 and CI both gate lambda tests. Which suites gate merge overall: see [testing → What Gates Merge](../testing/SKILL.md#what-gates-merge).

### Change classification (why steps get skipped)

Each pc invocation runs `node scripts/classify-changes.js --base $(NX_BASE)`, which diffs `NX_BASE...HEAD` and emits three flags:

- `PC_HAS_DB=1` — any changed file under `lib/db-client/` or `lambdas/db/` (enables steps 1–3)
- `PC_HAS_WORKFLOWS=1` — any changed file under `.github/workflows/` (enables step 7)
- `PC_DOCS_ONLY=1` — ALL changed files are docs (`*.md`, `docs/`, `.agents/skills/`) (skips steps 4, 6, 8, 9)

**Fail-safe:** if `git diff` fails (typical cause: shallow clone with no merge-base for `origin/main`) or no changes are detected, every step runs. In cloud, `.claude/cloud-setup.sh` deepens the clone (`git fetch --deepen=200`, fallback `--unshallow`) precisely to avoid this slow run-everything path.

**NX_BASE:** defaults to `origin/main` (falls back to `main` on non-Windows if `origin/main` is missing). Override per-invocation: `make pc NX_BASE=<ref>`. The same base feeds both classify-changes and every `nx affected` step.

### pc-format: auto-commit and recovery

Step 5 runs `pnpm exec prettier --write --ignore-unknown .`, then:

- **Clean working tree + formatter rewrote files** → `git add -A && git commit -m 'style: apply formatting'`: the fixes land in a **new commit** on top of your tip commit. Deliberately does **not** amend the tip (LS-8367) — the ticket-to-merge spine mandates commit → push → draft PR before validation runs, so the tip commit is always already on the remote by the time this step runs; amending it would rewrite pushed history and require a force-push, which Claude Code's auto-mode permission classifier blocks. A new commit reaches the remote with a normal push.
- **Dirty working tree + formatter rewrote files** → **exit 1** with "Commit or stash them first, then re-run make pc."

Preconditions and recovery:

1. Before running `make pc` or `pc-format`, commit all your work so the tree is clean.
2. If pc-format failed on a dirty tree: commit (or stash) your changes, then re-run — the rewrites will commit cleanly as a new commit.
3. `make format-commit` remains available as a standalone target with the same "new commit, not amend" behavior, for use outside the `pc-*` pipeline (e.g. formatting before the first commit of a session).

## Running validation per environment

- **`nx_run_pc_chunk` MCP tool available** (connector/local sessions with the nx stdio server): it is **mandatory** for every chunk — `nx_run_pc_chunk({ chunk: "pc-typecheck" })`, in canonical order. It runs `make pc-<chunk>` as a background job (30-min runaway backstop; transport safety comes from the bounded waits, not the process timeout) with a bounded in-call wait, so every call returns cleanly even under the ~60s cloud MCP transport timeout (source: `tools/mcp/nx-server/src/tools/run-pc-chunk.ts`). A chunk that finishes within the ~45s single-call budget returns `{ chunk, passed, output }` (`isError: true` with failure output on failure); a chunk still running at the budget returns `{ chunk, status: "running", jobId, logTail }` while it continues in the background — follow up with `nx_job_wait({ jobId })` (blocks ≤55s; re-invoke while it returns `status: "running"`), `nx_job_status({ jobId })` (non-blocking snapshot), or `nx_job_list()` (recover job handles after a session resume or lost result). **Never re-run a chunk that handed back a jobId** — re-invoking `nx_run_pc_chunk` for the same chunk while it runs joins the in-flight job instead of spawning a duplicate. Two terminal states have a defined recovery: a job killed by the backstop (`error` contains "internal timeout") or reported `orphaned` (job outlived its server or its deadline) may be re-run **once** — Nx caches every task that completed before the kill, so the retry only redoes the interrupted tail (LS-8353).
- **Degraded Claude-Code-web** (no custom stdio MCP servers, `nx_run_pc_chunk` absent from your tool list): the sanctioned path (owner ruling, 2026-07-02) is Bash `make pc-<chunk>` with `run_in_background: true`, **one chunk at a time in canonical order**, waiting for each background completion before starting the next. Foreground `make pc-<chunk>` is blocked by `enforce-background.mjs` (exit 2) — see the [hook truth table](references/hook-truth-table.md).
- **Local, non-timeout-prone sessions**: `make pc` (add `# pc-ok` to suppress the advisory warning) or `make_run({ target: "pc" })`.

Before any pc run: check migration status first (AGENTS.md Tier-2; commands in [database](../database/SKILL.md)).

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

## OS support matrix

The Makefile is aggressively OS-forked (`ifeq ($(DETECTED_OS),Windows)`). Before recommending a target in a cloud/Linux session, check this table; "stub" means the target prints a message and does nothing.

| Target                                                                                                        | Windows        | Linux/cloud                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pc`, `pc-*`, `lint*`, `typecheck`, `test*`, `build*`, `format*`, `codegen`, `quick-check`                    | ✅             | ✅                                                                                                                      |
| `install`, `install-force`, `install-node`                                                                    | ✅ (pool link) | ✅ (`pnpm install --frozen-lockfile`)                                                                                   |
| `clean-cache` / `reset`, `modules-gc`, `setup-hooks`, `e2e-auth`, `diagrams`, `lint-skills`                   | ✅             | ✅                                                                                                                      |
| `sync-env`, `deploy-lambdas`, `squash-branch`, `rebase-tree*`, `cleanup-merged-branches`, `resolve-conflicts` | ✅ (.ps1)      | ✅ (.sh)                                                                                                                |
| `worktree`, `wt-setup`                                                                                        | ✅             | ⛔ stub — cloud sessions get an isolated checkout; no worktree needed                                                   |
| `kill-stale`                                                                                                  | ✅             | ⛔ stub (native-addon file locks are a Windows problem; on Linux kill node processes directly or use `browser_cleanup`) |
| `db-dump`, `db-restore`, `db-dump-dev`, `db-restore-dev`                                                      | ✅             | ⛔ stub                                                                                                                 |
| `sync-jira`, `sync-worktrees`, `sync-worktrees-add/remove`, `pr` (twig), `branch-tree`                        | ✅             | ⛔ stub / requires twig (Windows-local tool)                                                                            |
| `db-tunnel`                                                                                                   | ⛔ stub        | ✅ (bash-only)                                                                                                          |

Note: `pnpm run sync-env` (the package.json script) is PowerShell-only; `make sync-env` picks the right script per OS. `deploy-infrastructure` no longer exists (removed in LS-2425) — use `make terraform-apply` / `make runner-apply` (see [terraform](../terraform/SKILL.md)).

## Quick commands

All wrap Nx and set `NODE_OPTIONS` for the Windows windowsHide patch + `NX_DAEMON=false` (LS-102) — prefer them (or the equivalent MCP tools `nx_run` / `nx_run_affected` / `make_run`, see [mcp-first](../mcp-first/SKILL.md)) over raw `pnpm exec nx`.

| Task                  | Command                            | Scope                                                       |
| --------------------- | ---------------------------------- | ----------------------------------------------------------- |
| Full pre-commit       | `make pc`                          | 9 steps (see pipeline above)                                |
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

- Before `make pc` / `pc-format`: **commit your work** (see pc-format above) and check migration status ([database](../database/SKILL.md)).
- Before resetting the Nx cache: use `make clean-cache`, never raw `pnpm exec nx reset` (LS-5242, recovery: `node scripts/modules-pool/link.mjs`).
- Before installing a package: follow [install-packages.md](references/install-packages.md) (detach symlink → `pnpm add -w` → `make install`).
- Run typecheck before lint — type errors produce false lint positives. Manual lint-fix patterns: [fix-lint.md](references/fix-lint.md).
- "Cannot find module `@legacy-sports/...`" during typecheck: run `pnpm run build:libs` (libs are compiled by consumers; new libs need one build for downstream type resolution).
- Suppression policy (`@ts-ignore`, `eslint-disable`, `console.*`): AGENTS.md Tier-3 is the home; details in [standards](../standards/SKILL.md).
- On Windows, avoid `node -e` for multi-line scripts (PowerShell quoting) — write to `scratch/<name>.js`; `jq` is not available on Windows.

## References

| Situation                            | Reference                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Hook behavior (block/warn/bypass)    | [references/hook-truth-table.md](references/hook-truth-table.md)                                         |
| Install / manage packages            | [references/install-packages.md](references/install-packages.md)                                         |
| Fixing lint errors auto-fix missed   | [references/fix-lint.md](references/fix-lint.md)                                                         |
| Database migrations / queries        | [references/database.md](references/database.md)                                                         |
| Database schema reference            | [references/db-schema-reference.md](references/db-schema-reference.md)                                   |
| Migration patterns and code examples | [references/db-migration-patterns-and-operations.md](references/db-migration-patterns-and-operations.md) |
| Database dump and restore            | [references/db-dump-and-restore.md](references/db-dump-and-restore.md)                                   |

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
