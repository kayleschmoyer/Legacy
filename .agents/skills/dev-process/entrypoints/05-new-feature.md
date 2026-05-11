# Entrypoint 05: New Feature

**Trigger**: a backlog feature ticket has been picked up. The dominant path in this codebase.

**Default risk tier**: Medium (Low for trivial single-file additions; High for features touching auth/payments/data).

**Required artifacts**: [RFC](../artifacts/rfc.md) (Medium+), [test plan](../artifacts/test-plan.md), ADR (if introducing a new pattern, library, or boundary).

## Path notes

This is the entrypoint that [workflow-overview](../../workflow-overview/SKILL.md) operationalizes. Use that doc for the literal step-by-step (worktree creation, MCP tool calls, CI gates). This doc explains _which_ of those steps are gated by _what_ in the dev-process model.

### Phase 1: Frame

- Restate the acceptance criteria. If you cannot, run `/define` to elicit them.
- Risk-tier the work using [gates/risk-tiers.md](../gates/risk-tiers.md). Medium is the default; justify Low or High.
- For features spanning multiple PRs: run `/slice` to decompose into child tickets. Each child gets its own dev-process pass.

### Phase 2: Design

- Medium+ tier: write an RFC. Use `/define` if you also need to elicit the spec.
- For UI features: run [shape](../../frontend-design/SKILL.md) before any code.
- For features touching multiple services: ADR for any new boundary or contract.
- Test plan written before implementation begins. The plan IS the test file skeleton.

### Phase 3: Implement

- Vertical slices, green tree per commit (see [spine](../spine.md)).
- Apply [coding standards](../../standards/SKILL.md). No suppressions.
- For UI: apply [frontend-design](../../frontend-design/SKILL.md) for production-grade interfaces.
- Tests written alongside implementation, not after.

### Phase 4: Verify

- Standard `make pc` gate.
- For UI features: manual exercise mandatory (see [pre-PR checklist](../gates/pre-pr-checklist.md)).
- For features that touch E2E or integration tests: run the full determinism checklist.

### Phase 5: Document

- Touch-map for affected docs (see [documentation-freshness](../gates/documentation-freshness.md)).
- Promote any drafted RFC to accepted.
- Promote any drafted ADRs to numbered ADRs.

### Phase 6: Handoff

- Standard bot-PR flow per [pr-lifecycle](../../pr-lifecycle/SKILL.md).
- Self-review (mandatory) before push.
- Drive to merge — do not stop after creating the PR.

## Anti-patterns

- ❌ Skipping the RFC for a Medium-tier feature because "it seems small." If it's actually small, the RFC is short — write it anyway.
- ❌ "I'll add tests at the end." Tests written after the implementation tend to test what the code does, not what it should do.
- ❌ Inheriting the previous ticket's worktree to "save setup time." Always one-ticket-one-worktree-one-PR.
- ❌ Marking the task complete after the PR is opened. Task completes at merge.

## Related skills

- [workflow-overview](../../workflow-overview/SKILL.md) — operational runbook for this entrypoint
- [planning](../../planning/SKILL.md) — risk classification details
- [pr-lifecycle](../../pr-lifecycle/SKILL.md) — bot-PR contract
- [worktree-workflow](../../worktree-workflow/SKILL.md) — worktree mechanics
- [frontend-design](../../frontend-design/SKILL.md) — for UI work
