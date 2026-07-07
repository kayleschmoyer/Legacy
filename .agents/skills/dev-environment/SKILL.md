---
name: dev-environment
description: 'Run and operate the local stack and the Legacy Sports CLI: dev servers, Docker Compose, the canonical port map, per-OS setup, and admin/recovery CLI commands. Load when: starting local dev services, running the app or CLI, debugging a port/service conflict, seeding data, unblocking a stuck league, or operating in a Linux/cloud session.'
metadata:
  scope: 'lambdas/**, apps/**, lib/**'
---

# Skill: Dev Environment (run and operate)

Canonical home for **running** the Legacy Sports stack locally and **operating** it via the CLI. Validation (`make pc-*` / `nx_run_pc_chunk`) is a different concern — see [repo-tooling](../repo-tooling/SKILL.md) and, for cloud sessions, [cloud-agent-mode](../cloud-agent-mode/SKILL.md).

> The CLI skill (`cli-usage`) was merged into this skill on 2026-07-02. Full command catalog: [references/cli-commands.md](references/cli-commands.md).

## Port map (canonical — link here, do not restate)

| Port | Service                                        | Started by                                         | Defined in                                              |
| ---- | ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| 4200 | Web app dev server (Vite + React, not Next.js) | `make dev-web` / `pnpm exec nx serve web`          | `apps/web/vite.config.mts` (`server.port`)              |
| 4200 | GraphQL explorer (GraphiQL) — **collides**     | `make graphiql` / `pnpm run graphiql`              | `apps/graphql-explorer/vite.config.mts` (`server.port`) |
| 4280 | web-e2e preview (`vite preview` of built app)  | Playwright `webServer` (auto)                      | `apps/web-e2e/playwright.config.ts` (`E2E_PORT`)        |
| 4300 | GraphQL explorer preview                       | `nx preview graphql-explorer`                      | `apps/graphql-explorer/vite.config.mts` (`preview`)     |
| 5000 | GraphQL API (`lambdas/db`, Apollo)             | `make dev-graphql` / `pnpm exec nx run db:serve`   | `lambdas/db/src/dev.ts` (`const PORT`)                  |
| 5001 | OAuth proxy (`lambdas/oauth-proxy`)            | `pnpm run dev:oauth`                               | `lambdas/oauth-proxy/src/dev.ts`                        |
| 5002 | Stats Lambda (`lambdas/stats-lambda`)          | `pnpm run dev:stats`                               | `lambdas/stats-lambda/src/dev.ts`                       |
| 5003 | Game selection (`lambdas/game-selection`)      | `pnpm run dev:game-selection`                      | `lambdas/game-selection/src/dev.ts`                     |
| 5432 | PostgreSQL (Docker container or SSM tunnel)    | `docker compose up -d postgres` / `make db-tunnel` | `docker-compose.yml` / Makefile `db-tunnel`             |
| 6009 | Storybook (`lib/shared-components`)            | `make dev-storybook` / `pnpm run storybook`        | `lib/shared-components/project.json` (`storybook.port`) |

**4200 collision**: the web dev server sets `strictPort: true` — if the explorer grabbed 4200 first, `nx serve web` exits with a port error. The explorer does **not** set `strictPort`, so started second it silently moves to 4201+. Start the web server first, then the explorer, and read the explorer's startup log for its actual port.

## What each start command actually runs (verified)

| Command                            | Actually starts                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `make dev`                         | `scripts/start-dev-services.js` → the **four lambdas only** (5000–5003). **Not** web, **not** postgres. |
| `make dev-web` / `pnpm start`      | Vite dev server for `apps/web` on 4200 (`nx serve web` / `nx dev web` — same executor)                  |
| `pnpm run dev:web`                 | Windows-only auto-restart wrapper (`scripts/dev-web.ps1`) around `nx serve web`                         |
| `make dev-db` / `make dev-graphql` | `nx run db:serve` → `tsx watch src/dev.ts` on 5000 (watch mode is built in — no `--watch` flag)         |
| `make dev-storybook`               | `storybook dev -p 6009` in `lib/shared-components`                                                      |
| `make dev-mobile`                  | `nx start app` (Expo)                                                                                   |
| `make docker-up`                   | `docker compose up -d --build` — full stack incl. postgres and migrations                               |

For agents: every command above is long-running and never exits. Run it with `run_in_background: true`, and stop all background processes when done (`make kill-stale` on Windows; on Linux just kill the background shells).

## Prerequisites (before starting anything)

1. **Health check**: `make dev-env-health` (or `node scripts/dev-env-health-check.js --json` for structured output). Checks node_modules, .env files, pnpm, Docker, ports, migrations in one pass.
2. **Dependencies**: `make install` (on Windows worktrees this links the node_modules pool — never raw `pnpm install` through a worktree symlink; see AGENTS.md).
3. **Environment file**: see the per-OS bootstrap below. Docker Compose refuses to start without a `.env` file present.
4. **Migrations**: home is the [database](../database/SKILL.md) skill (`db_migration_status` → `db_migrate`; shell fallback `pnpm --prefix lib/db-client run db:status` / `db:up`). The Docker stack runs migrations automatically via its `migrate` service.

### Environment bootstrap per OS

| Environment              | Command                                          | Notes                                                                                                                      |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Windows                  | `make sync-env` → `scripts/sync-env.ps1`         | Pulls real values from AWS; requires valid AWS credentials                                                                 |
| Linux / macOS / Git Bash | `make sync-env` → `scripts/sync-env.sh`          | Same; requires AWS CLI credentials                                                                                         |
| Cloud agent (no AWS)     | `cp .env.example .env` then use the Docker stack | `.env.docker` (committed) overrides `.env` with working local DB creds and dev auth secrets, so the stack runs without AWS |

Precondition for `sync-env`: valid AWS credentials already exist. When any command fails with an auth/expired-token error, stop and surface the hint verbatim per [mcp-first Auth Model](../mcp-first/SKILL.md#auth-model) — re-auth commands (`aws sso login`, `gh auth login`, `ls-cli auth login`) are **user-only** actions (AGENTS.md Tier 1).

## Two ways to run the stack

**A. Docker Compose (recommended for full stack, and the only path without AWS):**

```bash
make docker-up          # = docker compose up -d --build
```

PostgreSQL + migrations + all four lambdas + web, wired together via `.env` + `.env.docker`. Details, logs, rebuilds, troubleshooting: [references/docker-local.md](references/docker-local.md).

**B. Native processes (faster iteration on one service):**

```bash
# Terminal 1 — backend lambdas (5000-5003)
make dev
# Terminal 2 — web on 4200
make dev-web
```

Native lambdas read the database from `.env` (`DATABASE_URL` / `DB_*`) — point them at the Docker postgres (`docker compose up -d postgres`, then use the `DATABASE_URL` value from `.env.docker` with `postgres:5432` replaced by `localhost:5432`) or at the dev RDS via `make db-tunnel` (Linux/Git Bash only).

Quick service health check: `make check-services` (probes `/health` on 5000–5003).

## OS support matrix (run-and-operate targets)

| Target                                | Windows | Linux/macOS | Notes                                                                                                                                                |
| ------------------------------------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `make install` / `dev*` / `docker-up` | ✅      | ✅          | `install` routes to the modules-pool linker on Windows                                                                                               |
| `make sync-env`                       | ✅      | ✅          | `.ps1` on Windows, `.sh` elsewhere; both need AWS creds                                                                                              |
| `make kill-stale`                     | ✅      | ⛔ stub     | Prints "Windows-only"; on Linux, kill your background shells instead                                                                                 |
| `make db-restore-dev` / `db-dump-dev` | ✅      | ⛔ stub     | PowerShell scripts; prints a Windows-only message elsewhere                                                                                          |
| `make db-tunnel`                      | ⛔ stub | ✅          | Prints "requires bash" whenever `OS=Windows_NT` (even under Git Bash); use WSL, or the hosted `db_query` MCP tool ([database](../database/SKILL.md)) |
| `scripts/db-query.ps1`                | ✅      | ⛔          | Data queries against dev RDS; cross-platform alternative: `ls-cli query-db` or the hosted `db_query` MCP tool ([database](../database/SKILL.md))     |
| `pnpm run dev:web` wrapper            | ✅      | ⛔          | Plain `make dev-web` works everywhere                                                                                                                |

## The Legacy Sports CLI

Admin, data-loading, and debugging commands live in one Commander program: `apps/cli/src/main.ts`. Full catalog (all commands, grouped by task, with options): [references/cli-commands.md](references/cli-commands.md).

### Invocation per environment

| Environment              | Command                                           | Notes                                                                            |
| ------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Windows PowerShell       | `.\ls-cli.ps1 <command> [options]`                | Sets a 4 GB Node heap for large player loads                                     |
| Linux / macOS / Git Bash | `./ls-cli.sh <command> [options]`                 | Both wrappers run `tsx` directly — need `node_modules/.bin/tsx` (`make install`) |
| Docker stack             | `docker compose run --rm cli <command> [options]` | No local Node env needed; runs against the compose postgres                      |
| Nx                       | `pnpm exec nx start cli -- <command> [options]`   | Equivalent; `--` separates CLI args from nx args                                 |
| pnpm shortcuts           | `pnpm run cli:<name>`                             | Only a subset is registered in root `package.json` `scripts`                     |

### Recovery / admin quick reference

| Situation                                            | Command                                                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft finished but matchups never generated          | `./ls-cli.sh unblock-league --id <leagueId>`                                                                                                                      |
| Player stats stuck in failed state                   | `./ls-cli.sh retry-failed-players --dry-run` then without `--dry-run`                                                                                             |
| Leaked E2E/integration test leagues                  | `./ls-cli.sh cleanup-test-leagues --dry-run`                                                                                                                      |
| Leaked `int-*@test.legacysports.dev` users (LS-4917) | `./ls-cli.sh cleanup-test-users --dry-run`                                                                                                                        |
| Same person with two accounts (LS-7821)              | `./ls-cli.sh find-duplicate-accounts` → `merge-accounts --dry-run`                                                                                                |
| Grant a user admin                                   | `./ls-cli.sh set-user-type --email <email> --type admin` — runbook: [docs/operations/promote-user-to-admin.md](../../../docs/operations/promote-user-to-admin.md) |

Destructive commands (`reset-database`, `delete-league`, `merge-accounts`, `cleanup-*`) require an explicit `--confirm`/`--yes` flag and support `--dry-run` where listed — always dry-run first. More oncall runbooks: [docs/operations/](../../../docs/operations/README.md).

## Where outputs land

| Output                         | Location                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Nx builds                      | `dist/` (e.g. `dist/apps/web`, `dist/storybook`)                                 |
| Jest coverage                  | `coverage/<project path>` (e.g. `coverage/lambdas/db`)                           |
| Playwright results (local)     | `apps/web-e2e/test-results/` — `summary.md` (agent-readable) + `results.json`    |
| Ad-hoc scripts, bundle reports | `scratch/` (gitignored; `scratch/bundle-report.html` from the bundle visualizer) |

## Related skills

- [database](../database/SKILL.md) — migrations, queries, schema, dev RDS access
- [repo-tooling](../repo-tooling/SKILL.md) — build/lint/typecheck, Make targets, modules pool
- [mcp-first Auth Model](../mcp-first/SKILL.md#auth-model) — auth-error protocol (check before use; never generate tokens)
- [cloud-agent-mode](../cloud-agent-mode/SKILL.md) — cloud platform bindings and validation paths
- [testing](../testing/SKILL.md) — running unit/E2E/integration suites
- [debugging](../debugging/SKILL.md) — when a running service misbehaves
- [infrastructure](../infrastructure/SKILL.md) — deploying lambdas to AWS (nothing in this skill deploys)

## Provenance and maintenance

Rewritten 2026-07-02 from the Phase-1 skills audit (`scratch/skills-audit/synthesis.json`, run-and-operate assignment): the previous `references/dev-web.md` and `references/dev-db-lambda.md` described a Next.js/port-3000 stack that never matched `apps/web` (Vite/4200) and were deleted; `cli-usage` was merged in. Re-verify volatile facts:

- Web/explorer ports: `grep -n "port" apps/web/vite.config.mts apps/graphql-explorer/vite.config.mts`
- E2E preview port: `grep -n "E2E_PORT" apps/web-e2e/playwright.config.ts`
- Lambda ports: `grep -rn "const PORT" lambdas/*/src/dev.ts`
- Storybook port: `grep -n "port" lib/shared-components/project.json`
- `make dev` scope: `grep -n "dev:" Makefile package.json` and read `scripts/start-dev-services.js`
- CLI command list: `grep -n "\.command(" apps/cli/src/main.ts`
- Wrapper behavior: read `ls-cli.ps1` / `ls-cli.sh` and the `cli` service in `docker-compose.yml`
- OS forks: `grep -n "DETECTED_OS" Makefile` around `sync-env`, `kill-stale`, `db-restore-dev`
