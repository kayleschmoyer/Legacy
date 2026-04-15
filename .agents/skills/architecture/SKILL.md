---
name: architecture
description: 'Load when you need to understand where code lives, how apps/lambdas/libs connect, build system patterns, or cross-platform resolution. Use when planning features that span multiple projects or debugging import/dependency issues.'
---

# Skill: System Architecture

## Overview

High-level architecture reference for the Legacy Sports monorepo. Load this when you need to understand where code lives, how systems connect, or why certain patterns are used.

## System Overview

| Layer          | Technology                  |
| -------------- | --------------------------- |
| Mobile app     | React Native (Expo)         |
| Web app        | Next.js                     |
| Backend        | AWS Lambda + Apollo GraphQL |
| Database       | PostgreSQL + Drizzle ORM    |
| Infrastructure | Terraform on AWS            |
| Monorepo       | Nx + pnpm                   |

## Project Structure

```
apps/       — Applications (web, app/mobile, cli)
lib/        — Shared libraries (no build targets)
lambdas/    — AWS Lambda functions
terraform/  — Infrastructure as code
scripts/    — Build and utility scripts
docs/       — Documentation
```

---

## Build System (Nx Monorepo)

### Library vs App Targets

**Libraries (`lib/`)**:

- ✅ Have: `typecheck`, `lint`, `test`
- ❌ No `build` target — compiled by consuming apps/lambdas
- Source TypeScript resolved at app build time

**Apps & Lambdas (`apps/`, `lambdas/`)**:

- ✅ Have: `typecheck`, `lint`, `test`, `build`
- Compile their own code + all imported library code

**Implication**: `pnpm exec nx affected -t build` only affects apps/lambdas.

### Dependency Tier Order (build order matters)

1. Core: `env-utilities`, `logging`, `utils`
2. Platform: `tamagui-config`, `ui-abstractions`
3. Data: `db-client`, `aws-utils`
4. Business: `api`, `scoring`
5. UI: `shared-components`
6. Apps: `web`, `app`, `cli`
7. Lambdas: `db` (graphql), `oauth-proxy`, `stats-lambda`, etc.

---

## Cross-Platform Resolution

The codebase runs on both React Native and Next.js. Two systems handle platform differences:

### Magic Strings (complex components)

Used for icons, tables, OAuth providers:

```typescript
// Resolved at build time by platform alias
import { Icon } from '__PLATFORM_COMPONENTS__';
```

### Native File Resolution (utilities)

Used for DbOptions, SecureStorage, AwsSecrets:

```typescript
// Metro/webpack picks the right file automatically
// e.g., storage.native.ts (mobile) vs storage.ts (web)
```

---

## Database Architecture

**Two PostgreSQL schemas**:

- `public` — Fantasy league data (matchups, players, stats, scoring)
- `app_internal` — Authentication and system tables (users, game_stats, events)

**Pattern**: Season → Career aggregation

- `season_batting/pitching/fielding` — source data (tables)
- `career_*` — aggregated totals (views, read-only, AL/NL only)
- Drizzle ORM for type-safe queries

See [cli-usage](../cli-usage/SKILL.md) for database query tools and [repo-tooling](../repo-tooling/SKILL.md) for migration workflow.

---

## GraphQL API

- **Framework**: Apollo Server + Pothos schema builder
- **Custom domain**: `https://api.legacy-fantasy.com` (ACM cert + API GW custom domain + Route53 alias)
- **Type generation**: Codegen from schema → TypeScript types
- **Service layer**: `LeagueService`, `PlayerService`, `StatisticsService`, `ScoringService`, `DraftService`
- **Location**: `lambdas/db/` (the "db" lambda is the GraphQL Lambda)
- **Service location**: `lib/db-client/src/lib/services/`

### Service Layer Pattern

All domain services live in `lib/db-client/src/lib/services/` and follow this pattern:

```typescript
// Class with DbOptions constructor + factory function
export class FooService {
  constructor(private options: DbOptions) {}
  async doThing() { return runWithPublicClient(this.options, async (db) => { ... }); }
}
export function createFooService(options: DbOptions) { return new FooService(options); }
```

Services are registered on `DatabaseService` (the aggregate root) and re-exported from `@legacy-sports/db-client`.

### League Creation — Always Use `LeagueService`

**Never insert into the `leagues` table directly.** Use `LeagueService.createLeague()` — it atomically creates:

1. League row (with unique invite code)
2. Teams
3. Owner league membership
4. Roster positions
5. **Draft record** (ensures draft settings always exist)

Missing draft records cause the `startDraft` mutation to fall back to wrong defaults.

---

## Authentication

Two-Lambda system:

- `oauth-proxy` — OAuth verification + user token operations
- Primary: Google OAuth; Fallback: email/password
- JWT tokens stored with platform-specific secure storage

---

## Lambda Architecture (Decoupled Deployment)

Lambdas use a **two-phase deployment**:

1. **Phase 1** (parallel): Build + upload Lambda code to S3, update SSM parameter
2. **Phase 2** (single): Central Terraform run reads all SSM params and applies infrastructure

This eliminates Terraform lock contention when multiple Lambdas change simultaneously.

**Deployment order (local)**:

```powershell
node scripts/terraform-unlock.js    # 1. Clear any locks
cd terraform
terraform apply                     # 2. Apply infra changes (if any)
cd ..
.\scripts\deploy-lambda.ps1 -FunctionName graphql  # 3. Deploy code
```

---

## Critical Conventions

1. **Never import platform-specific files directly** — use abstractions
2. **Build libraries before apps**: `pnpm run build:libs`
3. **Use Nx affected**: `pnpm exec nx affected -t <target>`
4. **PowerShell**: Windows dev environment, `;` for chaining
5. **Conventional commits**: `type(scope): message` — always include the Jira ticket key somewhere in the message for linking (see `AGENTS.md` Environment Notes)
6. **Always add timestamps to new DB tables** — add `created_at` and `updated_at` columns to every new table
7. **Create leagues via `LeagueService.createLeague()`** — never raw-insert leagues. The service guarantees all related records (teams, positions, draft) are created together.
8. **Draft records must exist for every league** — `startDraft` and `initializeDraft` self-heal by upserting, but prevention is better than cure.
9. **Always `await` notification service calls** — never fire-and-forget. Lambda freezes the execution context after the handler returns; unawaited async work is silently killed. Wrap in try/catch so notification failure doesn't break the primary operation. See [WebSocket Notifications](../../docs/guides/websocket-notifications.md#critical-rules).
10. **Never use inline `gql` tags** — define queries/mutations in `src/api/db/**/*.graphql` files and run codegen. Inline `gql` bypasses codegen, producing `any` types and requiring unsafe casts. An ESLint rule enforces this. See [standards](../standards/SKILL.md) codegen policy and [repo-tooling](../repo-tooling/SKILL.md) for `make codegen`.

## Quick Reference (from AGENTS.md)

These summaries were previously inline in AGENTS.md:

- **GraphQL API**: Lives in `lambdas/db` (Apollo Server on Lambda). Schema changes require Drizzle migrations in `lib/db-client/migrations/` and regenerating types via `make codegen`.
- **Cross-platform components**: `lib/shared-components/src/platform-components/` -- `.native.ts` files are auto-resolved by Metro. The `__PLATFORM_COMPONENTS__` magic string is used for build-time resolution of more complex platform splits.
- **Database**: Drizzle ORM with PostgreSQL. Schema lives in `lib/db-client`. Always run `db_migration_status` and `db_migrate` MCP tools before `make pc`.
- **Logging**: Import `LOGGER` from `@legacy-sports/logging`. ESLint enforces `no-console`.
- **Testing**: Unit/integration: Jest (`make test`). Web E2E: Playwright (hermetic -- `route.fulfill()` only). Mobile E2E: WebdriverIO.

## Quick File Lookup

For a machine-readable capability → path index (use before running Glob sweeps): **[FILE-MAP.md](FILE-MAP.md)**

## Related Skills

- [cli-usage](../cli-usage/SKILL.md) — CLI for database operations and admin tasks
- [infrastructure](../infrastructure/SKILL.md) — AWS, Terraform, Lambda deployment
- [repo-tooling](../repo-tooling/SKILL.md) — Build system, Nx commands, Make targets
