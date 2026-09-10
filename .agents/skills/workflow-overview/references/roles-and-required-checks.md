# Reference: Roles, Required Checks & Secrets (environment-neutral)

Reference tables for the PR/CI machinery: the GitHub App separation of duties, which checks block merge, and the secrets that back CI and deploy. Environment-neutral; linked from both [workflow-overview](../SKILL.md) and [cloud-agent-mode](../../cloud-agent-mode/SKILL.md). (The secrets reference is the final section of this file.)

## Separation of Duties

Three GitHub Apps handle distinct roles to ensure no single identity both authors and approves code:

| App                                   | ID / Client ID                                      | Role                                                                                                                   | Permissions                                                              |
| ------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Agent Author                          | 3158619                                             | Pushes code, creates PRs, reads CI check state (backs the `legacy-sports-github` MCP server)                           | Contents (rw), Pull requests (rw), Checks (r), Statuses (r)              |
| Review Bot (legacy-sports-review-bot) | 3142924                                             | Identity of the Reviewer Bot (`review.yml`, W1): posts PR reviews, manages the `bot-review` commit status, adds labels | Pull requests (rw), Statuses (rw), Checks (rw), Issues (rw)              |
| Merge Queue Bot                       | via `MERGE_QUEUE_APP_ID` secret                     | Processes merge queue, merges PRs, retargets dependents, deletes branches                                              | Contents (rw), Pull requests (rw), Issues (rw), Checks (r), Statuses (r) |
| Preview / Deploy App                  | 3027681 / `Iv23liHm7Fumhyh2KIAb` (`PREVIEW_APP_ID`) | Deploys Storybook, PR previews, and Playwright reports to `legacy-sports-deploys`                                      | Contents (rw) on `legacy-sports-deploys`                                 |

**Key constraint:** The Agent Author app never approves PRs. The Review Bot never pushes code. This ensures separation between code authoring and code approval.

> **Canonical reference:** This table is the single source of truth for GitHub App permissions. When changing an app's permissions, update this table first, then update the app's settings in GitHub, accept the new permissions on the installation, and finally update the workflow file header comments. Other docs (merge-queue-guide, cloud-github-auth) reference these apps but should link here rather than duplicate the full permission set.

## Required vs Advisory Checks

**The single home for the merge-gate truth — the four required contexts, per-context writers, fail modes, and recovery — is [pr-lifecycle/references/ci-checks-reference.md](../../pr-lifecycle/references/ci-checks-reference.md).** Summary only:

- `.github/ruleset.json` (config) requires exactly four contexts: `bot-review`, `No Merge Conflicts`, `Verify All Migrations Applied`, and `CI Gate` (the LS-8014 cutover). The granular `🚀 CI Pipeline / *` check runs still execute but are informational.
- **Config is not live state.** The cutover is staged: a maintainer must run `bash scripts/apply-ruleset.sh` to push the config live; `check-ruleset.yml` reports drift until then (expected). Check the live set with `github_get_branch_protection()` before reasoning about a blocked merge — details in the [config-vs-live section](../../pr-lifecycle/references/ci-checks-reference.md#config-vs-live-the-staged-cutover-model).
- Non-required checks (GraphQL Schema & Codegen, Security Scanning, Deploy PR Preview, jira-link-check, Jira Branch Sync, Touch-Map freshness, Update Migration Badge) still post check runs, and the merge queue waits for all checks to complete — so a failing advisory check can delay a queued merge even though it cannot 405 it.

> The CI Pipeline `custom-checks` job also runs the repo-script unit suites — `pnpm test:scripts` (node `--test` over `scripts/__tests__/*.test.mjs`), `pnpm test:github-scripts` (node `--test` over `.github/scripts/**/__tests__/*.test.mjs`, LS-9964), and `pnpm test:scripts:ps` (the dependency-free PowerShell assertions). `pwsh` is baked into the runner AMI with an install-if-missing fallback in the job (LS-7770).
>
> `test:github-scripts` exists because `.github/scripts/` has no nx `project.json`, so `pc-test` (`nx affected -t test`) is structurally blind to it — a change confined there yields "No tasks were run" and exits 0. Locally the same suites run from `pc-workflows`, gated on `PC_HAS_GH_SCRIPTS`.

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

| Secret                         | Purpose                                                |
| ------------------------------ | ------------------------------------------------------ |
| `BOT_APP_PRIVATE_KEY`          | Review Bot (ID 3142924) -- Reviewer (W1) + label guard |
| `MERGE_QUEUE_APP_ID`           | Merge Queue Bot app ID                                 |
| `MERGE_QUEUE_APP_PRIVATE_KEY`  | Merge Queue Bot private key                            |
| `PREVIEW_APP_ID`               | PR preview/Playwright report deploy app ID             |
| `PREVIEW_APP_PRIVATE_KEY`      | PR preview/Playwright report deploy private key        |
| `AGENT_AUTHOR_APP_PRIVATE_KEY` | Agent Author (ID 3158619) -- code push + PR creation   |

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
