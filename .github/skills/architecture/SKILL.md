---
name: architecture
description: 'High-level architecture reference for the Legacy Sports monorepo: project structure, how apps/lambdas/libs connect, build system patterns, and cross-platform resolution.'
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

See [db-schema.md](db-schema.md) for full schema reference and [db-query.md](db-query.md) for running queries.

---

## GraphQL API

- **Framework**: Apollo Server + Pothos schema builder
- **Type generation**: Codegen from schema → TypeScript types
- **Service layer**: `PlayerService`, `StatisticsService`, `ScoringService`
- **Location**: `lambdas/db/` (the "db" lambda is the GraphQL Lambda)

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
5. **Conventional commits**: `type(scope): message`
6. **Always add timestamps to new DB tables** — see [db-migration-write.md](db-migration-write.md)

## Related Skills

- [db-schema.md](db-schema.md) — Database schema reference
- [build.md](build.md) — Build system details
- [deploy-lambda.md](deploy-lambda.md) — Lambda deployment
- [affected-check.md](affected-check.md) — Nx dependency graph
