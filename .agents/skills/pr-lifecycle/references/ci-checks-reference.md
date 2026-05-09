# CI Checks Reference

Quick lookup for every check agents encounter on a PR — what it validates, why it fails, and exactly how to fix it locally.

> **When a check fails:** read the PR comment posted by the `summarize` job first — it shows a per-sub-check status table that usually narrows the problem immediately. Then use `ci_get_logs(runId: RUN_ID, failedOnly: true)` to pull the actual error lines. **Never guess; extract the error text first.** See [ci-failure.md](../../debugging/references/ci-failure.md) for the full evidence-first triage workflow.

---

## Master Lookup Table

| What you see in GitHub                          | CI Label (if any)            | Blocking?                | Source workflow                           | Fix command                                                                  |
| ----------------------------------------------- | ---------------------------- | ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `CI Pipeline` check run fails                   | See sub-labels below         | **Yes**                  | `ci-orchestrator.yml` → `ci-pipeline.yml` | `make pc`                                                                    |
| `CI: Formatting` label                          | `CI: Formatting`             | Blocks CI Pipeline       | `ci-pipeline.yml` quality-gates           | `pnpm exec nx format:write`                                                  |
| `CI: Lint Failure` label                        | `CI: Lint Failure`           | Blocks CI Pipeline       | `ci-pipeline.yml` quality-gates           | `pnpm exec nx affected -t lint --fix`                                        |
| `CI: Type Error` label                          | `CI: Type Error`             | Blocks CI Pipeline       | `ci-pipeline.yml` quality-gates           | `pnpm exec nx affected -t typecheck`                                         |
| `CI: Test Failure` label                        | `CI: Test Failure`           | Blocks CI Pipeline       | `ci-pipeline.yml` quality-gates           | `pnpm exec nx affected -t test`                                              |
| `CI: Build Failure` label                       | `CI: Build Failure`          | Blocks CI Pipeline       | `ci-pipeline.yml` build-validation        | `pnpm exec nx affected -t build`                                             |
| `CI: E2E Failure` label                         | `CI: E2E Failure`            | Blocks CI Pipeline       | `ci-pipeline.yml` e2e                     | `pnpm exec nx e2e web-e2e -- --grep='@critical'`                             |
| `CI: Quality Gates` label                       | `CI: Quality Gates`          | Blocks CI Pipeline       | `ci-pipeline.yml` quality-gates           | `make pc` (fallback — see below)                                             |
| `CI: Migration Immutability` label              | `CI: Migration Immutability` | Blocks CI Pipeline       | `ci-pipeline.yml` quality-gates           | Revert the modified migration file                                           |
| `GraphQL Schema & Codegen` check run fails      | `CI: Schema Drift`           | **Yes** (when triggered) | `check-schema.yml`                        | `pnpm exec nx run db:print-schema && pnpm run codegen`                       |
| `Verify All Migrations Applied` check run fails | `CI: Migration`              | **Yes** (when triggered) | `check-migrations-applied.yml`            | `db_migrate()` or `pnpm --prefix lib/db-client run db:up`                    |
| `No Merge Conflicts` check run fails            | `CI: Conflicts`              | **Yes**                  | `check-conflicts.yml`                     | `worktree_rebase()` or `git rebase origin/main`                              |
| `bot-review` commit status = failure            | _(none)_                     | **Yes**                  | `copilot-auto-approve.yml`                | Fix unresolved Copilot review threads — see [fix-reviews.md](fix-reviews.md) |
| Security Scanning check run fails               | `CI: Security`               | No (advisory)            | `security-scanning.yml`                   | See [Security Scanning](#security-scanning-ci-security) below                |
| `Deploy PR Preview` fails                       | _(none)_                     | No (advisory)            | `deploy-pr-preview.yml`                   | Check for missing `VITE_*` secrets; re-run if transient                      |
| `Jira Branch Sync` fails                        | _(none)_                     | No (advisory)            | `jira-branch-sync.yml`                    | Best-effort; rerun or transition Jira manually                               |

---

## CI Pipeline Checks (Inside `ci-pipeline.yml`)

The main `CI Pipeline` check run wraps four sequential stages. When it fails, one or more of the auto-applied `CI: *` labels tells you which stage failed without reading logs.

### Stage sequence

```
detect-changes (~30 s)
       │
  ┌────┴────┐
quality   build-        ← run PARALLEL; both must pass
gates     validation
  └────┬────┘
     e2e  (sharded Playwright, @critical only on PRs)
       │
  summarize (always runs — posts PR comment + applies labels)
```

---

### `CI: Formatting`

**What:** Prettier formatting check. CI runs `pnpm exec prettier --check` across all changed files.

**Why it fails:** A file was committed without running the formatter. This is the most common CI failure for new contributors and can happen after a rebase that touched formatting-sensitive files.

**Fix locally:**

```bash
pnpm exec nx format:write
# Then commit the reformatted files
```

`make pc` runs this automatically and auto-amends the last commit with any formatter changes, so it rarely reaches CI when `make pc` is used before push.

---

### `CI: Lint Failure`

**What:** ESLint on all affected projects. Covers TypeScript-aware rules, import order, `no-console`, and project-specific rules from `.eslintrc` files.

**Why it fails:** New code violates an ESLint rule. Common culprits: `@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-unused-vars`, `no-console` (use `LOGGER` from `@legacy-sports/logging` instead).

**Fix locally:**

```bash
pnpm exec nx affected -t lint --fix
# Review any errors that --fix cannot auto-resolve, then fix manually
```

**Never use `eslint-disable` / `eslint-disable-next-line` suppression comments (including ones targeting `@typescript-eslint/*` rules)** — fix the root cause. See [standards/SKILL.md](../../standards/SKILL.md).

---

### `CI: Type Error`

**What:** TypeScript type checking (`nx affected -t typecheck`) across every affected project's strict `tsconfig`.

**Why it fails:** A type mismatch, missing import, incorrect generic, or use of `any` where a concrete type is required. Also fires if a shared library's types changed incompatibly.

**Fix locally:**

```bash
pnpm exec nx affected -t typecheck
# Read the error: file(path,line): error TSxxxx: message
```

Never use `@ts-ignore` or `@ts-expect-error` to silence errors — fix the underlying type issue.

---

### `CI: Test Failure`

**What:** Jest unit and integration tests (`nx affected -t test`).

**Why it fails (in order of frequency):**

1. **Node/module-loading warning above the failure** — the test framework itself failed to initialize (misconfigured `jest.config`, bad `tsconfig` path alias, missing `@legacy-sports/*` workspace reference). Look for `(node:XXXX) Warning: Failed to load the ES module` _above_ the `FAIL` line. Fix the config, not the test.
2. **Actual assertion failure** — the implementation doesn't match what the test expects. Read `Expected:` / `Received:` lines.
3. **Flaky infrastructure** — runner timeout, network hiccup. Rerun with `ci_rerun(runId: RUN_ID, failedOnly: true)`.

**Fix locally:**

```bash
# Run all affected tests
pnpm exec nx affected -t test

# Run a single spec
pnpm exec nx run <project>:test --testPathPattern="SpecName"
```

---

### `CI: Build Failure`

**What:** Build validation for all affected targets: web (`apps/web`), mobile (`apps/mobile`), Lambda functions (`lambdas/*`), Terraform validate.

**Why it fails:** A missing import, module resolution failure, environment variable expected at build time, or a type error that only surfaces during bundling (Vite/esbuild). Lambda builds also fail when a file is referenced but not present in the bundle entry point.

**Fix locally:**

```bash
pnpm exec nx affected -t build
# Read the error: "Module not found", "Cannot find", or "BUILD FAILED"
```

---

### `CI: E2E Failure`

**What:** Playwright end-to-end tests, 1 shard on PRs (`@critical` tag only, excludes `@slow`). The test suite downloads the web build artifact from the build-validation stage and runs against it.

**Why it fails:**

- A UI change broke a critical user flow.
- The web build artifact was not produced (build-validation also failed — fix that first).
- A new E2E test was added without the `@critical` tag, so it was skipped in PR CI; this is a coverage gap that will surface in broader E2E runs, not a cause of this PR check failing.
- Flaky test (race condition, selector timeout). Check whether the failure is consistent across reruns.

**Fix locally:**

```bash
# Build web first (E2E needs the build artifact)
pnpm exec nx build web

# Run a single test
pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts
```

For flaky failures, rerun first: `ci_rerun(runId: RUN_ID, failedOnly: true)`. If consistently failing, read the Playwright report: `ci_get_playwright_report({ reportName: "pr-<PR#>" })`.

---

### `CI: Quality Gates` (fallback label)

**What:** Applied when the `quality-gates` job fails but the individual sub-step outputs (formatting/lint/type/test) are not available — e.g. the job was cancelled, the runner died, or a setup step failed before any checks ran.

**Why it fails:** Usually a runner/infrastructure issue (OOM, timeout, self-hosted runner unavailable) rather than a code issue.

**Fix:** Rerun the failed job first: `ci_rerun(runId: RUN_ID, failedOnly: true)`. If it fails again with the same infra error, check `ci_get_logs` for setup-step failures like `Nx CLI not available` or `node_modules.*not found`.

---

### `CI: Migration Immutability`

**What:** Ensures that previously-applied migration files in `lib/db-client/migrations/` are not modified or deleted. This check runs both in the pre-commit hook and in CI quality-gates.

**Why it fails:** A committed migration file was edited after it was merged to `main`. Migration files are immutable once applied — they represent a permanent record of schema history.

**Fix:** Revert the modification to the migration file. If you need to change schema behavior, add a **new** migration file instead. Never amend, rename, or delete a migration that has already landed on `main`.

---

## Standalone Checks (Separate Workflows)

These run as independent workflows triggered by PR events. They appear as separate check runs alongside `CI Pipeline`.

---

### `GraphQL Schema & Codegen` (`CI: Schema Drift`)

**Source:** `check-schema.yml` — triggers when any file under `lambdas/db/src/schema/**`, `**/*.graphql`, `lib/codegen/**`, or `lib/api/**` changes.

**What it does:**

1. Regenerates `lambdas/db/schema.graphql` from the Pothos implementation.
2. Diffs the committed SDL against the generated one — fails if they differ.
3. Runs all codegen targets against the generated schema.

**Why it fails:**

- You added/changed a Pothos resolver/type but didn't regenerate `schema.graphql`.
- You edited `schema.graphql` directly instead of editing the Pothos source.
- A codegen target (e.g. `graphql.generated.ts`) is out of sync.

**Fix locally:**

```bash
pnpm exec nx run db:print-schema        # regenerates schema.graphql
pnpm run codegen                        # regenerates all codegen outputs
git add lambdas/db/schema.graphql       # commit the updated SDL
git add lib/**/graphql.generated.ts     # commit any updated generated files
```

---

### `Verify All Migrations Applied` (`CI: Migration`)

**Source:** `check-migrations-applied.yml` — triggers on PRs to `main` when files under `lib/db-client/migrations/*.ts` change.

**What it does:** Connects to the production database as `ci_readonly` and verifies that every migration file on disk has a corresponding applied entry in `drizzle.__drizzle_migrations`. Requires a self-hosted runner with direct VPC access to RDS.

**Why it fails:**

- A new migration was added to the PR but has not been applied to production yet.
- A migration was applied under a different hash (file was modified after applying).

**Fix:**

```bash
# MCP (preferred)
db_migrate()   # or db_migrate_tunnel() if connecting from local

# Shell fallback
pnpm --prefix lib/db-client run db:up
```

After applying, verify with `db_migration_status()`. The check will re-run on the next push.

> **Note:** This check requires a self-hosted runner. If the check fails with `"This workflow requires a self-hosted runner"`, the PR author does not have write permission or the runner is offline — contact the repo owner.

---

### `No Merge Conflicts` (`CI: Conflicts`)

**Source:** `check-conflicts.yml` — triggers on every PR (opened/synchronize/reopened).

**What it does:** Polls GitHub's merge-ability API up to 10 times (~50 s) to confirm the PR branch has no conflicts with the base branch.

**Why it fails:**

- The base branch (`main`) has moved ahead with commits that conflict with changes on this branch.
- GitHub could not compute mergeability within the polling window (transient — rerun the check).

**Fix:**

```bash
# MCP (preferred)
worktree_rebase()

# Shell fallback
git fetch origin
GIT_EDITOR=true twig rebase    # or: git rebase origin/main
```

Resolve any conflicts, then push. The check re-runs automatically on the next `synchronize` event.

---

### `bot-review` Commit Status

**Source:** `.github/workflows/review.yml` (W1) — a commit status (not a check run) set by the Review Bot (GitHub App ID 3142924) via `setCommitStatus` in `.github/scripts/reviewer/lib/github.mjs`.

**What it does:** Tracks the reviewer bot's verdict. Set to `pending` when a review starts, `success` when no blocking findings remain, `failure` when blocking findings require changes.

**Why it fails:** The reviewer bot found one or more blocking findings (critical or high severity) that require changes.

**Important:** `bot-review` is a **commit status**, not a check run. `github_retrigger_check` will NOT find it — use `github_list_commit_statuses({ number: PR# })` to see it.

**Fix (normal path):** Follow the [Review Thread Workflow](../SKILL.md#review-thread-workflow-bot-review-failures):

1. `github_get_review_threads({ number: PR#, unresolvedOnly: true })`
2. Fix the flagged code
3. Commit and push
4. `github_resolve_threads({ threadIds: [...], prNumber: PR# })`

**Fix (override — bot misapplied a rule):** If the bot persistently flags code that is correct (e.g. after filing `CANNOT-COMPLY` responses across Cycle 3), a maintainer can apply the `review-bot-override` label:

```
github_manage_labels(prs: [PR#], add: ["review-bot-override"])
```

This triggers `.github/workflows/review-bot-override.yml` (W5), which:

1. Sets `bot-review` to `success` with description "Bot review overridden via review-bot-override label"
2. Posts an audit comment on the PR identifying the applier
3. Prevents W1 from running again while the label is present

Removing the label sets `bot-review` back to `pending` and re-enables the normal review gate. The `review-bot-override` label is the **formal escape hatch** for persistent bot disagreement — prefer it over GitHub's admin "Merge without waiting for requirements" button, which leaves no audit trail.

---

### `needs-human-security-review` Label (CODEOWNER gate)

**Applied by:** `.github/scripts/reviewer/index.mjs` when the reviewer detects a critical security finding (`hasCriticalBlockingFinding(...)` returns true). The label itself is informational — the actual merge gate is the **CODEOWNER review requirement** on the Protect Main ruleset (`require_code_owner_review: true`). When the reviewer flags a critical finding, the bot's review verdict is typically `CHANGES_REQUESTED` rather than `APPROVED`, so the PR cannot satisfy CODEOWNER review without a human.

**Why this gets stuck:** the PR author cannot satisfy CODEOWNER review on their own PR. For agent-authored PRs (where the human operator is also the author), there is no second human in the loop to approve.

**Fix (override — finding has been reviewed by a human):** A maintainer applies the `security-review-override` label:

```
github_manage_labels(prs: [PR#], add: ["security-review-override"])
```

This triggers `.github/workflows/security-review-override.yml` (W6), which:

1. Submits an `APPROVE` review on the PR as the Code Reviewer Bot App, satisfying the CODEOWNER requirement with a non-author identity
2. Removes the `needs-human-security-review` label
3. Posts an audit comment on the PR identifying the applier and recording the override

Removing the label dismisses the override APPROVE review and re-applies `needs-human-security-review`, restoring the security gate. The `security-review-override` label is the **formal escape hatch** for the CODEOWNER deadlock on bot-flagged security findings — apply only after a human security reviewer has examined the finding and confirmed it inapplicable, mitigated, or accepted.

> **Difference from `review-bot-override`:** `review-bot-override` (W5) flips the `bot-review` commit status when the bot has applied a rule incorrectly. `security-review-override` (W6) provides an APPROVE review when the bot has correctly identified a critical finding that has since been resolved or accepted by a human. The two are not interchangeable: use W5 to reject a finding, W6 to ratify one.

> **Maintenance contract:** the `unlabeled` path identifies the prior override approval to dismiss by matching the string `Security Review Override Applied` (the `OVERRIDE_MARKER` constant in W6) in the review body. GitHub does not share state between separate `labeled` and `unlabeled` workflow runs, so a `review_id` cannot be persisted — the marker string is the most robust available identification. **If you change the marker text in the workflow, the matcher constant in the same file must be updated in lockstep**, or the dismiss step will silently miss the prior approval and leave a stale APPROVE on the PR.

---

## Advisory Checks (Not Blocking Merge)

These produce GitHub check runs or commit statuses but are **not** required by branch protection. Failures add labels and delay the merge queue but do not permanently block merge.

---

### Security Scanning (`CI: Security`)

**Source:** `security-scanning.yml` — dispatched by the orchestrator when dependencies change (`package.json`, `pnpm-lock.yaml`) or code changes (`.ts`/`.tsx`/`.js`). Always runs on `merge_group` and weekly schedule.

**Scan types:**

- `dependencies-only` — pnpm audit + Snyk + Trivy (when deps change)
- `secrets-only` — secret detection (when code changes, no dep changes)
- `comprehensive` — all of the above + SAST (merge_group, manual, weekly)

**Why it fails:**

- A known CVE in a newly added or updated dependency.
- A secret pattern (API key, token) detected in code.
- SAST rule violation.

**Fix:** Read the security scan logs for the specific finding. For CVEs: update the affected package or add a structured audit exception with justification. For secrets: rotate the credential immediately and remove it from git history. Never suppress security findings with `eslint-disable` or similar.

---

### Deploy PR Preview

**Source:** `deploy-pr-preview.yml` — runs after CI passes; deploys the web build to `https://bkrupa.github.io/legacy-sports-deploys/pr-<N>/`.

**Why it fails:** Missing `VITE_*` build secrets, web build artifact absent (build-validation failed), or GitHub Pages deployment rate limit.

**Fix:** Fix the underlying build failure first. Preview failures are typically transient infrastructure issues — rerun with `ci_rerun`. The preview URL only exists if `apps/web`, `lib/shared-components`, or `lib/ui-abstractions` changed.

---

### Jira Branch Sync

**Source:** `jira-branch-sync.yml` — best-effort Jira transitions on PR open/close/merge.

**Why it fails:** Jira credentials expired, Atlassian API rate limit, or Jira ticket key not found in the PR title/branch.

**Fix:** Transition Jira manually via `jira_transition(key: "LS-####", status: "In Review")`. Do not block a PR merge waiting for this check.

---

## Enabling Debug Mode

Add the `ci-debug` label to a PR to enable `NX_VERBOSE_LOGGING` and extended error context for the `quality-gates` and `build-validation` jobs in `ci-pipeline.yml`:

```
github_manage_labels(prs: [PR#], add: ["ci-debug"])
```

---

## Related References

| Document                                                                                    | When to use it                                                                     |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [ci-failure.md](../../debugging/references/ci-failure.md)                                   | Step-by-step triage: fetch logs, identify root cause, reproduce locally, fix       |
| [ci-pipeline-architecture.md](../../debugging/references/ci-pipeline-architecture.md)       | Pipeline diagram, job timeouts, env vars, deployment pipeline debugging            |
| [ci-troubleshooting-advanced.md](../../debugging/references/ci-troubleshooting-advanced.md) | Concurrency cancellations, skills lint, E2E failures, Terraform locks, merge queue |
| [fix-reviews.md](fix-reviews.md)                                                            | Fix Copilot review threads (clears `bot-review` failure)                           |
| [workflow-overview Phase 3](../../workflow-overview/SKILL.md#phase-3-ci-pipeline)           | Full pipeline architecture and CI failure label table                              |
