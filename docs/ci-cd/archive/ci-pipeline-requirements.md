> **Archived 2026-04-27.** This document describes a system that has been replaced. See [ci-greenfield-design.md](../ci-greenfield-design.md) for the current architecture.

---

# CI Pipeline Requirements

> **Last updated:** 2026-02-18  
> Track changes to this document alongside any structural changes to `.github/workflows/ci-pipeline.yml` or the composite actions it calls.

## Table of Contents

1. [Purpose](#purpose)
2. [Constraints](#constraints)
3. [Functional Requirements](#functional-requirements)
4. [Job Architecture](#job-architecture)
5. [Execution Modes](#execution-modes)
6. [Action Contracts](#action-contracts)
7. [Permissions](#permissions)
8. [Design Decisions & Rationale](#design-decisions--rationale)
9. [What Must Not Change](#what-must-not-change)
10. [Change Log](#change-log)

---

## Purpose

The CI pipeline (`ci-pipeline.yml`) validates every pull request and push to `main` by running code quality, build, and end-to-end tests across the Nx monorepo. It is invoked exclusively as a reusable workflow by `ci-orchestrator.yml`.

---

## Constraints

These are hard constraints that drive design decisions. **Any proposed change must be evaluated against them.**

| #   | Constraint                                                                                                                                                                   | Source                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| C1  | **Nx Cloud DTE quota is limited.** Quota must not be consumed when DTE is unavailable or exhausted. Local fallback must never call `start-ci-run`.                           | Business (billing)    |
| C2  | **DTE availability is unknown at workflow start.** It must be probed before any agent or cloud session is started.                                                           | Nx Cloud architecture |
| C3  | **Agents must be sibling jobs, not steps.** Starting agents inside a step means they can't receive tasks until after setup completes, wasting quota.                         | Nx Cloud DTE model    |
| C4  | **`NX_CLOUD_ACCESS_TOKEN` must never be exposed to jobs where DTE is unused.** Setting the env var causes Nx to attempt cloud calls even without an explicit `start-ci-run`. | Quota conservation    |
| C5  | **Node.js 22 is the required runtime.**                                                                                                                                      | Platform requirement  |
| C6  | **pnpm 9.12.1** is the only supported package manager. No npm or yarn fallback.                                                                                              | Monorepo lockfile     |
| C7  | **`skip-ci` PR label must gate the entire pipeline.** All jobs check this label in their `if:` condition.                                                                    | Developer workflow    |
| C8  | **The `summarize` job must always run**, even when upstream jobs fail, to post PR comments and update status badges.                                                         | Developer feedback    |
| C9  | **Optional deps (Storybook, Appium) are excluded from CI installs.** Saves ~160 MB / 4–6 minutes per job.                                                                    | Performance           |

---

## Functional Requirements

### FR-1: Change Detection

- The pipeline **must** detect which Nx projects are affected by the PR diff.
- On `main` branch pushes, a full build is **always** required (no affected filtering).
- `NX_BASE` and `NX_HEAD` SHAs are set via `nrwl/nx-set-shas` in the `setup` action.

### FR-2: DTE Availability Check

- The pipeline **must** probe Nx Cloud quota before starting any agents or cloud sessions.
- If the token is missing, invalid, or quota is exhausted, all tasks **must** run locally without error.
- The probe result must be available as a job output so downstream jobs can conditional-gate on it.

### FR-3: Quality Gates

All of the following targets **must** run on every PR against affected projects:

- `lint` — ESLint, zero warnings allowed (`--max-warnings=0`)
- `typecheck` — TypeScript `tsc --noEmit`
- `test` — Jest unit tests (`passWithNoTests: true`)
- `format:check` — Prettier formatting check (affected files only)

**Order:** format check runs first (fast). Lint + typecheck run together. Tests run after. If any gate fails, the overall job fails.

### FR-4: Build Validation

Builds are scoped to affected components:

- **Web** (`apps/web`) — Vite production build
- **Mobile** (`apps/app`) — TypeScript / bundle validation only (no native build in CI)
- **Lambdas** (`lambdas/*`) — esbuild via `build:lambda` target
- **Terraform** — `terraform validate` / `terraform plan` (no apply in CI)

### FR-5: E2E Testing

- Playwright E2E tests **must** run only after build artifacts are confirmed ready.
- Tests are scoped to `@critical`, `authentication`, `navigation`, and `core-functionality` tags.
- Chromium, headless. Up to 2 retries per test.
- E2E is skipped (not failed) when no build artifacts were produced.

### FR-6: Reporting

- A PR comment **must** be posted (or updated) with per-gate results, execution mode, quota status, failing project names, and a reproduction command.
- CI status badges on `main` branch pushes **must** be updated via Gist.
- The `summarize` job **must** output `overall-status` and `deployment-ready` for the orchestrator to consume.

### FR-7: Deployment Gate

- When a push lands on `main` and all gates pass, the pipeline **must** emit `deployment-ready: true`.
- This output is consumed by the orchestrator to trigger downstream deploy workflows.

---

## Job Architecture

```
ci-orchestrator.yml
└── ci-pipeline.yml (workflow_call)
    ├── detect-dte          ─┐ parallel (no needs)
    ├── detect-changes       ─┘
    │
    ├── agents [1..3]       needs: detect-dte  (only when dte-available == 'true')
    │
    ├── quality-gates       needs: detect-dte, detect-changes
    │
    ├── build-validation    needs: detect-dte, detect-changes, quality-gates
    │
    ├── e2e                 needs: detect-dte, detect-changes, build-validation
    │
    └── summarize           needs: all above  (if: always())
```

### Job Timeouts

| Job                | Timeout |
| ------------------ | ------- |
| `detect-dte`       | 5 min   |
| `detect-changes`   | 5 min   |
| `agents`           | 45 min  |
| `quality-gates`    | 30 min  |
| `build-validation` | 30 min  |
| `e2e`              | 30 min  |
| `summarize`        | 10 min  |

---

## Execution Modes

### Distributed (DTE available)

```
detect-dte ──► (dte-available == true)
                │
                ├── agents [1], [2], [3]  → nx-cloud start-agent  (block until session ends)
                │
                └── quality-gates
                      → nx-cloud start-ci-run          (opens the session)
                      → nx affected -t lint typecheck  (tasks routed to agents)
                      → nx affected -t test            (tasks routed to agents)
                      → nx-cloud stop-all-agents       (always, closes session)
```

**Critical sequencing:** `start-ci-run` is called inside `quality-gates`, not inside any action. The agent jobs connect to this session. The `NX_CLOUD_ACCESS_TOKEN` env var is only set on jobs that need it (`agents`, `quality-gates`).

### Local (DTE unavailable or quota exhausted)

```
detect-dte ──► (dte-available == false)
                │
                └── quality-gates (no agents spawned)
                      NX_NO_CLOUD=true
                      → nx affected -t lint typecheck --parallel=$PARALLEL
                      → nx affected -t test --parallel=$PARALLEL
```

`NX_NO_CLOUD=true` prevents any cloud calls. Nx remote cache read hits still apply when a cache provider is configured separately from DTE.

---

## Action Contracts

These are the composite actions invoked by the pipeline and their required interface. Changes to action inputs/outputs are breaking changes that must be updated in both the action and all callers.

### `detect-dte`

| Input            | Type   | Description                    |
| ---------------- | ------ | ------------------------------ |
| `nx-cloud-token` | string | `NX_CLOUD_ACCESS_TOKEN` secret |

| Output            | Type                            | Description                              |
| ----------------- | ------------------------------- | ---------------------------------------- |
| `dte-available`   | `'true'`/`'false'`              | Whether the cloud session can be started |
| `execution-mode`  | `'distributed'`/`'local'`       | Chosen mode                              |
| `optimal-agents`  | number string                   | Agent count / local `--parallel` value   |
| `fallback-reason` | string                          | Human-readable reason when local mode    |
| `quota-remaining` | `'available'`/`'0'`/`'unknown'` | Quota status for reporting               |

### `detect-changes`

| Input              | Type        | Description                          |
| ------------------ | ----------- | ------------------------------------ |
| `force-full-build` | bool string | Forces full build regardless of diff |

| Output                | Type              | Description                         |
| --------------------- | ----------------- | ----------------------------------- |
| `web`                 | bool string       | Whether web is affected             |
| `mobile`              | bool string       | Whether mobile is affected          |
| `lambdas`             | bool string       | Whether lambdas are affected        |
| `terraform`           | bool string       | Whether terraform is affected       |
| `affected-components` | JSON array string | Component list for `execution-plan` |
| `requires-full-build` | bool string       | Whether diff mandates a full build  |

### `quality-gates`

| Input        | Type               | Description                                               |
| ------------ | ------------------ | --------------------------------------------------------- |
| `dte-active` | `'true'`/`'false'` | Whether `start-ci-run` has already been called by the job |
| `parallel`   | number string      | `--parallel` value for local mode                         |

| Output                       | Type                                | Description                              |
| ---------------------------- | ----------------------------------- | ---------------------------------------- |
| `result`                     | `'success'`/`'failure'`             | Overall gate result                      |
| `dte-quota-exceeded`         | `'true'`/`'false'`                  | Whether a cloud quota error was detected |
| `formatting-result`          | `'success'`/`'failure'`/`'skipped'` |                                          |
| `formatting-failed-projects` | comma string                        |                                          |
| `lint-result`                | `'success'`/`'failure'`             |                                          |
| `lint-failed-projects`       | comma string                        |                                          |
| `typecheck-result`           | `'success'`/`'failure'`             |                                          |
| `typecheck-failed-projects`  | comma string                        |                                          |
| `test-result`                | `'success'`/`'failure'`             |                                          |
| `test-failed-projects`       | comma string                        |                                          |

### `build-validation`

| Input                       | Type                      | Description           |
| --------------------------- | ------------------------- | --------------------- |
| `should-build-web`          | bool string               | From `execution-plan` |
| `should-build-mobile`       | bool string               | From `execution-plan` |
| `should-build-lambdas`      | bool string               | From `execution-plan` |
| `should-validate-terraform` | bool string               | From `execution-plan` |
| `execution-mode`            | `'distributed'`/`'local'` | From `detect-dte`     |
| `optimal-agents`            | number string             | From `detect-dte`     |

| Output            | Type                    | Description                           |
| ----------------- | ----------------------- | ------------------------------------- |
| `overall-result`  | `'success'`/`'failure'` | Blocks `e2e`                          |
| `artifacts-ready` | bool string             | Passed to `e2e` and `deployment-gate` |

### `e2e-testing`

| Input            | Type        | Description                                 |
| ---------------- | ----------- | ------------------------------------------- |
| `should-run-e2e` | bool string | Gated on `build-validation.artifacts-ready` |

| Output   | Type                                | Description |
| -------- | ----------------------------------- | ----------- |
| `result` | `'success'`/`'failure'`/`'skipped'` |             |

---

## Permissions

The pipeline inherits permissions from `ci-orchestrator.yml`. These cannot be reduced per GitHub's `workflow_call` permission model.

| Permission      | Level   | Required by                                |
| --------------- | ------- | ------------------------------------------ |
| `contents`      | `read`  | Checkout                                   |
| `actions`       | `read`  | Workflow run queries                       |
| `pull-requests` | `write` | PR comments (`ci-reporting`)               |
| `checks`        | `read`  | Status check queries                       |
| `issues`        | `write` | Issue creation on failure (`ci-reporting`) |

> **Note:** `security-events: write` is declared on the orchestrator for `security-scanning.yml` but is not needed by `ci-pipeline.yml` itself.

---

## Design Decisions & Rationale

### DD-1: Agents as sibling jobs, not steps

**Decision:** The `agents` matrix job calls `nx-cloud start-agent` and blocks. The `quality-gates` job calls `start-ci-run`.

**Rationale:** When agents are started inside a step, they can't receive tasks until that step completes. As sibling jobs they start in parallel with `quality-gates` setup, so tasks are available to route immediately when `nx affected` is called. This reduces total wall-clock time by the agent setup duration (~60 s).

### DD-2: `detect-dte` runs before agents spawn

**Decision:** `agents` has `needs: [detect-dte]` and an `if: dte-available == 'true'` guard.

**Rationale:** Spawning agents when DTE is unavailable wastes 3 runner-minutes and burns GitHub Actions minutes for no benefit. The `detect-dte` job is cheap (~30 s) and prevents unnecessary spend. This directly addresses constraint C1 and C2.

### DD-3: `NX_CLOUD_ACCESS_TOKEN` is scoped, not global

**Decision:** The token is only set as an env var on `agents` and in the `Start Nx Cloud CI Run` step of `quality-gates`. It is not in the workflow-level `env:` block.

**Rationale:** Setting the token globally causes Nx to attempt cloud task recording on every job, consuming quota even for jobs that don't distribute tasks. (Constraint C4.)

### DD-4: Single `run-tasks` step in `quality-gates`

**Decision:** `quality-gates/action.yml` has one `run-tasks` step that sets `NX_NO_CLOUD=true` when `dte-active=false`, rather than having separate distributed/local code paths.

**Rationale:** The previous design had ~430 lines of duplicated logic across a `distributed` step and a `local` step. Maintainability required keeping them in sync. The current design has a single path: the DTE session is either open (started by the job before calling the action) or not, and Nx handles routing accordingly.

### DD-5: `summarize` job is unconditional

**Decision:** `summarize` has `if: always()` and `needs` all upstream jobs.

**Rationale:** PR feedback must be posted even when the pipeline fails. If `summarize` gated on success, developers would get no PR comment explaining what failed. (Requirement FR-6.)

### DD-6: Warmup job removed

**Decision:** There is no dedicated warmup job. Each job warms its own pnpm store via `actions/setup-node`'s `cache: pnpm` in the `setup` composite action.

**Rationale:** The warmup job added ~45 min of potential serialisation to every run's critical path. The pnpm store cache is keyed on `pnpm-lock.yaml`, so the first job to miss the cache populates it; subsequent jobs (running in parallel on the same commit) all hit it. The net result is equivalent warming with no serial penalty.

### DD-7: `detect-dte` and `detect-changes` run in parallel

**Decision:** Both Stage 1 jobs have no `needs:` — they start simultaneously.

**Rationale:** Both take ~30 s. Running them in parallel shaves 30 s from the critical path before `quality-gates` can start.

---

## What Must Not Change

The following behaviours are load-bearing. A PR that changes them must update this document with a new DD entry and get explicit review.

1. **`detect-dte` must remain the sole gate for agent spawning.** Do not add logic that spawns agents based on any other signal.
2. **`start-ci-run` must only be called when `detect-dte` reports `dte-available == 'true'`.** This is the primary quota guard.
3. **`stop-all-agents` must always run** (via `if: always()`) in `quality-gates` when DTE is active, to prevent hanging agent sessions that consume quota.
4. **The `summarize` job `if: always()` must not be changed to `if: success()`.** PR comments require it.
5. **`NX_NO_CLOUD=true` must be set** in the `run-tasks` step of `quality-gates` when `dte-active != 'true'`.
6. **The `skip-ci` label check must appear in the `if:` of every job**, not just the first one, because GitHub does not short-circuit skipped reusable workflow jobs automatically.
7. **`include-optional-deps: false`** must remain the default for all CI jobs. (Constraint C9.)
8. **Node.js 22** must remain the version passed to the `setup` action across all jobs.

---

## Change Log

| Date       | Author           | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-18 | CI refactor      | Multi-job architecture: detect-dte + detect-changes (parallel) → agents (sibling matrix) → quality-gates → build-validation → e2e → summarize. Removed warmup job. Consolidated quality-gates to single execution path.                                                                                                                                                                                                                                                                                                                                     |
| 2026-02-18 | CI optimizations | (1) detect-dte: removed full pnpm install (uses npx nx-cloud fallback). (2) agent matrix is now dynamic via `agent-matrix` output from detect-dte (capped at 3). (3) execution-plan action removed from build-validation; detect-changes boolean outputs used directly. (4) web build artifact uploaded in build-validation, downloaded in e2e — eliminates dependency on Nx remote-cache for E2E. (5) e2e added to failure-threshold so E2E failures block merge. (6) detect-changes: removed full pnpm install (uses only git + dorny/paths-filter + jq). |