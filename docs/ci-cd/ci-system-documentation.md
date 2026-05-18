# Legacy Sports CI/CD System Documentation

> **This document provides operational guidance for the current CI system.** For the full architecture reference, see [ci-greenfield-design.md](ci-greenfield-design.md) (canonical). For the gap analysis and design rationale, see [ci-greenfield-gap-analysis.md](ci-greenfield-gap-analysis.md).

## Overview

The Legacy Sports CI/CD system is a **visibility-first, bot-reviewed, label-merge platform** built on GitHub Actions, Nx workspace management, and AWS infrastructure. The current system was rebuilt from scratch as part of the LS-3857 epic (2026). For full architecture details see the greenfield design doc.

## Quick Reference

| What you need             | Where to look                                                              |
| ------------------------- | -------------------------------------------------------------------------- |
| Full architecture         | [ci-greenfield-design.md](ci-greenfield-design.md)                         |
| Why we rebuilt the CI     | [ci-greenfield-gap-analysis.md](ci-greenfield-gap-analysis.md)             |
| Copilot reviewer design   | [ci-greenfield-copilot-evaluation.md](ci-greenfield-copilot-evaluation.md) |
| CI check failures & fixes | `.agents/skills/pr-lifecycle/references/ci-checks-reference.md`            |
| Pipeline debugging        | `.agents/skills/debugging/references/ci-pipeline-architecture.md`          |
| Advanced troubleshooting  | [ci-troubleshooting-guide.md](ci-troubleshooting-guide.md)                 |
| Merge queue               | [merge-queue-guide.md](merge-queue-guide.md)                               |
| Nx caching                | [nx-remote-caching-implementation.md](nx-remote-caching-implementation.md) |

## Core Workflows

| Workflow                   | Purpose                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `ci-orchestrator.yml`      | Entry point: routes PR events to CI pipeline or security scan     |
| `ci-pipeline.yml`          | Main quality gate: format, lint, typecheck, test, build, E2E      |
| `review.yml` (Reviewer W1) | Bot-driven code review (Copilot CLI + `legacy-sports-review-bot`) |
| `merge-queue.yml`          | Label-based automated merge (`merge-when-ready`)                  |
| `security-scanning.yml`    | Dep/SAST/secret scans (conditional)                               |

## CI Trigger Model

CI does **not** run on every push. The pipeline runs when:

1. The Code Reviewer Bot approves a non-draft PR (`pull_request_review` event, bot is reviewer, state is approved)
2. The PR enters the GitHub merge group (`merge_group` event)
3. Manual dispatch (`workflow_dispatch`)
4. The `ci:run` label is added to the PR (one-shot bypass of the bot-review gate)

This prevents CI minutes from being consumed by work-in-progress commits.

### ci:run label

`ci:run` is a **one-shot** label: adding it triggers CI immediately without waiting for a bot review approval, then the orchestrator removes it automatically after CI completes (success or failure). It exists for early validation on drafts or infra-only changes where waiting for a full review cycle is unnecessary. Re-adding the label fires CI again.

## Deployment Architecture

| Target           | Workflow                                            | Trigger                                                           |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Web app          | `deploy-web.yml`                                    | Push to `main` (paths: `apps/web/**`, `lib/shared-components/**`) |
| Lambda functions | `upload-lambdas.yml` → `lambda-terraform-apply.yml` | Push to `main` (paths: `lambdas/**`)                              |
| Mobile (iOS)     | `build-ios-app.yml`                                 | Manual / tag                                                      |
| Mobile (Android) | `build-android-app.yml`                             | Manual / tag                                                      |

## Common Operations

### Fix a failing CI check

See [ci-troubleshooting-guide.md](ci-troubleshooting-guide.md) or `.agents/skills/pr-lifecycle/references/ci-checks-reference.md` for per-check fix commands.

### Add a PR to the merge queue

Add the `merge-when-ready` label to the PR. See [merge-queue-guide.md](merge-queue-guide.md) for the full conditions.

### Debug a CI failure

1. Check the `CI: *` labels applied to the PR — they identify the failing stage.
2. Read the PR comment posted by the `summarize` job.
3. Use `ci_get_logs(runId: RUN_ID, failedOnly: true)` to pull error lines.

See `.agents/skills/debugging/references/ci-failure.md` for the full triage workflow.

### Enable debug mode

Add the `ci-debug` label to a PR to enable `NX_VERBOSE_LOGGING` and extended error context in `quality-gates` and `build-validation` jobs.

### Check deployment status

```bash
# Web deployment
gh run list --workflow deploy-web.yml --limit 5

# Lambda deployment
gh run list --workflow upload-lambdas.yml --limit 5
gh run list --workflow lambda-terraform-apply.yml --limit 5
```

## Nx Cache Configuration

The CI pipeline uses local GitHub Actions caching for Nx outputs (`NX_NO_CLOUD=true`). See [nx-remote-caching-implementation.md](nx-remote-caching-implementation.md) for the full caching implementation.

## CI Badge Configuration

See [CI_BADGES_SETUP.md](CI_BADGES_SETUP.md) and [badge-logging-improvements.md](badge-logging-improvements.md).
