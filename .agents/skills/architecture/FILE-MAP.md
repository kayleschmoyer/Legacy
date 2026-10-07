---
name: file-map
description: Machine-readable lookup table mapping capabilities/concepts to canonical file paths. Load this before doing broad Glob searches — cite the path directly and skip the sweep.
---

# File Map — Canonical Paths by Capability

Use this as the **first stop** before running Glob/Grep exploration. If the concept you're looking for is listed here, go straight to the file. Only fall back to broad Glob sweeps for things not listed. Every path below is verified against the tree as of the date in [Provenance](#provenance-and-maintenance); the Nx project name is what `nx run <name>:<target>` expects.

---

## Apps (`apps/`)

| App                          | Nx project         | Root path                | Notes                                                                                                                                                                                                                  |
| ---------------------------- | ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web (Vite + React)           | `web`              | `apps/web/src/`          | `react-router-dom` BrowserRouter; dev server port 4200. NOT Next.js.                                                                                                                                                   |
| Mobile (React Native / Expo) | `app`              | `apps/app/src/`          |                                                                                                                                                                                                                        |
| CLI                          | `cli`              | `apps/cli/src/`          | Admin/ops commands — see [dev-environment](../dev-environment/SKILL.md) + its [CLI catalog](../dev-environment/references/cli-commands.md)                                                                             |
| GraphQL explorer (dev tool)  | `graphql-explorer` | `apps/graphql-explorer/` | Vite app for browsing the GraphQL API                                                                                                                                                                                  |
| Video (Remotion)             | —                  | `apps/video/`            | `@legacy-sports/video`; no `project.json` — not an Nx project                                                                                                                                                          |
| Web E2E tests (Playwright)   | `web-e2e`          | `apps/web-e2e/`          | Hermetic suite in `src/tests/`; live-backend suite in `src/integration/tests/`; dual-mode in `src/tests/shared/`; `src/driver/` is the WDIO/Appium `AppiumNativeDriver` that runs the shared suite natively (ADR-0018) |
| CLI E2E tests                | `cli-e2e`          | `apps/cli-e2e/`          |                                                                                                                                                                                                                        |

## Lambdas (`lambdas/`)

| Lambda          | Nx project        | Root path                      | Purpose                                                                                                                                    |
| --------------- | ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GraphQL API     | `db`              | `lambdas/db/src/`              | Apollo Server + Pothos schema builder; the main API. Committed SDL snapshot: `lambdas/db/schema.graphql` (regen: `nx run db:print-schema`) |
| OAuth / auth    | `oauth-proxy`     | `lambdas/oauth-proxy/src/`     | OAuth providers (Google, Apple, Discord, device flow, identity linking in `src/handlers/`) + JWT issuing                                   |
| Stats ingest    | `stats-lambda`    | `lambdas/stats-lambda/src/`    | Multi-sport stats ingestion; routes by SQS message shape (baseball: Baseball Reference, football: Pro Football Reference)                  |
| Draft processor | `draft-processor` | `lambdas/draft-processor/src/` | Live draft events: pick submissions, auto-picks on timer expiry, state transitions (SQS)                                                   |
| Game selection  | `game-selection`  | `lambdas/game-selection/src/`  | Selects real games for fantasy matchups (SQS; runs outside the VPC)                                                                        |
| Notifications   | `notifications`   | `lambdas/notifications/src/`   | Push notification delivery (SQS batch consumer)                                                                                            |
| WebSocket       | `websocket`       | `lambdas/websocket/src/`       | API Gateway WebSocket connection management for real-time events                                                                           |
| Apple IAP       | `apple-iap`       | `lambdas/apple-iap/src/`       | App Store Server Notifications v2 (in-app purchase lifecycle)                                                                              |
| Stripe webhook  | `stripe-webhook`  | `lambdas/stripe-webhook/src/`  | Stripe payment/subscription events                                                                                                         |
| GitHub webhook  | `github-webhook`  | `lambdas/github-webhook/src/`  | GitHub event handling for CI/agent automation                                                                                              |
| Jira proxy      | `jira-proxy`      | `lambdas/jira-proxy/src/`      | Jira API proxy so CI/agents don't hold Jira credentials                                                                                    |
| Image upload    | `image-upload`    | `lambdas/image-upload/src/`    | S3 image upload presigning with league-membership authorization                                                                            |
| Rollbar→Discord | `rollbar-discord` | `lambdas/rollbar-discord/src/` | Forwards Rollbar occurrences to a Discord webhook                                                                                          |
| Shared layers   | —                 | `lambdas/layers/`              | Lambda layers (e.g. `node-pg` database driver) shared across functions                                                                     |

## Shared Libraries (`lib/`)

All are Nx projects whose project name equals the directory name. Import alias is `@legacy-sports/<name>` unless noted.

| Library             | Root path                    | What it contains                                                                                                                 |
| ------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `analytics`         | `lib/analytics/src/`         | Cross-platform user event tracking                                                                                               |
| `api`               | `lib/api/src/`               | Shared API client/request utilities; own codegen output at `src/shared/graphql.generated.ts`                                     |
| `app-config`        | `lib/app-config/src/`        | Central client config key registry (`src/lib/registry.ts`, `clientSafe` inlining rules)                                          |
| `aws-utils`         | `lib/aws-utils/src/`         | SSM, Secrets Manager helpers                                                                                                     |
| `bref-client`       | `lib/bref-client/src/`       | Baseball Reference data client                                                                                                   |
| `codegen`           | `lib/codegen/`               | Shared GraphQL codegen base config (`codegen.base.ts`); alias `@legacy-sports/codegen-base`; no package.json                     |
| `data-loaders`      | `lib/data-loaders/src/`      | DataLoader batching/caching for GraphQL resolvers (N+1 prevention)                                                               |
| `db-client`         | `lib/db-client/src/`         | Drizzle schema, domain services, migrations — see [Database](#database--key-paths)                                               |
| `design-tokens`     | `lib/design-tokens/src/`     | Colors, spacing, radii, shadows, breakpoints                                                                                     |
| `env-utilities`     | `lib/env-utilities/src/`     | Env var access helpers                                                                                                           |
| `graphql`           | `lib/graphql/src/`           | **Canonical home for UI GraphQL operations**: `src/*.graphql` → `src/graphql.generated.ts` (typed Apollo hooks)                  |
| `logging`           | `lib/logging/src/`           | `LOGGER` export (use instead of `console.*`); forwards error/fatal to Rollbar via output destination                             |
| `mcp-bearer-auth`   | `lib/mcp-bearer-auth/src/`   | Bearer-token validation for the hosted HTTP MCP server Lambdas                                                                   |
| `mcp-format`        | `lib/mcp-format/src/`        | Token-efficient response formatting for in-repo MCP servers                                                                      |
| `mlb-client`        | `lib/mlb-client/src/`        | MLB Stats API client (baseball only)                                                                                             |
| `narrative`         | `lib/narrative/src/`         | Matchup recap narrative generation (`generateMatchupRecap`)                                                                      |
| `pfr-client`        | `lib/pfr-client/src/`        | Pro Football Reference data client (players, career stats, IDP, team defense)                                                    |
| `rollbar`           | `lib/rollbar/src/`           | Rollbar init/capture; per-platform entry points `@legacy-sports/rollbar{,/web,/native}`                                          |
| `scheduling`        | `lib/scheduling/src/`        | Matchup scheduling algorithms; alias only (no package.json)                                                                      |
| `scoring`           | `lib/scoring/src/`           | Fantasy scoring logic — pure, no DB (bundled into web/mobile)                                                                    |
| `scoring-utils`     | `lib/scoring-utils/src/`     | **The one way to score a matchup and persist it** (`scoreMatchup`); server-only, sits between `db-client` and `scoring`          |
| `shared-components` | `lib/shared-components/src/` | Cross-platform Tamagui UI — see [shared-components-first](../shared-components-first/SKILL.md)                                   |
| `tamagui-config`    | `lib/tamagui-config/src/`    | Tamagui theme/config                                                                                                             |
| `test-fixtures`     | `lib/test-fixtures/src/`     | Shared test data / factories                                                                                                     |
| `ui-abstractions`   | `lib/ui-abstractions/src/`   | Cross-platform UI primitives                                                                                                     |
| `utils`             | `lib/utils/src/`             | General utilities incl. `src/lib/entitlements.ts` (premium entitlement map — see [add-entitlement](../add-entitlement/SKILL.md)) |
| `websocket-client`  | `lib/websocket-client/src/`  | Framework-agnostic WebSocket client (web / RN / Node)                                                                            |

## GraphQL — Key Paths

| What                                        | Path                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema entry point (Pothos)                 | `lambdas/db/src/schema/index.ts` (builder: `lambdas/db/src/schema/builder.ts`)                                                              |
| Apollo server / handler / context           | `lambdas/db/src/server/` (`apollo.ts`, `handler.ts`, `context.ts`)                                                                          |
| Lambda entry                                | `lambdas/db/src/index.ts`                                                                                                                   |
| Authorization / entitlement checks (server) | `lambdas/db/src/schema/authorization.ts`, `lambdas/db/src/schema/entitlements.ts`                                                           |
| Committed SDL schema snapshot               | `lambdas/db/schema.graphql` — regenerate with `pnpm exec nx run db:print-schema`                                                            |
| UI operations (queries/mutations/fragments) | `lib/graphql/src/*.graphql` → generated hooks in `lib/graphql/src/graphql.generated.ts`                                                     |
| Shared codegen base config                  | `lib/codegen/codegen.base.ts` (documents glob `src/api/db/**/*.graphql` for non-UI packages)                                                |
| All committed `graphql.generated.ts` files  | `lib/graphql`, `lib/api`, `lib/bref-client`, `lib/data-loaders`, `lambdas/oauth-proxy`, `apps/cli` (`git ls-files '*graphql.generated.ts'`) |

Regenerate everything with `make codegen` — see [architecture SKILL](SKILL.md#graphql-operations-and-codegen) for why it uses `run-many`, not `affected`.

## Database — Key Paths

| What                             | Path                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Drizzle models (`public` schema) | `lib/db-client/src/drizzle/public/models/`                                                                     |
| Drizzle `app_internal` schema    | `lib/db-client/src/drizzle/internal/`                                                                          |
| Migrations                       | `lib/db-client/migrations/`                                                                                    |
| Domain services                  | `lib/db-client/src/lib/services/` (`LeagueService`, `PlayerService`, `ScoringService`, `StatisticsService`, …) |
| Enums                            | `lib/db-client/src/drizzle/public/models/Enums.ts`                                                             |

## Multi-Sport Key Files

| What                                        | Path                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| Sport config (`SPORT_CONFIGS`, `SportKind`) | `lib/shared-components/src/config/sports.ts`                              |
| Leagues sport discriminator                 | `lib/db-client/src/drizzle/public/models/Leagues.ts` (`sport` column)     |
| Players sport + `pfr_id`                    | `lib/db-client/src/drizzle/public/models/Players.ts`                      |
| Football stat tables (Drizzle)              | `lib/db-client/src/drizzle/public/models/FootballStatistics.ts`           |
| NFL teams table (Drizzle)                   | `lib/db-client/src/drizzle/public/models/FootballTeams.ts`                |
| Sport-tagged lookup tables                  | `lib/db-client/src/drizzle/public/models/Sports.ts`                       |
| Stats-lambda message router                 | `lambdas/stats-lambda/src/index.ts`                                       |
| Sport-specific draft strategies             | `lambdas/db/src/schema/drafts/strategies/` (`baseball.ts`, `football.ts`) |
| Multi-sport architecture doc                | `docs/architecture/multi-sport.md`                                        |

## DB Integration Tests (`*.db.spec.ts`)

| What                            | Path                                          |
| ------------------------------- | --------------------------------------------- |
| Test spec files                 | `lambdas/db/src/schema/*.db.spec.ts`          |
| Test setup / fixtures / cleanup | `lambdas/db/integration-test-setup.ts`        |
| Jest config                     | `lambdas/db/jest.db.config.ts`                |
| Global setup / teardown         | `lambdas/db/integration-test-global-setup.ts` |
| Test data fixtures (JSON)       | `lambdas/db/src/__fixtures__/`                |
| Nx target                       | `db:test:db`                                  |

See `.agents/skills/testing/references/db-integration-tests.md` for patterns and rules.

## Cross-Platform E2E Architecture (ADR-0015 / ADR-0016)

| What                                                | Path                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| ADR-0015 — Semantic Page Object Model               | `docs/decisions/0015-semantic-page-objects.md`                                |
| ADR-0016 — Test DI (platform + backend seams)       | `docs/decisions/0016-test-dependency-injection.md`                            |
| Platform driver seam (`AppDriver` / `UIElement`)    | `apps/web-e2e/src/driver/` (`types.ts` contract, `playwright-web.driver.ts`)  |
| `BaseScreen` / `BasePage` base classes              | `apps/web-e2e/src/base/`                                                      |
| Backend seam + `TestData` fixtures                  | `apps/web-e2e/src/fixtures/dual.ts`, `apps/web-e2e/src/fixtures/test-data.ts` |
| Dual-mode specs (one body, mock + live)             | `apps/web-e2e/src/tests/shared/*.dual.spec.ts`                                |
| Maestro visual-sweep workspace (NOT functional e2e) | `maestro/` — see [mobile-qa](../mobile-qa/SKILL.md)                           |

Suite-role split and authoring rules: [testing § Cross-Platform Suite Roles](../testing/SKILL.md#cross-platform-suite-roles-adr-0015--adr-0016).

## Authentication

| What                                      | Path                                                                                                            |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| OAuth provider handlers                   | `lambdas/oauth-proxy/src/handlers/` (`Google.ts`, `Apple.ts`, `Discord.ts`, `DeviceFlow.ts`, `IdentityLink.ts`) |
| JWT utilities                             | `lambdas/oauth-proxy/src/util/jwt.ts`                                                                           |
| Secure token storage (web + native split) | `lib/shared-components/src/utils/SecureStorage.ts` / `SecureStorage.native.ts`                                  |
| Client auth service                       | `lib/shared-components/src/features/auth/services/AuthService.ts`                                               |
| Multi-provider identity doc               | `docs/architecture/multi-provider-identity.md`                                                                  |

## Infrastructure & Monitoring

| What                     | Path                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Terraform — app infra    | `terraform/main/` (own state + `secrets.auto.tfvars`)                                                                      |
| Terraform — runner fleet | `terraform/runners/` (own state; Packer AMI at `terraform/runners/packer/`)                                                |
| CI/CD workflows          | `.github/workflows/`                                                                                                       |
| Lambda deploy script     | `scripts/deploy-lambda.ps1`                                                                                                |
| Rollbar client library   | `lib/rollbar/src/` (error monitoring — the repo uses Rollbar, not Sentry)                                                  |
| Rollbar sourcemap upload | `tools/vite-configs/rollbar-sourcemap-plugin.ts` (wired in `apps/web/vite.config.mts`; token supplied by `deploy-web.yml`) |

Terraform is a **two-state split** (post-LS-2425): `main/` and `runners/` are separate states with separate secrets files. Never `cd terraform` — use `terraform -chdir=terraform/main …` / `-chdir=terraform/runners …`. Home: [infrastructure](../infrastructure/SKILL.md).

## MCP Servers (`tools/mcp/`)

Per-server tool lists, server IDs, and stdio-vs-hosted transport live in `tools/mcp/README.md` (stdio registrations: `.mcp.json`); the tool-vs-shell routing table lives in [mcp-first](../mcp-first/references/substitutions.md).

| Server dir                      | What it serves                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `tools/mcp/github-server/`      | PR/label/review/thread operations                                                          |
| `tools/mcp/ci-server/`          | GitHub Actions run triage, logs, reruns, dispatch                                          |
| `tools/mcp/jira-server/`        | Jira ticket CRUD/transitions with guardrails                                               |
| `tools/mcp/db-admin-server/`    | Hosted `db_query` / `db_migration_status` / `db_migrate` (dev RDS over HTTPS, tunnel-free) |
| `tools/mcp/rollbar-server/`     | Rollbar item/occurrence triage (`rollbar_*` tools)                                         |
| `tools/mcp/discord-server/`     | Hosted read-only Discord notes-channel reader (`discord_*` tools)                          |
| `tools/mcp/worktree-server/`    | Worktree-aware git operations                                                              |
| `tools/mcp/make-server/`        | `make_run` and Make target wrappers                                                        |
| `tools/mcp/nx-server/`          | `nx_run`, `nx_run_affected`, `nx_run_pc_chunk`, …                                          |
| `tools/mcp/aws-server/`         | AWS read/ops helpers (requires local AWS credentials)                                      |
| `tools/mcp/browser-server/`     | Browser automation                                                                         |
| `tools/mcp/dev-process-server/` | Dev-process gate/artifact tooling                                                          |

## Config & Build

| What                   | Path                                              |
| ---------------------- | ------------------------------------------------- |
| Root `package.json`    | `package.json`                                    |
| Nx workspace config    | `nx.json`                                         |
| pnpm workspace         | `pnpm-workspace.yaml`                             |
| Root Makefile          | `Makefile`                                        |
| TypeScript root config | `tsconfig.base.json`                              |
| ESLint root config     | `.eslintrc.json` (there is no `eslint.config.js`) |
| Prettier config        | `.prettierrc`                                     |
| Vite shared plugins    | `tools/vite-configs/`                             |

## Agent Skills & Docs

| What                   | Path                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| All skills index       | `.agents/skills/`                                                  |
| This file map          | `.agents/skills/architecture/FILE-MAP.md`                          |
| PR lifecycle rules     | `.agents/skills/pr-lifecycle/SKILL.md`                             |
| Common review patterns | `.agents/skills/pr-lifecycle/references/common-review-patterns.md` |
| Workflow checklist     | `.agents/skills/workflow-overview/SKILL.md`                        |
| MCP gap audit          | `.agents/skills/mcp-first/references/gaps.md`                      |
| MCP tool mapping       | `.agents/skills/mcp-first/references/tool-surfaces.md`             |
| Subagent templates     | `.agents/skills/subagent-templates/SKILL.md`                       |

## Provenance and maintenance

Regenerated 2026-07-02 from the live tree during the skills-audit overhaul (Phase-1 audit found 6+ dead paths and 11 missing libs in the previous version). Re-verify volatile facts:

- Project inventory: `ls apps/ lambdas/ lib/ tools/mcp/` and compare against the tables above.
- Nx project names: `pnpm exec nx show projects` (or read each `project.json` `name`).
- Committed codegen outputs: `git ls-files '*graphql.generated.ts'`.
- Web port/stack: `grep -n '"port"' apps/web/project.json`; `grep -n BrowserRouter apps/web/src/main.tsx`.
- Terraform split: `ls terraform/` (expect `main/`, `runners/`, `README.md` only).
- Rollbar (not Sentry): `ls lib/rollbar/`; `grep -rn rollbarSourcemapPlugin apps/web/vite.config.mts`.
