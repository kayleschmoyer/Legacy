# Reference: Roles, Required Checks & Secrets (environment-neutral)

Reference tables for the PR/CI machinery: the GitHub App separation of duties, which checks block merge, and the secrets that back CI and deploy. Environment-neutral; linked from both [workflow-overview](../SKILL.md) and [cloud-agent-mode](../../cloud-agent-mode/SKILL.md). (The secrets reference is the final section of this file.)

## Separation of Duties

Three GitHub Apps handle distinct roles to ensure no single identity both authors and approves code:

| App                                   | ID / Client ID                                      | Role                                                                                         | Permissions                                                              |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Agent Author                          | 3158619                                             | Pushes code, creates PRs, reads CI check state (backs the `legacy-sports-github` MCP server) | Contents (rw), Pull requests (rw), Checks (r), Statuses (r)              |
| Review Bot (legacy-sports-review-bot) | 3142924                                             | Approves PRs after Copilot review passes, manages `bot-review` status, adds labels           | Pull requests (rw), Statuses (rw), Checks (rw), Issues (rw)              |
| Merge Queue Bot                       | via `MERGE_QUEUE_APP_ID` secret                     | Processes merge queue, merges PRs, retargets dependents, deletes branches                    | Contents (rw), Pull requests (rw), Issues (rw), Checks (r), Statuses (r) |
| Preview / Deploy App                  | 3027681 / `Iv23liHm7Fumhyh2KIAb` (`PREVIEW_APP_ID`) | Deploys Storybook, PR previews, and Playwright reports to `legacy-sports-deploys`            | Contents (rw) on `legacy-sports-deploys`                                 |

**Key constraint:** The Agent Author app never approves PRs. The Review Bot never pushes code. This ensures separation between code authoring and code approval.

> **Canonical reference:** This table is the single source of truth for GitHub App permissions. When changing an app's permissions, update this table first, then update the app's settings in GitHub, accept the new permissions on the installation, and finally update the workflow file header comments. Other docs (merge-queue-guide, cloud-github-auth) reference these apps but should link here rather than duplicate the full permission set.

## Required vs Advisory Checks

### Required (Blocking) Checks

These must pass for the merge queue to process a PR:

| Check                                     | Source Workflow                                              |
| ----------------------------------------- | ------------------------------------------------------------ |
| CI Pipeline (quality-gates + build + e2e) | `ci-pipeline.yml` via `ci-orchestrator.yml`                  |
| `bot-review` commit status                | `copilot-auto-approve.yml`                                   |
| GraphQL Schema & Codegen                  | `check-schema.yml` (when GraphQL files change)               |
| Verify All Migrations Applied             | `check-migrations-applied.yml` (when migration files change) |

> The CI Pipeline `custom-checks` job also runs the repo-script unit suites — `pnpm test:scripts` (node `--test` over `scripts/__tests__/*.test.mjs`) and `pnpm test:scripts:ps` (the dependency-free PowerShell assertions). `pwsh` is baked into the runner AMI with an install-if-missing fallback in the job (LS-7770).

### Advisory Checks (Not Required by Branch Protection)

These checks are not configured as _required_ branch protection rules, but they still produce GitHub check runs/commit statuses. The merge queue (`merge-queue.yml`) waits for all checks to complete and will block on any failing or pending check unless explicitly configured to ignore it, so failures here can still delay a queued merge.

| Check                    | Source Workflow                        | Notes                                                        |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------ |
| Touch-Map Freshness      | `ci-pipeline.yml` (custom-checks step) | Advisory; posts `docs: touch-map gap` label + comment on gap |
| Security Scanning        | `security-scanning.yml`                | Labels PR on failure but does not block merge                |
| Deploy PR Preview        | `deploy-pr-preview.yml`                | Preview deployment for UI review                             |
| Deploy Playwright Report | `ci-pipeline.yml` (sub-job)            | Report published to GitHub Pages                             |
| Jira Branch Sync         | `jira-branch-sync.yml`                 | Best-effort Jira transitions                                 |
| Update Migration Badge   | `update-migration-badge.yml`           | Badge cosmetics only                                         |

## Secrets Reference

### CI & Deployment

| Secret                        | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `GITHUB_TOKEN`                | Auto-provided; PR comments, labels, check status |
| `GIST_TOKEN`                  | CI badge updates (GitHub Gist)                   |
| `CI_BADGES_GIST_ID`           | Target Gist for badge JSON files                 |
| `DISCORD_CI_WEBHOOK_URL`      | CI failure notifications                         |
| `DISCORD_DEPLOY_WEBHOOK_URL`  | Deploy success/failure notifications             |
| `DISCORD_RELEASE_WEBHOOK_URL` | Release summary notifications                    |

### GitHub Apps

| Secret                         | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `BOT_APP_PRIVATE_KEY`          | Review Bot (ID 3142924) -- Copilot auto-approve      |
| `MERGE_QUEUE_APP_ID`           | Merge Queue Bot app ID                               |
| `MERGE_QUEUE_APP_PRIVATE_KEY`  | Merge Queue Bot private key                          |
| `PREVIEW_APP_ID`               | PR preview/Playwright report deploy app ID           |
| `PREVIEW_APP_PRIVATE_KEY`      | PR preview/Playwright report deploy private key      |
| `AGENT_AUTHOR_APP_PRIVATE_KEY` | Agent Author (ID 3158619) -- code push + PR creation |

### Web App (Vite Build) and Mobile App (Expo)

Secrets use framework-neutral names in GitHub (AWS SSM is the source of truth — see
`terraform/main/ssm-github-secrets.tf`). Each workflow applies the correct prefix at
the step level: `VITE_` for web, `EXPO_PUBLIC_` for mobile.

| GitHub Secret                 | Web env var                 | Mobile env var                        | Purpose                                |
| ----------------------------- | --------------------------- | ------------------------------------- | -------------------------------------- |
| `OAUTH_PROXY_URL`             | `VITE_OAUTH_PROXY_URL`      | `EXPO_PUBLIC_OAUTH_PROXY`             | OAuth proxy endpoint                   |
| `GRAPHQL_HOST`                | `VITE_GRAPHQL_HOST`         | `EXPO_PUBLIC_GRAPHQL_HOST`            | GraphQL API endpoint                   |
| `WEBSOCKET_URL`               | `VITE_WEBSOCKET_URL`        | `EXPO_PUBLIC_WEBSOCKET_URL`           | WebSocket endpoint                     |
| `GOOGLE_CLIENT_ID`            | `VITE_GOOGLE_CLIENT_ID`     | `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`  | Google OAuth client ID                 |
| `DISCORD_CLIENT_ID`           | `VITE_DISCORD_CLIENT_ID`    | —                                     | Discord OAuth client ID                |
| `GA_MEASUREMENT_ID`           | `VITE_GA_MEASUREMENT_ID`    | —                                     | Google Analytics measurement ID        |
| `GIPHY_API_KEY`               | `VITE_GIPHY_API_KEY`        | —                                     | Giphy integration                      |
| `ROLLBAR_CLIENT_ACCESS_TOKEN` | `VITE_ROLLBAR_ACCESS_TOKEN` | `EXPO_PUBLIC_ROLLBAR_ACCESS_TOKEN`    | Client-side Rollbar (error tracking)   |
| `STRIPE_MONTHLY_PRICE_ID`     | —                           | `EXPO_PUBLIC_STRIPE_MONTHLY_PRICE_ID` | Stripe monthly plan price ID           |
| `STRIPE_ANNUAL_PRICE_ID`      | —                           | `EXPO_PUBLIC_STRIPE_ANNUAL_PRICE_ID`  | Stripe annual plan price ID            |
| `ROLLBAR_ACCESS_TOKEN`        | `ROLLBAR_ACCESS_TOKEN`      | —                                     | Server-side Rollbar (sourcemap upload) |

To rotate a value or add a new environment: update the Terraform variable → `terraform apply` →
`node scripts/sync-github-secrets.mjs`.

### Jira

| Secret             | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `JIRA_CREDENTIALS` | JSON object: `{client_id, client_secret, cloud_id}` for OAuth 2.0 |

### AWS

| Secret                                                                            | Purpose                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| AWS OIDC role (`arn:aws:iam::176661590736:role/legacy-sports-dev-github-actions`) | Assumed via `aws-actions/configure-aws-credentials` for RDS access, Lambda deployment, Terraform |

## Related

- [ci-and-merge-pipeline.md](./ci-and-merge-pipeline.md) — the workflows these checks and secrets back.
- [ticket-to-merge-spine.md](./ticket-to-merge-spine.md) — the ordering through merge.
