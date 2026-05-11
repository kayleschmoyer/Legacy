# Entrypoints

Every task funnels into the [6-phase spine](../spine.md) through exactly one entrypoint. The entrypoint determines which artifacts are required and which gates apply. Pick before starting.

## Decision tree

```
Is production currently broken or degraded?
├── Yes → 01-incident-hotfix
└── No → Continue
        │
        Did a CVE / security advisory just arrive?
        ├── Yes → 03-security-cve
        └── No → Continue
                │
                Are you reverting a merged change?
                ├── Yes → 13-revert
                └── No → Continue
                        │
                        Is a CI check on main failing or a test flaky?
                        ├── Yes → 04-ci-flaky-triage
                        └── No → Continue
                                │
                                Are you picking up someone else's in-flight PR
                                (or resuming your own after a long gap)?
                                ├── Yes → 10-inherited-pr
                                └── No → Continue
                                        │
                                        Is there a bug report with no ticket yet?
                                        ├── Yes → 02-bug-investigation
                                        └── No → Continue
                                                │
                                                Is the work timeboxed research / POC?
                                                ├── Yes → 11-spike
                                                └── No → Continue
                                                        │
                                                        Is this a feature flag / A/B rollout?
                                                        ├── Yes → 12-experimentation
                                                        └── No → Continue
                                                                │
                                                                Is this a schema, data, or infra migration?
                                                                ├── Yes → 08-migration
                                                                └── No → Continue
                                                                        │
                                                                        Is this a dependency upgrade?
                                                                        ├── Yes → 07-dependency-upgrade
                                                                        └── No → Continue
                                                                                │
                                                                                Is this behavior-preserving cleanup?
                                                                                ├── Yes → 06-refactor
                                                                                └── No → Continue
                                                                                        │
                                                                                        Is this docs only (no code change)?
                                                                                        ├── Yes → 09-docs-only
                                                                                        └── No → 05-new-feature
```

## Entrypoint table

| #   | Entrypoint                                     | Default risk tier | Required artifacts                            |
| --- | ---------------------------------------------- | ----------------- | --------------------------------------------- |
| 1   | [incident-hotfix](01-incident-hotfix.md)       | Critical          | Repro (abbreviated), postmortem, test plan    |
| 2   | [bug-investigation](02-bug-investigation.md)   | Medium            | Repro, test plan                              |
| 3   | [security-cve](03-security-cve.md)             | Critical          | Repro (if exploitable), postmortem, test plan |
| 4   | [ci-flaky-triage](04-ci-flaky-triage.md)       | Medium            | Repro, test plan                              |
| 5   | [new-feature](05-new-feature.md)               | Medium            | RFC (Medium+), test plan                      |
| 6   | [refactor](06-refactor.md)                     | Medium            | RFC (if scope > one file), test plan          |
| 7   | [dependency-upgrade](07-dependency-upgrade.md) | Medium            | Test plan (regression-focused)                |
| 8   | [migration](08-migration.md)                   | High              | RFC, ADR, test plan, rollback plan            |
| 9   | [docs-only](09-docs-only.md)                   | Low               | (none)                                        |
| 10  | [inherited-pr](10-inherited-pr.md)             | Medium            | Continuation plan                             |
| 11  | [spike](11-spike.md)                           | Low               | RFC (the deliverable)                         |
| 12  | [experimentation](12-experimentation.md)       | High              | RFC, ADR, test plan, success metrics          |
| 13  | [revert](13-revert.md)                         | Critical          | Postmortem (if production was affected)       |

## Variants folded into existing entrypoints

- **Resuming your own stalled work** → 10-inherited-pr (variant: author = you)
- **Rebasing on top of major upstream change** → 10-inherited-pr (variant: rebase-only)
- **Design-only ticket** → 05-new-feature with RFC as the deliverable
- **CVE-driven dependency upgrade** → 03-security-cve takes precedence over 07-dependency-upgrade

## Entrypoint doc structure

Every entrypoint doc follows this shape:

1. **Trigger** — what causes you to be on this path
2. **Default risk tier** — overridable with justification
3. **Required artifacts** — what must exist before merge
4. **Phase notes** — what's different from the spine default
5. **Diagram** — inline SVG showing path-specific gates
6. **Anti-patterns** — common ways this entrypoint goes wrong
7. **Related skills** — which operational skills to load
