# Entrypoint 06: Refactor

**Trigger**: a behavior-preserving change to existing code — extract a helper, rename a module, restructure a directory, replace one library with another.

**Default risk tier**: Medium

**Required artifacts**: [RFC](../artifacts/rfc.md) (if scope > one file), [test plan](../artifacts/test-plan.md) (regression-focused).

## Path notes

The risk in a refactor is **silently changing behavior**. The defining test of a refactor is: can you describe the change such that "no behavior changed" is the observable property? If not, this is a feature, not a refactor — switch entrypoints.

### Phase 1: Frame

- State the refactor's goal in one sentence. "Extract the auth check to a shared helper." If you cannot, scope is unclear.
- Identify what must NOT change: outputs, side effects, performance characteristics, public API.
- Risk-tier: a refactor that touches many call sites is High even if each individual change is mechanical.

### Phase 2: Design

- For multi-file refactors: RFC with **before/after diagrams** of the structure.
- For library replacements: ADR documenting the choice.
- Test plan focuses on **regression coverage**: list every behavior that must stay identical, and the test that asserts it.
- If existing test coverage is insufficient to prove behavior preservation, **add tests for the existing behavior first** (in a separate PR), then refactor in a second PR.

### Phase 3: Implement

- One commit per atomic change. A refactor PR with one giant commit is a code-review hazard.
- Mechanical commits (rename, move, extract) separate from semantic commits (any change in logic).
- If you find a bug while refactoring: **separate ticket**. Bundling bug fixes into refactors is the most common way refactors silently change behavior.

### Phase 4: Verify

- All existing tests pass without modification. If a test had to change, the refactor changed behavior — investigate.
- If you added regression tests in a prior PR: confirm they all pass.
- Performance characteristics: for refactors that could affect perf (loops, queries, allocation), benchmark before/after.

### Phase 5: Document

- Update any docs that name the changed structure.
- If the refactor establishes a new pattern: write a brief reference doc under the relevant skill.

### Phase 6: Handoff

- Standard PR flow.
- PR description must call out **"no behavior change intended"** explicitly so reviewers know what to focus on.

## Anti-patterns

- ❌ "Refactor + bug fix" in one PR. Always separate.
- ❌ "Refactor + small feature" in one PR. Always separate.
- ❌ Modifying tests as part of a refactor. If a test had to change, the refactor changed behavior — investigate before continuing.
- ❌ "It's just a rename." Renames touch every call site; they are not free. Risk-tier accordingly.
- ❌ Refactor with no regression test plan. If you can't list what must not change, you can't verify nothing did.

## Related skills

- [standards](../../standards/SKILL.md)
- [testing](../../testing/SKILL.md)
- [planning](../../planning/SKILL.md) — risk classification
