# Architecture Summary (Condensed)

## System Overview

**Platform**: Cross-platform sports data management system
**Frontend**: React Native (mobile) + Next.js (web)
**Backend**: AWS Lambda + GraphQL
**Database**: PostgreSQL + Drizzle ORM

## Key Architectural Patterns

### 1. Cross-Platform Resolution

**Two Systems**:

- **Magic Strings** (`__PLATFORM_COMPONENTS__`) - Complex UI components
- **Native Resolution** (`.native.ts` files) - Simple utilities

**When to use:**

- Magic strings: Icons, Tables, OAuth providers (complex components)
- Native resolution: DbOptions, SecureStorage, AwsSecrets (utilities)

### 2. Database Design

**Pattern**: Season → Career aggregation

- `season_batting/pitching/fielding` - Source data
- `career_*` views - Aggregated totals (AL/NL only)
- Drizzle ORM for type safety

**Key Tables**:

- `players` - Master registry
- `leagues`, `teams` - Fantasy league structure
- `matchups` - Head-to-head competition
- `team_members` - Player rosters

### 3. Build System (Nx Monorepo)

**Tier Structure** (build in order):

1. Core: `env-utilities`, `logging`, `utils`
2. Platform: `tamagui-config`, `ui-abstractions`
3. Data: `db-client`, `aws-utils`
4. Business: `api`, `scoring`
5. UI: `shared-components`
6. Apps: `web`, `app`, `cli`
7. Lambdas: `db`, `oauth-proxy`, etc.

**Commands**:

```powershell
pnpm run build:libs    # Libraries only
pnpm run build:apps    # Applications only
pnpm exec nx affected -t build  # Only changed projects
```

### 4. GraphQL API

**Architecture**: Apollo Server + Pothos schema builder
**Resolvers**: Type-safe resolvers with automatic type generation
**Services**: Database access through service layer

- `PlayerService`, `StatisticsService`, `ScoringService`

### 5. Authentication

**Two-Lambda System**:

- `oauth-proxy` - OAuth verification + user operations
- User management in database

**Flows**:

- Google OAuth (primary)
- Email/password (fallback)
- JWT tokens with secure storage

## Project Structure

```
apps/           # Applications (web, mobile, CLI)
lib/            # Shared libraries
lambdas/        # AWS Lambda functions
docs/           # Documentation
scripts/        # Build and utility scripts
terraform/      # Infrastructure as code
```

## Critical Conventions

1. **Never import platform-specific files directly** - Use abstractions
2. **Build libraries before apps** - Respect dependency order
3. **Use Nx affected commands** - Only build/test changed code
4. **PowerShell syntax** - Windows development environment
5. **Conventional commits** - `type(scope): message` format

## Full Documentation

For detailed information, load specific files:

- Platform system: `docs/architecture/cross-platform-system.md`
- Database: `docs/architecture/database-schema.md`
- Build system: `docs/architecture/build-system.md`
- GraphQL: `docs/architecture/graphql-integration.md`
