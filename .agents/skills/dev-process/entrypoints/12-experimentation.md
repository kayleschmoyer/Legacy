# Entrypoint 12: Experimentation (Feature Flag, A/B Test)

**Trigger**: rolling out a change behind a feature flag, A/B test, or staged rollout to compare variants or de-risk a launch.

**Default risk tier**: High (experiments touch the live user experience and can have unintended interactions with other features).

**Required artifacts**: [RFC](../artifacts/rfc.md), [ADR](../artifacts/adr.md) (for the experiment framework choice if new), [test plan](../artifacts/test-plan.md), **success metrics** definition, **kill plan**.

## Path notes

Experiments are features with extra obligations: a measurement plan, a decision deadline, and a kill plan. The risk is **flag rot** — flags that ship, get half-rolled-out, and stay forever, accumulating dead code paths.

### Phase 1: Frame

- State the **hypothesis**: "If we change X, then Y will improve by Z%."
- Define the **success metrics** quantitatively. "Engagement goes up" is not a metric; "session length increases by ≥5% with p < 0.05" is.
- Define the **decision deadline**: when will we look at the data and decide ship / roll-back / iterate? Default: 2 weeks after 50% rollout.
- Define the **kill plan**: under what conditions do we immediately disable the flag? (Error rate, conversion drop, support ticket spike.)

### Phase 2: Design

- RFC includes:
  - Hypothesis and metrics
  - Variant definitions (control, treatment A, treatment B, …)
  - Allocation strategy (random per-user, sticky, segmented)
  - Rollout schedule (1% → 10% → 50% → 100%, with check-in at each)
  - Kill plan
  - Cleanup plan (what code is removed when the experiment concludes)
- ADR for the experiment framework if new (e.g., "we will use GrowthBook for variant assignment").
- Test plan covers both variants — both must work in their entirety.

### Phase 3: Implement

- Flag check in **one place** if possible. Multiple call sites multiply cleanup cost.
- Both variants live in the codebase simultaneously — keep them clearly labeled (`renderControl()` / `renderTreatment()` not `renderOldStyle()` / `renderNewStyle()`).
- Telemetry from day one. An experiment without measurement is just a slow-rolled feature.

### Phase 4: Verify

- Test both variants independently. Both must pass `make pc`.
- Verify flag toggling works locally — flip back and forth, confirm no leaked state.
- Verify telemetry is recording the variant assignment correctly.

### Phase 5: Document

- The RFC is the source of truth for the experiment.
- Once the experiment concludes: update the RFC's status to `Concluded` and note the result.

### Phase 6: Handoff

- Standard PR flow for the implementation PR.
- **Separate PR for cleanup** after the experiment concludes — removes the losing variant and the flag.
- Track the cleanup ticket. Flag rot is real.

## Anti-patterns

- ❌ Experiment with no decision deadline. Flag stays on indefinitely.
- ❌ "We'll measure later." Telemetry from the first commit, or it doesn't ship.
- ❌ Cleanup never happens. The flag must be removed within 2 weeks of conclusion or it becomes permanent debt.
- ❌ Vague success metrics. "Better UX" is not measurable.
- ❌ More than 3 variants in one experiment. Statistical power collapses.
- ❌ Experiment on a feature that's already broken. Fix the bug first; experiments measure deltas, not baselines.

## Related skills

- [RFC artifact](../artifacts/rfc.md)
- [ADR artifact](../artifacts/adr.md)
- [planning](../../planning/SKILL.md)
