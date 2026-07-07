---
name: architecture
description: 'System architecture ground truth: where code lives, how apps/lambdas/libs connect, load-bearing invariants, and the codegen model. Load when: planning features that span multiple projects, debugging import/dependency issues, or before broad Glob/Grep exploration (use FILE-MAP.md first).'
metadata:
  scope: '**'
---

# Skill: System Architecture

## Overview

High-level architecture reference for the Legacy Sports monorepo. Load this when you need to understand where code lives, how systems connect, or which invariants you must not break. For a capability → path lookup, go straight to **[FILE-MAP.md](FILE-MAP.md)**.

## System Overview

| Layer            | Technology                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web app          | **Vite + React** with `react-router-dom` (`BrowserRouter` in `apps/web/src/main.tsx`); dev server port 4200. NOT Next.js — any doc claiming Next.js or port 3000 is stale. |
| Mobile app       | React Native (Expo)                                                                                                                                                        |
| Backend          | AWS Lambda + Apollo GraphQL (Pothos schema builder)                                                                                                                        |
| Database         | PostgreSQL + Drizzle ORM                                                                                                                                                   |
| Error monitoring | Rollbar (`lib/rollbar`; `LOGGER.error/fatal` auto-forwards). The repo does not use Sentry.                                                                                 |
| Infrastructure   | Terraform on AWS — two states: `terraform/main/` + `terraform/runners/` (see [infrastructure](../infrastructure/SKILL.md))                                                 |
| Monorepo         | Nx + pnpm                                                                                                                                                                  |

## Project Structure

```
apps/       — Applications (web, app/mobile, cli, graphql-explorer, video) + e2e suites
lib/        — Shared libraries (see FILE-MAP.md for all of them)
lambdas/    — AWS Lambda functions + shared layers (lambdas/layers/)
terraform/  — Infrastructure as code (main/ + runners/, separate states)
tools/mcp/  — In-repo MCP servers   tools/vite-configs/ — shared Vite plugins
scripts/    — Build and utility scripts
docs/       — Documentation
```

---

## Invariants (verified in code — do not break)

Each row names the rule, why it exists, and the single home that teaches it in depth. Link the home; don't restate it elsewhere.

| Invariant                                                                                                                                                                                         | Why                                                                                                                                                                              | Home                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **`await` every async call inside Lambda handlers** (notifications especially), wrapped in try/catch                                                                                              | Lambda freezes the execution context when the handler returns; unawaited promises are silently killed mid-flight                                                                 | [docs/guides/websocket-notifications.md](../../../docs/guides/websocket-notifications.md#critical-rules) |
| **Create leagues only via `LeagueService.createLeague()`** — never raw-insert into `leagues`                                                                                                      | It runs one `db.transaction` creating league + teams + owner membership + roster positions + draft record; a missing draft record makes `startDraft` fall back to wrong defaults | `lib/db-client/src/lib/services/LeagueService.ts` (`createLeague`)                                       |
| **Per-game scores are never persisted** — only league-versioned scoring multipliers and matchup team totals are stored; per-game scores are recomputed on read                                    | Keeps history deterministic under scoring-profile versioning; retroactive scoring changes need no backfill                                                                       | [docs/architecture/matchup-system.md](../../../docs/architecture/matchup-system.md#3-scoring-engine)     |
| **The `sport` discriminator flows through every query** — `leagues.sport` and `players.sport` decide which sport-specific stat tables are joined; baseball and football never share a stats table | A query that omits the discriminator silently mixes sports or reads the wrong stat tables                                                                                        | [docs/architecture/multi-sport.md](../../../docs/architecture/multi-sport.md#sport-propagation)          |
| **Shared-components-first for all UI** — before building UI in `apps/web` or `apps/app`, check/extend `lib/shared-components`                                                                     | Web-only forks drift from native (the "kill X web fork" incident class); components adapt by viewport, not by app                                                                | [shared-components-first](../shared-components-first/SKILL.md)                                           |

---

## Build System (Nx Monorepo)

**Libraries (`lib/`)** have `typecheck`/`lint`/`test` targets but (with the single exception of `lib/api`, which has a Vite `build`) **no `build` target** — their TypeScript source is compiled by each consuming app/lambda at its own build time. **Apps and lambdas** have `build` and compile their own code plus all imported library code.

Implication: `pnpm exec nx affected -t build` builds apps/lambdas (plus `api`); there is no "build the libs first" step.

Approximate dependency tiers (lower tiers must not import higher ones):

1. Core: `env-utilities`, `logging`, `utils`
2. Platform: `tamagui-config`, `ui-abstractions`, `design-tokens`
3. Data: `db-client`, `aws-utils`, `mlb-client`, `bref-client`, `pfr-client`, `data-loaders`
4. Business: `api`, `graphql`, `scoring`, `scheduling`, `narrative`
5. UI: `shared-components`
6. Apps (`web`, `app`, `cli`) and lambdas

Check the real graph with `nx_dep_graph` / `pnpm exec nx graph` rather than trusting this list for edge cases.

---

## Cross-Platform Resolution

The same UI code runs on React Native (Metro) and web (Vite). Two systems handle platform splits:

- **Magic string** (complex components — icons, tables, OAuth providers): `import { Icon } from '__PLATFORM_COMPONENTS__'` — resolved at build time by a platform alias (web side: `apps/web/vite.config.mts`).
- **Native file resolution** (utilities): `Foo.native.ts` beside `Foo.ts` — Metro picks `.native.ts`, Vite picks `.ts` (e.g. `lib/shared-components/src/utils/SecureStorage.ts` / `.native.ts`).

Precondition: before importing anything platform-specific directly, check `lib/shared-components/src/platform-components/` for the existing abstraction.

---

## Database Architecture

- **Two PostgreSQL schemas**: `public` (fantasy league domain) and `app_internal` (auth/system tables; Drizzle: `lib/db-client/src/drizzle/internal/`).
- **Sport discriminator**: see [Invariants](#invariants-verified-in-code--do-not-break). Sport-specific stat tables, sport-tagged lookup tables (`sport_player_pools`, `sport_eras`), and the full table catalog are documented in [docs/architecture/multi-sport.md](../../../docs/architecture/multi-sport.md).
- **Migrations** live in `lib/db-client/migrations/` — workflow in [database](../database/SKILL.md).

### Service Layer Pattern

All domain services live in `lib/db-client/src/lib/services/` — class with a `DbOptions` constructor + `createFooService(options)` factory, queries wrapped in `runWithPublicClient`. Services are aggregated on the `DatabaseService` class in `lib/db-client/src/lib/services/index.ts` and re-exported from `@legacy-sports/db-client`.

---

## GraphQL Operations and Codegen

- **API**: Apollo Server + Pothos in `lambdas/db/` (the "db" lambda IS the GraphQL Lambda). Custom domain `https://api.legacy-fantasy.com`.
- **Schema snapshot**: `lambdas/db/schema.graphql` is committed; regenerate after schema changes with `pnpm exec nx run db:print-schema`. All codegen reads this file (or `GRAPHQL_SCHEMA` if set).
- **Operations home (UI)**: define queries/mutations/fragments in **`lib/graphql/src/*.graphql`**; codegen emits typed Apollo hooks to `lib/graphql/src/graphql.generated.ts`, imported as `@legacy-sports/graphql`. An ESLint `no-restricted-syntax` rule in `.eslintrc.json` rejects inline `gql` tags.
- **Other codegen consumers** keep their own document dirs (`src/api/db/**/*.graphql` via `lib/codegen/codegen.base.ts`; `lib/api` has its own list).
- **Six `graphql.generated.ts` files are committed** (`lib/graphql`, `lib/api`, `lib/bref-client`, `lib/data-loaders`, `lambdas/oauth-proxy`, `apps/cli` — verify: `git ls-files '*graphql.generated.ts'`). Every schema change must regenerate **all** of them or CI codegen drift checks fail.
- **Regenerate with `make codegen`** (or the `pc-db-prep` chunk). It intentionally uses `nx run-many -t codegen` instead of `affected` because inferred lib codegen targets don't track `schema.graphql` as an input (LS-5237 — see the comment above `_PC_CODEGEN_CMD` in the `Makefile`).

---

## Authentication

- `lambdas/oauth-proxy` — provider handlers (Google, Apple, Discord, device flow, identity linking) + JWT issuing; see [docs/architecture/multi-provider-identity.md](../../../docs/architecture/multi-provider-identity.md).
- Tokens stored client-side via the `SecureStorage` platform split (see FILE-MAP → Authentication).

---

## Deployment (pointer only)

Lambdas use two-phase decoupled deployment (build/upload to S3 + SSM, then a central Terraform apply). Terraform is split into two independent states — `terraform/main/` (app infra) and `terraform/runners/` (self-hosted runner fleet), post-LS-2425 — and every command uses `-chdir` (never `cd terraform`). The runbook, ordering rules, and cache warnings live in [infrastructure](../infrastructure/SKILL.md); Terraform change workflow in [terraform](../terraform/SKILL.md).

---

## Conventions

1. **Platform imports**: use the abstractions above, never direct platform-specific imports.
2. **Nx affected**: `pnpm exec nx affected -t <target>` for scoped work (prefer the `nx_run_affected` MCP tool).
3. **Commits**: `type(scope): message`, ticket key included (see `AGENTS.md`).
4. **New DB tables**: always add `created_at` and `updated_at` columns.
5. **GraphQL**: `.graphql` files + codegen, never inline `gql` (see [GraphQL section](#graphql-operations-and-codegen) and [standards](../standards/SKILL.md)).
6. **Logging**: `LOGGER` from `@legacy-sports/logging`; ESLint enforces `no-console` (exceptions listed in `AGENTS.md`).

## Quick File Lookup

Machine-readable capability → path index (use before Glob sweeps): **[FILE-MAP.md](FILE-MAP.md)**

## Related Skills

- [infrastructure](../infrastructure/SKILL.md) — AWS, Terraform two-state operations, Lambda deployment, Rollbar/CloudWatch debugging
- [database](../database/SKILL.md) — migrations, queries, schema management
- [domain-reference](../domain-reference/SKILL.md) — product + data-model ground truth (what the entities mean)
- [repo-tooling](../repo-tooling/SKILL.md) — build system, Nx commands, Make targets
- [shared-components-first](../shared-components-first/SKILL.md) — UI placement rules
- [dev-environment](../dev-environment/SKILL.md) — running the stack locally (ports, services) and CLI admin/database commands (absorbed `cli-usage` 2026-07-02)

## Provenance and maintenance

Rewritten 2026-07-02 during the skills-audit overhaul (Phase-1 audit: Next.js/port-3000 claims, single-state terraform, wrong GraphQL operations home). Re-verify volatile facts:

- Web stack/port: `grep -n BrowserRouter apps/web/src/main.tsx`; `grep -n '"port"' apps/web/project.json`.
- Rollbar not Sentry: `ls lib/rollbar/ lib/sentry/` (the latter must not exist).
- Terraform split: `ls terraform/`.
- Committed codegen outputs: `git ls-files '*graphql.generated.ts'`.
- run-many rationale: `grep -n -B3 _PC_CODEGEN_CMD Makefile | head`.
- Inline-gql ban: `grep -n "TaggedTemplateExpression" .eslintrc.json`.
- LeagueService atomicity: `grep -n "db.transaction" lib/db-client/src/lib/services/LeagueService.ts`.
- Await rule home: `grep -n "ALWAYS" docs/guides/websocket-notifications.md`.
