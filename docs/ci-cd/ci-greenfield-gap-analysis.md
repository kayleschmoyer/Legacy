# CI Greenfield Gap Analysis

> **Canonical gap analysis for the LS-3857 CI/Bot-Review System Rebuild.** Documents the problems with the old system and the design rationale for the greenfield replacement. See [ci-greenfield-design.md](ci-greenfield-design.md) for the resulting architecture.

## Problem Statement

The Legacy Sports CI system accumulated several critical gaps that required a greenfield rebuild rather than incremental fixes. The gaps fell into three categories: trigger inefficiency, operational complexity, and missing review infrastructure.

## Identified Gaps

### Gap 1: CI triggered on every push (wasted minutes)

**Old behavior:** The previous `pr-validation.yml` and related workflows triggered on every `pull_request` push event. Cron-based nightly runs added further background load.

**Impact:** CI minutes consumed for work-in-progress commits, re-runs on trivial rebases, and nightly runs against unchanged code.

**Resolution (T19, T29):** CI Orchestrator gates CI execution behind Code Reviewer Bot approval (`pull_request_review` event + bot approved) or `merge_group` entry. Cron-based triggers were removed in T29. CI now runs only when code is ready to validate.

### Gap 2: Nx Cloud DTE complexity

**Old behavior:** The system used Nx Cloud Distributed Task Execution (DTE) with 8 agents. Quota exhaustion required detection and fallback logic. Cloud tokens required management and rotation.

**Impact:** CI failures caused by quota exhaustion (unrelated to code quality), complex fallback paths, and configuration overhead that obscured true test/build failures.

**Resolution:** Greenfield design uses local execution only (`NX_NO_CLOUD=true`). See [nx-remote-caching-implementation.md](nx-remote-caching-implementation.md) for the caching strategy that compensates.

### Gap 3: No structured bot-driven code review

**Old behavior:** Code review was manual. No automated reviewer existed. Review quality was inconsistent and the review gate could be bypassed.

**Impact:** Code quality issues reached `main`. No feedback loop between CI and review. Agents had no structured protocol for responding to review findings.

**Resolution (LS-3879):** Reviewer W1 (`review.yml`) implements bot-driven code review with the Copilot CLI (`codex` model). The RAISE/ADJUDICATE/VERIFY cycle protocol (Author Agent Contract, `AGENTS.md §8`) provides a structured, auditable review loop. The `bot-review` commit status enforces review completion before merge.

### Gap 4: Merge queue reliability

**Old behavior:** Merge automation relied on GitHub's built-in merge queue, which conflicted with the custom review flow and offered limited visibility into merge failures.

**Impact:** Merge failures were opaque. The queue had no mechanism to post explanatory comments or handle custom conditions like `bot-review`.

**Resolution:** Custom `merge-queue.yml` with label-based triggering (`merge-when-ready`), precise condition evaluation, debounced processing, and structured feedback comments for each blocking condition.

### Gap 5: CI failure visibility

**Old behavior:** CI failures required reading scattered logs across multiple jobs. There was no summary or structured failure taxonomy.

**Impact:** Diagnosing CI failures was slow. Agents and humans had to read raw logs to determine root cause.

**Resolution:** The `summarize` job posts a per-stage status table as a PR comment and applies specific `CI: *` labels. The label taxonomy (`CI: Formatting`, `CI: Lint Failure`, `CI: Type Error`, etc.) enables immediate root-cause identification without opening logs.

### Gap 6: No naming discipline enforcement

**Old behavior:** PR title and branch naming was not enforced. Jira ticket keys in PR titles were optional, causing Jira integration failures and inconsistent branch naming.

**Impact:** Jira branch sync failed silently. Branch lists were cluttered with inconsistently named branches.

**Resolution (W3):** `required-checks-lint.yml` enforces naming conventions as a required check. See `.agents/skills/branch-naming/SKILL.md` for the full naming rules.

## Implementation Phases (LS-3857 Epic)

| Phase   | Focus                   | Key Changes                                        |
| ------- | ----------------------- | -------------------------------------------------- |
| Phase 1 | Architecture foundation | CI Orchestrator design, trigger model              |
| Phase 2 | CI Pipeline rebuild     | `ci-pipeline.yml`, quality-gates, build-validation |
| Phase 3 | Bot Review system       | Reviewer W1, cycle protocol, `bot-review` status   |
| Phase 4 | Merge Queue             | Custom `merge-queue.yml`, condition evaluation     |
| Phase 5 | Cleanup                 | Cron removal (T29), doc archiving (T34)            |

## Post-Rebuild State (April 2026)

All phases are complete. The greenfield CI system is the production system.

**Key properties of the post-rebuild system:**

- CI runs only on bot-approved PRs and `merge_group` events (not on every push)
- All CI failures have corresponding `CI: *` labels for instant root-cause identification
- Code review is bot-driven with a 3-cycle RAISE/ADJUDICATE/VERIFY protocol
- Merge is fully automated via the label-based merge queue
- Naming discipline is enforced as a required check (W3)
- Local Nx execution replaces Nx Cloud DTE (simpler, more predictable)

## Required Checks Summary

| Check                           | Source                                    | Blocking             |
| ------------------------------- | ----------------------------------------- | -------------------- |
| `CI Pipeline`                   | `ci-orchestrator.yml` → `ci-pipeline.yml` | Yes                  |
| `bot-review` (commit status)    | `review.yml` reviewer script              | Yes                  |
| `No Merge Conflicts`            | `check-conflicts.yml`                     | Yes                  |
| `Naming Lint` (W3)              | `required-checks-lint.yml`                | Yes                  |
| `GraphQL Schema & Codegen`      | `check-schema.yml`                        | Yes (when triggered) |
| `Verify All Migrations Applied` | `check-migrations-applied.yml`            | Yes (when triggered) |
| `Security Scanning`             | `security-scanning.yml`                   | Advisory             |
