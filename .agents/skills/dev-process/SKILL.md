---
name: dev-process
description: 'The development process framework: 13 entrypoints, 6-phase shared spine, structured artifacts (RFC, ADR, postmortem, continuation, test-plan, repro), risk-tier gates, and documentation freshness rules. Load when: starting any task, evaluating which gates apply, producing or consuming a process artifact, or onboarding a new agent.'
---

# Skill: Development Process

The canonical framework for how work flows from trigger to merged change in this repository. Every task — feature, bug, hotfix, spike, RFC, revert — funnels through one of 13 **entrypoints** into a shared 6-phase **spine**, gated by **risk-tier checks** and producing **structured artifacts** that downstream tooling can consume.

This skill is the design layer. The operational runbook for the dominant path (planned ticket → worktree → PR → merge) lives in [workflow-overview](../workflow-overview/SKILL.md). The bot-PR review contract lives in [pr-lifecycle](../pr-lifecycle/SKILL.md). This skill explains **why** those steps exist, **when** they apply, and **what** other paths exist for non-default work.

## Critical Rules

1. **Pick an entrypoint before you start.** Every task maps to exactly one of the 13 entrypoints in [entrypoints/](entrypoints/). Picking determines which artifacts are required and which gates apply. If unsure, see [entrypoints/README.md](entrypoints/README.md) for the decision tree.
2. **Risk tier governs gate strictness.** Low/Medium/High/Critical (see [gates/risk-tiers.md](gates/risk-tiers.md)) — Critical tier (incidents, security, reverts) skips RFC/design but mandates postmortem and stricter review.
3. **Artifacts are mandatory at known paths.** RFCs in `docs/rfcs/`, ADRs in `docs/decisions/`, postmortems in `docs/postmortems/`. See [artifacts/](artifacts/) for schemas. Tools depend on these locations.
4. **Documentation lives in the same PR as the code it describes.** No "I'll document it later" tickets — see [gates/documentation-freshness.md](gates/documentation-freshness.md).
5. **Determinism is non-negotiable in tests.** E2E and integration tests must follow the 12 determinism principles in [../testing/references/e2e-determinism.md](../testing/references/e2e-determinism.md). Flake is treated as a P1 bug.

## The 6-Phase Spine

Every entrypoint, regardless of trigger, flows through these phases. See [spine.md](spine.md) for the full description.

| Phase            | Purpose                                                            | Exit gate                                        |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| 1. **Frame**     | Restate the problem in your own words; identify scope and risk     | Risk tier assigned, ticket exists                |
| 2. **Design**    | Lightweight RFC for Medium+; test plan for all                     | RFC accepted (if required), test plan written    |
| 3. **Implement** | Vertical slices, green tree per commit, docs alongside code        | All planned changes coded                        |
| 4. **Verify**    | `make pc` + manual exercise + edge cases + determinism check       | All gates green                                  |
| 5. **Document**  | Update touched docs, archive RFC/ADR if produced, write postmortem | All affected docs current                        |
| 6. **Handoff**   | PR opened, reviewed, merged; tracking tasks closed                 | PR merged, Jira Done, audit run, tasks completed |

## Master Flow Diagram

```mermaid
flowchart TB
    subgraph Triggers["Trigger events"]
        T["Incident · Bug · CVE · Flake · Feature · Refactor · Upgrade · Migration · Doc · PR-pickup · Spike · Experiment · Revert"]
    end

    Triggers --> Entrypoints

    subgraph Entrypoints["13 entrypoints (see entrypoints/README.md)"]
        E["01 incident · 02 bug · 03 cve · 04 flake · 05 feature · 06 refactor · 07 upgrade · 08 migration · 09 docs · 10 inherited · 11 spike · 12 experiment · 13 revert"]
    end

    Entrypoints --> Spine

    subgraph Spine["6-phase spine"]
        direction TB
        P1["1 Frame"] --> P2["2 Design"] --> P3["3 Implement"] --> P4["4 Verify"] --> P5["5 Document"] --> P6["6 Handoff"]
    end

    Spine --> Exit["PR merged · Jira Done · Audit run · Tasks closed"]
```

Full diagram source (more detail per node) at [diagrams/master-flow.mmd](diagrams/master-flow.mmd). Regenerate SVG for external use with `make diagrams`.

## The 13 Entrypoints

| #   | Entrypoint                                                 | Trigger                                | Default risk tier |
| --- | ---------------------------------------------------------- | -------------------------------------- | ----------------- |
| 1   | [incident-hotfix](entrypoints/01-incident-hotfix.md)       | Production outage or P0 bug            | Critical          |
| 2   | [bug-investigation](entrypoints/02-bug-investigation.md)   | Reported defect, no ticket yet         | Medium            |
| 3   | [security-cve](entrypoints/03-security-cve.md)             | CVE alert, security advisory           | Critical          |
| 4   | [ci-flaky-triage](entrypoints/04-ci-flaky-triage.md)       | Flaky test or CI-on-main failure       | Medium            |
| 5   | [new-feature](entrypoints/05-new-feature.md)               | Backlog feature ticket                 | Medium            |
| 6   | [refactor](entrypoints/06-refactor.md)                     | Tech debt, behavior-preserving         | Medium            |
| 7   | [dependency-upgrade](entrypoints/07-dependency-upgrade.md) | Dependabot, manual upgrade             | Medium            |
| 8   | [migration](entrypoints/08-migration.md)                   | Schema, data, infra change             | High              |
| 9   | [docs-only](entrypoints/09-docs-only.md)                   | Documentation change with no code      | Low               |
| 10  | [inherited-pr](entrypoints/10-inherited-pr.md)             | Picking up someone else's in-flight PR | Medium            |
| 11  | [spike](entrypoints/11-spike.md)                           | Timeboxed research / POC               | Low               |
| 12  | [experimentation](entrypoints/12-experimentation.md)       | Feature flag, A/B test rollout         | High              |
| 13  | [revert](entrypoints/13-revert.md)                         | Roll back a merged change              | Critical          |

See [entrypoints/README.md](entrypoints/README.md) for the entrypoint decision tree.

## Artifacts

Every artifact has a stable schema and a known path so MCP tools and CI can consume them.

| Artifact          | Path pattern                                   | Required by                                    | Schema doc                                                       |
| ----------------- | ---------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| RFC               | `docs/rfcs/LS-####-slug.md`                    | Medium+ entrypoints (5, 6, 8, 12), all spikes  | [artifacts/rfc.md](artifacts/rfc.md)                             |
| ADR               | `docs/decisions/NNNN-slug.md`                  | Any architectural decision                     | [artifacts/adr.md](artifacts/adr.md)                             |
| Test plan         | PR body section OR `docs/test-plans/`          | All entrypoints except 9 (docs-only)           | [artifacts/test-plan.md](artifacts/test-plan.md)                 |
| Repro report      | Jira ticket field                              | Entrypoint 2 (bug-investigation), 4 (CI flake) | [artifacts/repro-report.md](artifacts/repro-report.md)           |
| Continuation plan | PR comment with `<!-- continuation -->` marker | Entrypoint 10 (inherited PR)                   | [artifacts/continuation-plan.md](artifacts/continuation-plan.md) |
| Postmortem        | `docs/postmortems/YYYY-MM-DD-slug.md`          | Entrypoints 1, 3, 13 + any Critical tier       | [artifacts/postmortem.md](artifacts/postmortem.md)               |

Templates for each live in [templates/](templates/).

## Gates

| Gate                                                        | When it applies                                         |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| [Risk tiers](gates/risk-tiers.md)                           | Phase 1 (Frame) — drives all subsequent gate strictness |
| [Pre-PR checklist](gates/pre-pr-checklist.md)               | Phase 4 (Verify) → Phase 6 (Handoff) transition         |
| [Documentation freshness](gates/documentation-freshness.md) | Phase 5 (Document) — touch-map enforcement              |

## How this skill relates to others

- [workflow-overview](../workflow-overview/SKILL.md) — operational runbook for the new-feature entrypoint (the dominant path). This skill describes _which entrypoint_ you're on; workflow-overview describes _how to execute_ the new-feature entrypoint specifically.
- [pr-lifecycle](../pr-lifecycle/SKILL.md) — the bot-PR review contract (Cycles 1/2/3, FIX/JUSTIFY/CANNOT-COMPLY). This skill stops at "PR opened"; pr-lifecycle takes over from there.
- [planning](../planning/SKILL.md) — risk classification details. Used by Phase 1 (Frame).
- [standards](../standards/SKILL.md) — coding conventions enforced during Phase 3 (Implement).
- [testing](../testing/SKILL.md) — test type selection and the determinism reference used by Phase 4 (Verify).
- [worktree-workflow](../worktree-workflow/SKILL.md) — the substrate for code changes. Every entrypoint that produces code uses this.

## Tooling spec (planned, not yet implemented)

Each artifact has a planned MCP tool surface. These are documented in the artifact docs themselves so future tooling work has a fixed spec. Tools are **not implemented** in this round — only the contract is fixed.

| Tool                      | Purpose                                                              | Spec                                                                          |
| ------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `rfc_create`              | Scaffold a new RFC with required sections                            | [artifacts/rfc.md](artifacts/rfc.md#tool-surface)                             |
| `rfc_validate`            | Check an RFC has all required sections and links resolve             | [artifacts/rfc.md](artifacts/rfc.md#tool-surface)                             |
| `adr_create`              | Scaffold a new ADR with auto-incremented number                      | [artifacts/adr.md](artifacts/adr.md#tool-surface)                             |
| `adr_supersede`           | Mark an ADR superseded by another                                    | [artifacts/adr.md](artifacts/adr.md#tool-surface)                             |
| `testplan_extract`        | Pull the test plan section from a PR body                            | [artifacts/test-plan.md](artifacts/test-plan.md#tool-surface)                 |
| `testplan_coverage_check` | Verify each test-plan case has a corresponding test                  | [artifacts/test-plan.md](artifacts/test-plan.md#tool-surface)                 |
| `repro_capture`           | Save a repro report (steps, env, observed, expected) to a Jira field | [artifacts/repro-report.md](artifacts/repro-report.md#tool-surface)           |
| `continuation_post`       | Post a structured continuation plan as a PR comment                  | [artifacts/continuation-plan.md](artifacts/continuation-plan.md#tool-surface) |
| `postmortem_create`       | Scaffold a postmortem with required sections                         | [artifacts/postmortem.md](artifacts/postmortem.md#tool-surface)               |
