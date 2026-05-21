# CI System Troubleshooting & Debugging Guide

> For the full CI architecture, see [ci-greenfield-design.md](ci-greenfield-design.md). For per-check fix commands, see `.agents/skills/pr-lifecycle/references/ci-checks-reference.md`.

## Quick Start: Diagnosing a CI Failure

### Step 1: Read the CI labels on your PR

The `summarize` job applies a specific label for the failing stage:

| Label                        | Failing stage       | First command to run                             |
| ---------------------------- | ------------------- | ------------------------------------------------ |
| `CI: Formatting`             | Prettier check      | `pnpm exec nx format:write`                      |
| `CI: Lint Failure`           | ESLint              | `pnpm exec nx affected -t lint --fix`            |
| `CI: Type Error`             | TypeScript          | `pnpm exec nx affected -t typecheck`             |
| `CI: Test Failure`           | Jest tests          | `pnpm exec nx affected -t test`                  |
| `CI: Build Failure`          | Build validation    | `pnpm exec nx affected -t build`                 |
| `CI: E2E Failure`            | Playwright          | `pnpm exec nx e2e web-e2e -- --grep='@critical'` |
| `CI: Quality Gates`          | Setup/infra failure | Rerun the workflow first                         |
| `CI: Migration Immutability` | Migration edited    | Revert the migration file change                 |

### Step 2: Read the PR comment

The `summarize` job posts a status table on every CI run. This is the fastest way to see which sub-check failed.

### Step 3: Pull the error lines

```bash
# MCP (preferred)
ci_get_logs(runId: RUN_ID, failedOnly: true)

# CLI fallback
gh run view RUN_ID --log-failed
```

### Step 4: Reproduce locally

```bash
make pc   # Runs format, lint, typecheck, test, build in sequence
```

## Why CI Isn't Running on My PR

CI runs only when:

1. The Code Reviewer Bot approves your PR (fires via `pull_request_review` event)
2. Your PR enters the merge group
3. Manual workflow dispatch

CI does **not** run on every push. If CI hasn't started, ensure:

- Your PR is not a draft (`Mark as ready for review`)
- The Code Reviewer Bot has been invited to review (it triggers automatically on non-draft, non-fork PRs)

## Debugging by Failure Type

### `CI: Formatting`

```bash
# Fix and commit
pnpm exec nx format:write
git add -A && git commit -m "chore: fix formatting"
```

`make pc` runs this automatically before every pre-commit validation. Formatting failures are rare when `make pc` is used consistently.

### `CI: Lint Failure`

```bash
# Auto-fix
pnpm exec nx affected -t lint --fix

# Check which rules fired (read the log for rule names)
pnpm exec nx affected -t lint
```

Never use `eslint-disable` suppressions. Fix the root cause. See `.agents/skills/standards/SKILL.md`.

### `CI: Type Error`

```bash
pnpm exec nx affected -t typecheck
```

Read the error: `file(path,line): error TSxxxx: message`. Never use `@ts-ignore` — fix the underlying type.

### `CI: Test Failure`

```bash
# All affected tests
pnpm exec nx affected -t test

# Single spec
pnpm exec nx run <project>:test --testPathPattern="SpecName"
```

If the error line is a module-loading warning (`Failed to load the ES module`) above the `FAIL` line, the test framework failed to initialize — fix the config, not the test.

### `CI: Build Failure`

```bash
pnpm exec nx affected -t build
```

Read for `Module not found`, `Cannot find`, or `BUILD FAILED`. Common causes:

- Missing import or incorrect path
- Environment variable expected at build time
- Type error that only surfaces during bundling

### `CI: E2E Failure`

```bash
# Build web first (E2E needs the artifact)
pnpm exec nx build web

# Run critical tests
pnpm exec nx e2e web-e2e -- --grep='@critical'
```

For flaky failures, rerun first: `ci_rerun(runId: RUN_ID, failedOnly: true)`. If consistently failing, read the Playwright report via `ci_get_playwright_report({ reportName: "pr-<PR#>" })`.

### `CI: Quality Gates` (setup failure)

This label fires when the `quality-gates` job fails before sub-checks produce output — typically a runner OOM, timeout, or setup step failure.

1. Rerun: `ci_rerun(runId: RUN_ID, failedOnly: true)`
2. If it fails again, check logs for setup errors like `Nx CLI not available` or `node_modules not found`

### `CI: Migration Immutability`

A migration file under `lib/db-client/migrations/` was edited after being merged. Migration files are immutable.

**Fix:** Revert the change. If schema behavior needs to change, add a new migration file instead.

## Bot-Review Failures (`bot-review` status)

The `bot-review` commit status is set by the Code Reviewer Bot via the reviewer script. It tracks whether code review findings are resolved.

### `bot-review: failure` — unresolved review threads

1. Get unresolved threads: `github_get_review_threads({ number: PR# })`
2. Fix the flagged code or prepare structured replies
3. Commit and push fixes
4. Reply to each thread: `FIX: <sha>` (fix committed) or `JUSTIFY: <rationale>` (finding incorrect/out of scope)
5. The push in step 3 fires Cycle 2 automatically — `bot:ready-for-review` persists through merge (LS-4678). Only re-apply if the label was externally stripped; Review Label Guard (W7) will auto-reapply on the next push when a prior bot APPROVED exists

Full protocol in `AGENTS.md §8`. Use `/respond-to-review` to scaffold structured replies.

### `bot-review: pending` — review not started

Ensure the PR is not a draft. The reviewer fires on `opened`/`ready_for_review` events. If the reviewer didn't fire:

- Check the Actions tab for a `Reviewer (W1)` run
- If missing, manually trigger: `gh workflow run review.yml -f pull_number=<PR#>`

### Copilot reviewer returned unexpected output

The reviewer script (`review.yml`) runs with `continue-on-error: true`. If it fails silently, check the `Run reviewer` step in the Actions log.

## Standalone Check Failures

### `No Merge Conflicts`

```bash
git fetch origin
git rebase origin/main
# Resolve conflicts, then push
```

### `GraphQL Schema & Codegen`

```bash
pnpm exec nx run db:print-schema
pnpm run codegen
git add lambdas/db/schema.graphql lib/**/graphql.generated.ts
```

### `Verify All Migrations Applied`

```bash
# MCP
db_migrate()

# CLI
pnpm --prefix lib/db-client run db:up
```

### `Naming Lint` (W3)

PR title must start with `LS-XXXX` or contain a valid conventional commit type. See `.agents/skills/branch-naming/SKILL.md`.

## Debug Mode

Add the `ci-debug` label to enable `NX_VERBOSE_LOGGING` and extended error context:

```bash
github_manage_labels(prs: [PR#], add: ["ci-debug"])
```

## Merge Queue Issues

See [merge-queue-guide.md](merge-queue-guide.md) for the full merge queue reference.

**Common blockers:**

| Symptom                        | Cause                     | Fix                                        |
| ------------------------------ | ------------------------- | ------------------------------------------ |
| PR not merging after CI passes | 30 s debounce             | Wait 60 s; check merge queue workflow run  |
| "Unresolved review threads"    | Human or bot threads open | Resolve all threads in Files Changed tab   |
| "Status checks failing"        | CI or bot-review failure  | Fix the failing check                      |
| Queue appears stuck            | Race condition            | Remove and re-add `merge-when-ready` label |

## Deployment Issues

### Web deployment (`deploy-web.yml`)

Triggers on push to `main` when `apps/web/**` or `lib/shared-components/**` changes.

```bash
gh run list --workflow deploy-web.yml --limit 5
gh run view RUN_ID --log-failed
```

Common causes: missing `VITE_*` secrets, Sentry sourcemap upload failure.

### Lambda deployment

Two-step: `upload-lambdas.yml` (build + S3 upload) → `lambda-terraform-apply.yml` (Terraform apply).

```bash
gh run list --workflow upload-lambdas.yml --limit 5
gh run list --workflow lambda-terraform-apply.yml --limit 5
```

**Terraform state lock:** If a deployment was cancelled mid-run, the Terraform state lock may be held. Check the DynamoDB table `terraform-state-locks` and use `terraform force-unlock <LOCK_ID>` if needed.

## Discord Notifications

CI workflows post to Discord via channel-specific webhooks:

| Secret                        | Used by                                  |
| ----------------------------- | ---------------------------------------- |
| `DISCORD_CI_WEBHOOK_URL`      | Playwright tests, CI pipeline            |
| `DISCORD_DEPLOY_WEBHOOK_URL`  | Web deploys, Lambda Terraform, rollbacks |
| `DISCORD_RELEASE_WEBHOOK_URL` | iOS/Android builds, web release summary  |

Update webhooks in GitHub **Settings → Secrets and variables → Actions**.

> **Forum channel required for Playwright thread grouping.** The `thread_name` webhook parameter is a Discord API forum-channel-only feature. A regular text channel will cause the finish notification to fail with `code 10003`.

## Nx Cache

The CI uses local GitHub Actions caching (`NX_NO_CLOUD=true`). If you suspect stale cache:

```bash
# Clear local cache
pnpm exec nx reset

# Verify cache configuration
echo $NX_NO_CLOUD  # should be: true
```

See [nx-remote-caching-implementation.md](nx-remote-caching-implementation.md).

## Performance

Target CI times: quality-gates 30 min, build-validation 30 min, E2E 30 min. If significantly slower:

- Check `NX_PARALLEL` is set (defaults to 3 in `ci-pipeline.yml`)
- Check for dependency bottlenecks in the Nx task graph

## Escalation

1. **Self-service (< 15 min):** Use commands above; rerun if transient
2. **Team (15–30 min):** Post in `#engineering` with CI run link and error message
3. **DevOps (30+ min):** Create GitHub issue with `ci-issue` label; tag `#devops-alerts`
