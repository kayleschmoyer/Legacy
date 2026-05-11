# Entrypoint 02: Bug Investigation

**Trigger**: a defect has been reported (user, monitoring, internal observation) but no Jira ticket exists yet, or the existing ticket lacks a repro.

**Default risk tier**: Medium (raise to High if the bug touches auth, payments, or data integrity).

**Required artifacts**: [repro report](../artifacts/repro-report.md), [test plan](../artifacts/test-plan.md).

## Path notes

The investigation is the work. Without a repro, there is no ticket — write the "cannot reproduce" form rather than create a ticket without a reproducer.

### Phase 1: Frame

- Reproduce locally before doing anything else. No repro = no ticket.
- 5-whys or equivalent on the root cause. Distinguish symptom from cause.
- Decide: **fix-now** (trivial + safe + same session) vs **file ticket** (anything else). Bias toward filing — small fixes hidden in unrelated PRs are review hazards.
- Risk-tier the fix once root cause is known.

### Phase 2: Design

- For Low-tier mechanical fixes: skip the RFC. The repro report and test plan are sufficient design.
- For Medium+ fixes that change behavior in a non-obvious way: write a minimal RFC.
- Test plan must include a **regression case** that fails without the fix and passes with it.

### Phase 3: Implement

- The fix is the minimum diff that resolves the repro. Do not refactor, rename, or "improve" surrounding code.
- Comment the regression test with `// regression: LS-####` so its purpose survives.

### Phase 4: Verify

- Re-run the repro from the report. Confirm the bug no longer occurs.
- Run the regression test before the fix → it fails. Apply the fix → it passes. Without this check, you do not know the test exercises the bug.

### Phase 5: Document

- Update touched docs per the touch-map.
- If the bug exposed a documentation gap (the docs said one thing, the code did another), that's a separate doc-only ticket — do not silently fix in the bug PR.

### Phase 6: Handoff

- Standard PR flow.
- PR description must link the repro report.

## Anti-patterns

- ❌ Filing a ticket without a repro and saying "I'll figure it out later." The repro is the ticket.
- ❌ "I fixed it, here's the PR" with no regression test. The bug will return.
- ❌ Drive-by cleanup of nearby code in a bug-fix PR. Separate ticket.
- ❌ Closing a "cannot reproduce" investigation silently. Write the structured "cannot reproduce" report so the next person doesn't redo the work.
- ❌ Fix that doesn't actually exercise the failing path. Always assert: test fails before fix, passes after.

## Related skills

- [repro-report artifact](../artifacts/repro-report.md)
- [debugging](../../debugging/SKILL.md)
- [cloudwatch-archaeology](../../cloudwatch-archaeology/SKILL.md) — for production-only bugs without local repro
- [fix-problem](../../fix-problem/SKILL.md)
