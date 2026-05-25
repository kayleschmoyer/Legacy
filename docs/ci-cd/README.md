# CI/CD Documentation

This directory contains documentation for the Legacy Sports CI/CD system. The current system was rebuilt from scratch as part of the LS-3857 epic (2026).

## Canonical References (Start Here)

| Document                                                                       | Purpose                                                                                               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **[ci-greenfield-design.md](ci-greenfield-design.md)**                         | **← Architecture reference.** Trigger model, pipeline jobs, bot review, merge queue, design decisions |
| **[ci-greenfield-gap-analysis.md](ci-greenfield-gap-analysis.md)**             | **← Why we rebuilt.** Problems with the old system, required checks summary, phase timeline           |
| **[ci-greenfield-copilot-evaluation.md](ci-greenfield-copilot-evaluation.md)** | **← Bot review design.** Copilot CLI integration, RAISE/ADJUDICATE/VERIFY cycle protocol              |

## Integration Safety

- **[integration-safety-system.md](integration-safety-system.md)** — **← Preventing breaking changes at integration points.** Tiered defense (GraphQL contract gate, terraform plan gate, selective integration + advisory) that shifts UI/backend and terraform breakage detection left, off the nightly suite and onto the PR that causes it.

## Operational Guides

- **[ci-system-documentation.md](ci-system-documentation.md)** — Quick reference: workflows, trigger model, common operations
- **[ci-troubleshooting-guide.md](ci-troubleshooting-guide.md)** — Diagnosing CI failures by label, fixing bot-review failures, merge queue issues
- **[merge-queue-guide.md](merge-queue-guide.md)** — Full merge queue reference: conditions, labels, troubleshooting, authentication

## Infrastructure & Tooling

- **[nx-remote-caching-implementation.md](nx-remote-caching-implementation.md)** — GitHub Actions-based Nx caching (still relevant)
- **[CI_BADGES_SETUP.md](CI_BADGES_SETUP.md)** — Status badge configuration
- **[badge-logging-improvements.md](badge-logging-improvements.md)** — Badge logging enhancements

## Agent References

The canonical per-check fix commands and CI triage workflows live in the agent skills directory:

- `.agents/skills/pr-lifecycle/references/ci-checks-reference.md` — Per-check fix commands and master lookup table
- `.agents/skills/debugging/references/ci-pipeline-architecture.md` — Pipeline diagram, timeouts, env vars
- `.agents/skills/debugging/references/ci-failure.md` — Evidence-first CI triage workflow
- `.agents/skills/debugging/references/ci-troubleshooting-advanced.md` — Concurrency, E2E, Terraform lock debugging

## Quick Start

### PR failing CI?

1. Check the `CI: *` label applied to the PR (it names the failing stage)
2. Read the PR comment posted by the `summarize` job
3. Run `make pc` locally to reproduce and fix
4. See [ci-troubleshooting-guide.md](ci-troubleshooting-guide.md) for per-failure-type commands

### Bot review blocked (`bot-review: failure`)?

1. Run `github_get_review_threads({ number: PR# })` to get open threads
2. Fix issues and commit
3. Reply to each thread: `FIX: <sha>` or `JUSTIFY: <rationale>`
4. The push fires the next cycle automatically — `bot:ready-for-review` persists through merge (LS-4678), so re-applying is unnecessary unless it was externally removed
5. See `AGENTS.md §8` for the full Author Agent Contract

### PR not merging?

Add the `merge-when-ready` label. The merge queue checks: no conflicts, `bot-review: success`, all CI passing, no unresolved review threads. See [merge-queue-guide.md](merge-queue-guide.md).

## Archived Documentation

Superseded docs have been moved to [`archive/`](archive/). Each carries a banner noting its archival date and pointing to the current canonical doc.

<details>
<summary>Archived files (click to expand)</summary>

| File                                                                                           | Reason archived                                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [archive/ci-bot-review-spec.md](archive/ci-bot-review-spec.md)                                 | Describes system deliberately built away from   |
| [archive/ci-pipeline-evaluation.md](archive/ci-pipeline-evaluation.md)                         | Historical analysis                             |
| [archive/ci-pipeline-requirements.md](archive/ci-pipeline-requirements.md)                     | Superseded by greenfield design                 |
| [archive/ci-workflow-migration-status.md](archive/ci-workflow-migration-status.md)             | Old migration status                            |
| [archive/ci-migration-plan.md](archive/ci-migration-plan.md)                                   | Superseded by gap analysis Phase plan           |
| [archive/improved-ci-system-design.md](archive/improved-ci-system-design.md)                   | Superseded by greenfield design                 |
| [archive/cloud-ready-ci-configuration.md](archive/cloud-ready-ci-configuration.md)             | Nx Cloud DTE config (now using local execution) |
| [archive/dte-quota-checking.md](archive/dte-quota-checking.md)                                 | Nx Cloud DTE quota (superseded)                 |
| [archive/intelligent-dte-detection.md](archive/intelligent-dte-detection.md)                   | Nx Cloud DTE detection (superseded)             |
| [archive/github-actions-cleanup.md](archive/github-actions-cleanup.md)                         | Superseded by this epic                         |
| [archive/merge-queue-integration-build-fix.md](archive/merge-queue-integration-build-fix.md)   | Historical fix                                  |
| [archive/merge-queue-permissions-fix.md](archive/merge-queue-permissions-fix.md)               | Historical fix                                  |
| [archive/pr-comments-implementation-summary.md](archive/pr-comments-implementation-summary.md) | Superseded by reviewer's output                 |
| [archive/pr-comments-merge-queue-analysis.md](archive/pr-comments-merge-queue-analysis.md)     | Historical analysis                             |

</details>

---

[← Back to Documentation Hub](../README.md)
