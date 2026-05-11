# Artifact: Test Plan

A list of the cases that prove "done." Written **before** any test code, used as the test-file skeleton, and surfaced in the PR body so reviewers can see what was — and wasn't — verified.

## When required

All entrypoints except 9 (docs-only).

## Path

Two valid locations:

1. **PR body** (default): a `## Test Plan` section in the PR description. Sufficient for most work.
2. **`docs/test-plans/LS-####.md`**: when the plan is large enough to be reviewed independently of the implementation, or when multiple PRs implement one plan.

The test-plan extraction tool reads from either location.

## Required structure

```markdown
## Test Plan

### Cases

- [ ] **Golden path**: <one-sentence description of the happy path> — <test file or `manual`>
- [ ] **Edge: <case name>**: <what makes it an edge case> — <test file or `manual`>
- [ ] **Edge: <case name>**: <…> — <test file or `manual`>
- [ ] **Regression**: <previously broken behavior this PR must preserve> — <test file>

### Determinism

(For PRs that touch E2E or integration tests only)

- [ ] No `waitForTimeout`
- [ ] No real time / real RNG / shared state
- [ ] Stable selectors (data-testid or role+name)
- [ ] Hermetic network in `apps/web-e2e/src/tests/`
- [ ] See [e2e-determinism.md](../../testing/references/e2e-determinism.md) for the full checklist

### Manual verification

(Required for any UI change)

- [ ] Exercised in browser at `<URL>`: <what was checked>
- [ ] Exercised on mobile / tablet (if responsive change): <…>
- [ ] Exercised with screen reader (if accessibility change): <…>
```

Each case maps to either a real test file (preferred) or `manual` (for things genuinely impossible to automate). `manual: <reason>` is acceptable; bare `manual` is not.

## Coverage rule

Every case in the test plan must have **either**:

- A corresponding test that asserts the case, or
- The `manual` marker with a reason and verification evidence in the PR body.

If a case has no test and no `manual` marker, the PR is not ready for review.

## Anti-patterns

- ❌ Test plan written after the tests. The plan is a design tool; retroactive plans are checkbox theater.
- ❌ Vague cases: "works correctly", "handles errors". Cases must be specific enough that a reader knows what passing means.
- ❌ Skipping the determinism checklist for E2E/integration changes. This is the #1 source of CI flake.
- ❌ Burying `manual` in the description without evidence. Manual verification needs a one-line evidence note (URL exercised, what was checked).

## Tool surface

MCP tools implemented in `tools/mcp/dev-process-server/` (server: `legacy-sports-dev-process`):

- ✅ `testplan_extract({ pr | path })` — pull the structured cases from a PR body or test-plan file.
- ✅ `testplan_coverage_check({ pr })` — return `{ totalCases, automatedCases, manualCases, missingCases }`. Block merge on missing.
- ✅ `testplan_diff({ baseRef, headRef })` — show new cases added vs base; useful for review.

## Related

- [testing](../../testing/SKILL.md) — test type selection.
- [e2e-determinism](../../testing/references/e2e-determinism.md) — the determinism checklist this artifact gates on.
- [Template](../templates/test-plan-template.md).
