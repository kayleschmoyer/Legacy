---
name: file-map
description: Machine-readable lookup table mapping capabilities/concepts to canonical file paths. Load this before doing broad Glob searches — cite the path directly and skip the sweep.
---

# File Map — Canonical Paths by Capability

Use this as the **first stop** before running Glob/Grep exploration. If the concept you're looking for is listed here, go straight to the file. Only fall back to broad Glob sweeps for things not listed.

---

## Apps

| App                            | Root path       |
| ------------------------------ | --------------- |
| Web (Next.js)                  | `apps/web/src/` |
| Mobile (React Native / Expo)   | `apps/app/src/` |
| CLI                            | `apps/cli/src/` |
| Web E2E tests (Playwright)     | `apps/web-e2e/` |
| Mobile E2E tests (WebdriverIO) | `apps/app-e2e/` |

---

## Lambdas

| Lambda          | Root path                      | Notes                                |
| --------------- | ------------------------------ | ------------------------------------ |
| GraphQL API     | `lambdas/db/src/`              | Apollo Server; Pothos schema builder |
| OAuth / auth    | `lambdas/oauth-proxy/src/`     | Google OAuth + JWT issuing           |
| Stats ingest    | `lambdas/stats-lambda/src/`    | MLB stats ingestion                  |
| Draft processor | `lambdas/draft-processor/src/` | Draft pick processing                |
| Game selection  | `lambdas/game-selection/src/`  | Fantasy game-selection logic         |
| Notifications   | `lambdas/notifications/src/`   | WebSocket + push notifications       |
| Stripe webhook  | `lambdas/stripe-webhook/src/`  | Stripe payment events                |
| GitHub webhook  | `lambdas/github-webhook/src/`  | GitHub event handling                |
| Image upload    | `lambdas/image-upload/src/`    | S3 image upload presigning           |
| WebSocket       | `lambdas/websocket/src/`       | WebSocket connect/disconnect         |
| Jira proxy      | `lambdas/jira-proxy/src/`      | Jira API proxy for agents            |

---

## Shared Libraries (`lib/`)

| Library                   | Package name                       | Root path                                        | What it contains                            |
| ------------------------- | ---------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Database / ORM            | `@legacy-sports/db-client`         | `lib/db-client/src/`                             | Drizzle schema, services, migrations        |
| Database schema           | —                                  | `lib/db-client/src/lib/schema/`                  | All table definitions                       |
| DB migrations             | —                                  | `lib/db-client/migrations/`                      | SQL migration files                         |
| DB services               | —                                  | `lib/db-client/src/lib/services/`                | `LeagueService`, `PlayerService`, etc.      |
| GraphQL types (codegen)   | `@legacy-sports/api`               | `lib/api/src/`                                   | Generated TS types from GraphQL schema      |
| Shared UI components      | `@legacy-sports/shared-components` | `lib/shared-components/src/`                     | React/RN shared components                  |
| Platform components       | —                                  | `lib/shared-components/src/platform-components/` | `.native.ts` split components               |
| GraphQL queries/mutations | —                                  | `lib/shared-components/src/api/db/`              | `.graphql` files + `graphql.generated.ts`   |
| Tamagui theme/config      | `@legacy-sports/tamagui-config`    | `lib/tamagui-config/src/`                        | Design tokens, theme                        |
| UI abstractions           | `@legacy-sports/ui-abstractions`   | `lib/ui-abstractions/src/`                       | Cross-platform UI primitives                |
| Logging                   | `@legacy-sports/logging`           | `lib/logging/src/`                               | `LOGGER` export (use instead of console.\*) |
| Environment utilities     | `@legacy-sports/env-utilities`     | `lib/env-utilities/src/`                         | Env var access helpers                      |
| AWS utilities             | `@legacy-sports/aws-utils`         | `lib/aws-utils/src/`                             | SSM, Secrets Manager helpers                |
| Scoring                   | `@legacy-sports/scoring`           | `lib/scoring/src/`                               | Fantasy scoring logic                       |
| Scheduling                | `@legacy-sports/scheduling`        | `lib/scheduling/src/`                            | Cron / schedule utilities                   |
| MLB client                | `@legacy-sports/mlb-client`        | `lib/mlb-client/src/`                            | MLB Stats API client                        |
| Utils                     | `@legacy-sports/utils`             | `lib/utils/src/`                                 | General-purpose utilities                   |
| Test fixtures             | `@legacy-sports/test-fixtures`     | `lib/test-fixtures/src/`                         | Shared test data / factories                |
| Analytics                 | `@legacy-sports/analytics`         | `lib/analytics/src/`                             | Event tracking                              |
| Sentry                    | `@legacy-sports/sentry`            | `lib/sentry/src/`                                | Error reporting setup                       |
| WebSocket client          | `@legacy-sports/websocket-client`  | `lib/websocket-client/src/`                      | Client-side WS connection                   |

---

## GraphQL API — Key Files

| What                              | Path                                                 |
| --------------------------------- | ---------------------------------------------------- |
| Schema entry point (Pothos)       | `lambdas/db/src/schema/index.ts`                     |
| Resolvers & server code           | `lambdas/db/src/server/`                             |
| GraphQL context / auth middleware | `lambdas/db/src/server/`                             |
| Lambda handler                    | `lambdas/db/src/index.ts`                            |
| Service aggregate root            | `lib/db-client/src/lib/services/database-service.ts` |

---

## DB Integration Tests

| What                            | Path                                          |
| ------------------------------- | --------------------------------------------- |
| Test spec files                 | `lambdas/db/src/schema/*.db.spec.ts`          |
| Test setup / fixtures / cleanup | `lambdas/db/integration-test-setup.ts`        |
| Jest config                     | `lambdas/db/jest.db.config.ts`                |
| Global setup / teardown         | `lambdas/db/integration-test-global-setup.ts` |
| Test data fixtures (JSON)       | `lambdas/db/src/__fixtures__/`                |
| Nx target                       | `db:test:db`                                  |

See `.agents/skills/testing/references/db-integration-tests.md` for patterns and rules.

---

## Authentication

| What                       | Path                                                                          |
| -------------------------- | ----------------------------------------------------------------------------- |
| JWT issuing / verification | `lambdas/oauth-proxy/src/`                                                    |
| Device flow auth           | `lambdas/oauth-proxy/src/handlers/DeviceFlow.ts`                              |
| Secure storage (web)       | `lib/shared-components/src/platform-components/web/WebSecureStorage.ts`       |
| Secure storage (mobile)    | `lib/shared-components/src/platform-components/mobile/MobileSecureStorage.ts` |

---

## Infrastructure

| What                   | Path                        |
| ---------------------- | --------------------------- |
| Terraform root         | `terraform/`                |
| Lambda infra           | `terraform/lambdas/`        |
| GitHub Actions runners | `terraform/runners/`        |
| CI/CD workflows        | `.github/workflows/`        |
| Deploy script          | `scripts/deploy-lambda.ps1` |

---

## MCP Servers (`tools/mcp/`)

| Server   | Root path                        | Key tools                                                                       |
| -------- | -------------------------------- | ------------------------------------------------------------------------------- |
| GitHub   | `tools/mcp/github-server/src/`   | `github_create_pr`, `github_resolve_threads`, `github_get_review_threads`, …    |
| CI       | `tools/mcp/ci-server/src/`       | `ci_list_runs`, `ci_get_logs`, `ci_audit_session_bash`, `ci_rerun`, …           |
| Worktree | `tools/mcp/worktree-server/src/` | `worktree_commit`, `worktree_push`, `worktree_set`, …                           |
| Make     | `tools/mcp/make-server/src/`     | `make_run`, `make_worktree_create`, `make_wt_setup`, …                          |
| Jira     | `tools/mcp/jira-server/src/`     | `jira_view`, `jira_create_ticket`, `jira_transition`, `jira_get_bucket_epic`, … |
| Nx       | `tools/mcp/nx-server/src/`       | `nx_run`, `nx_run_affected`, `nx_show_projects`, …                              |
| AWS      | `tools/mcp/aws-server/src/`      | `aws_ec2_instances`, `aws_logs_tail`, `aws_lambda_status`, …                    |
| Database | `tools/mcp/db-server/src/`       | `db_migrate`, `db_query`, `db_print_schema`, …                                  |
| Browser  | `tools/mcp/browser-server/src/`  | `browser_navigate`, `browser_screenshot`, …                                     |

---

## Config & Build

| What                   | Path                                   |
| ---------------------- | -------------------------------------- |
| Root `package.json`    | `package.json`                         |
| Nx workspace config    | `nx.json`                              |
| pnpm workspace         | `pnpm-workspace.yaml`                  |
| Root Makefile          | `Makefile`                             |
| TypeScript root config | `tsconfig.base.json`                   |
| ESLint root config     | `.eslintrc.json` or `eslint.config.js` |
| Prettier config        | `.prettierrc`                          |

---

## Agent Skills & Docs

| What                   | Path                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| All skills index       | `.agents/skills/`                                                  |
| This file map          | `.agents/skills/architecture/FILE-MAP.md`                          |
| PR lifecycle rules     | `.agents/skills/pr-lifecycle/SKILL.md`                             |
| Common review patterns | `.agents/skills/pr-lifecycle/references/common-review-patterns.md` |
| Workflow checklist     | `.agents/skills/workflow-overview/SKILL.md`                        |
| MCP gap audit          | `.agents/skills/mcp-gaps/SKILL.md`                                 |
| MCP tool mapping       | `.agents/skills/mcp-first/SKILL.md`                                |
| Subagent templates     | `.agents/skills/subagent-templates/SKILL.md`                       |
