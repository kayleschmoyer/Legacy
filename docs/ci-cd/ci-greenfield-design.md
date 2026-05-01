# CI/CD Greenfield Design — Legacy Sports

> **Canonical CI architecture document.** This is the authoritative reference for the current CI system. All superseded design docs have been archived in `docs/ci-cd/archive/`.

## Overview

The greenfield CI system was rebuilt from scratch as part of the LS-3857 epic (2026). It replaces a complex, fragile pipeline with a visibility-first architecture centered on three core concerns:

1. **Quality Gate** — automated checks on every PR once it is ready for review
2. **Bot-Driven Code Review** — AI-assisted review with a structured escalation cycle
3. **Label-Based Merge Queue** — automated merge when all conditions are met

## Architecture

### Core Workflows

```
ci-orchestrator.yml       ← Entry point for PR validation
├── determine-scope       ← Decides what needs to run based on event type
├── ci-pipeline.yml       ← Main quality + build pipeline (reusable workflow)
│   ├── detect-changes    ← Affected project detection (dorny/paths-filter + git diff)
│   ├── quality-gates     ← format → lint → typecheck → test
│   ├── build-validation  ← web / lambda / mobile builds
│   ├── e2e               ← Playwright tests (@critical only on PRs)
│   └── summarize         ← PR comment + CI labels
└── security-scanning.yml ← Conditional security scans

review.yml (Reviewer W1)  ← Bot-driven code review
merge-queue.yml           ← Label-based automated merge
```

### Trigger Design

**CI Orchestrator** (`ci-orchestrator.yml`) triggers on:

| Event                           | Condition                                                                     | Action            |
| ------------------------------- | ----------------------------------------------------------------------------- | ----------------- |
| `pull_request_review` submitted | Review is from Code Reviewer Bot (`legacy-sports-review-bot[bot]`) + approved | Run CI pipeline   |
| `merge_group`                   | Always                                                                        | Run CI + security |
| `workflow_dispatch`             | Manual                                                                        | Run with options  |

CI does **not** run on every push. The pipeline is gated behind bot approval or merge group entry. This eliminates wasted CI minutes on work-in-progress commits.

**Reviewer W1** (`review.yml`) triggers on:

| Event                            | Condition                                                |
| -------------------------------- | -------------------------------------------------------- |
| PR `opened` / `ready_for_review` | Non-draft, non-fork PRs                                  |
| PR `labeled`                     | Label is `bot:ready-for-review` or `review-bot-degraded` |

### CI Pipeline Jobs

| Job                | Purpose                                                   | Timeout |
| ------------------ | --------------------------------------------------------- | ------- |
| `detect-changes`   | Dorny paths-filter + git diff to find affected projects   | 5 min   |
| `quality-gates`    | Prettier format, ESLint, TypeScript typecheck, Jest tests | 30 min  |
| `build-validation` | Web, Lambda, mobile builds for affected projects          | 30 min  |
| `e2e`              | Playwright `@critical` tests (1 shard on PRs)             | 30 min  |
| `summarize`        | Posts PR comment with status table, applies CI labels     | 10 min  |

### CI Labels

The `summarize` job applies labels based on which stage failed:

| Label                        | Stage                                          |
| ---------------------------- | ---------------------------------------------- |
| `CI: Formatting`             | Prettier check failed                          |
| `CI: Lint Failure`           | ESLint failed                                  |
| `CI: Type Error`             | TypeScript typecheck failed                    |
| `CI: Test Failure`           | Jest tests failed                              |
| `CI: Build Failure`          | Build validation failed                        |
| `CI: E2E Failure`            | Playwright tests failed                        |
| `CI: Quality Gates`          | Quality-gates job failed before sub-checks ran |
| `CI: Migration Immutability` | An applied migration file was modified         |

### Key Environment Variables

| Variable             | Value                       | Purpose                                |
| -------------------- | --------------------------- | -------------------------------------- |
| `NX_DAEMON`          | `false`                     | Disables persisted Nx daemon           |
| `NX_NO_CLOUD`        | `true`                      | Local execution only (no Nx Cloud DTE) |
| `NX_SKIP_NX_CACHE`   | `false`                     | Local cache enabled                    |
| `NX_CACHE_DIRECTORY` | `.nx-cache`                 | Local cache path                       |
| `NODE_OPTIONS`       | `--max_old_space_size=4096` | 4 GB heap limit                        |
| `NX_VERBOSE_LOGGING` | `true` (debug mode only)    | Extended error context                 |

## Bot-Driven Code Review

### Reviewer W1 (`review.yml`)

The Code Reviewer Bot (`legacy-sports-review-bot`, App ID `3142924`) uses GitHub Models (`openai/gpt-4o-mini` by default, configurable via `REVIEWER_MODEL` and `LLM_PROVIDER`) with a custom reviewer script (`.github/scripts/reviewer/index.mjs`) to analyze PR diffs and post structured reviews. Alternate providers (`copilot-cli`, `anthropic`) are selectable via `LLM_PROVIDER`.

**Review outcomes:**

| Finding severity | GitHub review action | `bot-review` status |
| ---------------- | -------------------- | ------------------- |
| Critical / high  | `REQUEST_CHANGES`    | `failure`           |
| Clean diff       | `APPROVE`            | `success`           |

When `bot-review` transitions to `success`, the bot also adds the `merge-when-ready` label.

### Review Cycle Protocol (RAISE / ADJUDICATE / VERIFY)

See `AGENTS.md §8` (Author Agent Contract) for the full protocol. Summary:

| Cycle                | Triggered by                 | Author must reply with                            |
| -------------------- | ---------------------------- | ------------------------------------------------- |
| Cycle 1 (RAISE)      | PR `ready_for_review`        | `FIX: <sha>` or `JUSTIFY: <rationale>` per thread |
| Cycle 2 (ADJUDICATE) | `bot:ready-for-review` label | `FIX: <sha>` only — no `JUSTIFY:`                 |
| Cycle 3+ (VERIFY)    | `bot:ready-for-review` label | `FIX: <sha>` or `CANNOT-COMPLY: <issue-id>`       |

#### Cycle Counter Hard Rules

The cycle is computed from immutable PR review history:

```
cycle = count(formal reviews where author == legacy-sports-review-bot[bot]
              AND state != DISMISSED
              AND body does not contain '<!-- bot-infra-failure: true -->') + 1
```

Two review types are **excluded** from the count and do not advance the cycle:

1. **Infrastructure-failure reviews** — reviews posted when the LLM API fails (rate limits, auth errors, API errors, or exhausting all retries). These carry `<!-- bot-infra-failure: true -->` in their body. Excluding them prevents transient outages from triggering false escalation to `needs-human-arbitration`. The `review-bot-degraded` label and W4 alert still fire so operators are notified. See LS-4108.
2. **DISMISSED reviews** — reviews dismissed by GitHub's "dismiss stale approvals on push" policy are no longer relevant to the current diff.

Author-actionable failures (`cost-cap`, `context-too-large`) are **not** excluded — they represent real feedback requiring the author to reduce PR size.

### `bot-review` Commit Status

The `bot-review` commit status (set by the reviewer script via the Checks API) tracks review state:

| Status    | Meaning                                             |
| --------- | --------------------------------------------------- |
| `pending` | Review in progress or awaiting Cycle 2 trigger      |
| `success` | Clean review — no unresolved critical/high findings |
| `failure` | Unresolved findings block merge                     |

## Merge Queue

The merge queue (`merge-queue.yml`) is a **label-based custom workflow** — not GitHub's built-in merge queue.

### Merge Conditions

A PR merges automatically when **all** of these are true:

1. PR is not a draft
2. No merge conflicts (`mergeable: true`)
3. `bot-review` commit status = `success`
4. All other status checks passing (or skipped/neutral)
5. No unresolved review threads from any reviewer
6. For non-`main` targets: `merge-to-parent` label also required

The queue debounces 30 seconds after CI or review events before processing. Concurrency is strictly serialized.

### Apps Involved

| App                                                       | Purpose                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Merge Queue App** (`MERGE_QUEUE_APP_ID`)                | Merges PRs, posts comments, deletes branches, re-targets dependent PRs |
| **Review Bot** (`legacy-sports-review-bot`, ID `3142924`) | Sets `bot-review` status, approves PRs after clean review              |

## Standalone Checks

These run as independent workflows alongside the main CI Pipeline:

| Workflow                       | Trigger                         | Purpose                             |
| ------------------------------ | ------------------------------- | ----------------------------------- |
| `check-schema.yml`             | GraphQL/schema file changes     | Validates SDL + codegen sync        |
| `check-migrations-applied.yml` | Migration file changes          | Confirms migrations applied in prod |
| `check-conflicts.yml`          | Every PR                        | Confirms no merge conflicts         |
| `required-checks-lint.yml`     | Every PR                        | Naming discipline lint (W3)         |
| `security-scanning.yml`        | Dep/code changes, `merge_group` | Dependency + SAST + secret scans    |

## Design Decisions

### CI gated behind bot approval (not every push)

The old system ran CI on every `pull_request` push. The greenfield design runs CI only when the Code Reviewer Bot approves or when the PR enters the merge group. This eliminates CI minutes spent on work-in-progress commits.

### Local execution (no Nx Cloud DTE)

The old system used Nx Cloud Distributed Task Execution (8 agents), requiring quota management, fallback logic, and cloud token management. The greenfield design uses local execution (`NX_NO_CLOUD=true`) for simpler, more predictable behavior. GitHub Actions-based Nx caching (see [nx-remote-caching-implementation.md](nx-remote-caching-implementation.md)) compensates for the lack of cloud DTE.

### Custom merge queue over GitHub's built-in

GitHub's built-in merge queue conflicted with the label-based review flow and offered less control over conditions. The custom `merge-queue.yml` provides precise condition checking, structured feedback comments, and integration with the `bot-review` status.
