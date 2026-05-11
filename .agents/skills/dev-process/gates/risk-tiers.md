# Gate: Risk Tiers

Every task is assigned a risk tier in Phase 1 (Frame). The tier governs which artifacts are required and how strict each phase's exit gate is.

This document supersedes the previous Low/Medium/High classification in [planning](../../planning/SKILL.md) by adding **Critical** and tying tiers explicitly to entrypoints and artifact requirements.

## The four tiers

| Tier         | Time budget   | Use when                                                                                         | Default for entrypoints |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| **Low**      | 2–3 min       | Single file, docs, tests, mechanical change. Trivial to verify by inspection.                    | 9, 11                   |
| **Medium**   | 5–10 min      | Business logic change, multi-file, schema usage (not change). Requires running the code.         | 2, 4, 5, 6, 7, 10       |
| **High**     | 10–15 min     | Auth, payments, infra, migrations, multi-system contracts. Failure has user-visible consequence. | 8, 12                   |
| **Critical** | No time limit | Production incidents, security, data integrity, reverts. Speed and rigor both maximized.         | 1, 3, 13                |

Time budgets are **planning estimates for the implementation phase** — not deadlines. Critical work intentionally has no time limit because optimizing for speed there is the wrong target.

## Decision tree

```
Is production currently broken or actively at risk?
├── Yes → Critical
└── No → Continue
        │
        Could a bug here cause data loss, security exposure, or charge users incorrectly?
        ├── Yes → High
        └── No → Continue
                │
                Does the change span more than 3 files OR change a public API
                OR change a schema OR add a dependency?
                ├── Yes → Medium
                └── No → Continue
                        │
                        Is the change a single file, mechanical, and trivially verifiable?
                        ├── Yes → Low
                        └── No → Default to Medium
```

## What each tier requires

| Requirement                       | Low        | Medium     | High        | Critical                        |
| --------------------------------- | ---------- | ---------- | ----------- | ------------------------------- |
| RFC                               | No         | Yes        | Yes         | After-the-fact OK               |
| ADR for architectural decisions   | No         | Yes        | Yes         | After-the-fact OK               |
| Test plan                         | Yes        | Yes        | Yes         | Yes (regression case mandatory) |
| Manual UI verification            | If UI      | If UI      | Always      | Always                          |
| Local integration test run        | If touched | If touched | Always      | Always                          |
| Postmortem                        | No         | No         | If incident | Yes                             |
| Self-review                       | Yes        | Yes        | Yes         | Yes                             |
| Two-reviewer rule                 | No         | No         | Yes         | Yes                             |
| Bot-PR cycle limit                | 3          | 3          | 3           | 1 (escalate fast)               |
| Time spent before asking for help | 30 min     | 60 min     | 30 min      | 10 min                          |

## Tier-up triggers

Even if the entrypoint defaults to a lower tier, raise to the next tier when:

- **Touches authentication or authorization** → High
- **Touches payment processing or financial calculations** → High
- **Modifies migration files or schema** → High
- **Crosses a service boundary** → at least Medium
- **Changes external API contracts** → High
- **Affects > 10 files** → at least Medium
- **CI on main is currently broken because of this area** → Critical until main is green
- **Customer-reported issue currently affecting users** → Critical

## Tier-down triggers

Lower the tier (with explicit justification in the ticket) when:

- **Reverting a single recent commit with no schema/data side-effects** → Medium (from default Critical)
- **Adding a non-runtime test or doc** → Low
- **Pure formatting / linting** → Low (but consider why CI didn't catch it)

## Anti-patterns

- ❌ Defaulting to Low because the diff is small. Risk is about consequence, not size.
- ❌ Defaulting to High because the area "feels scary." Justify the consequence concretely.
- ❌ Tier-down without writing why. Future readers need to understand the assessment.
- ❌ "Critical" used to bypass review. Critical means _more_ rigor, not less.

## Related

- [planning](../../planning/SKILL.md) — how to assess risk in practice
- [pre-PR checklist](pre-pr-checklist.md) — gate that consults the tier
- [Spine: Phase 1 Frame](../spine.md#phase-1-frame) — where the tier is assigned
