## Test Plan

### Cases

- [ ] **Golden path**: <one-sentence happy-path description> — `<test file path>` or `manual: <reason>`
- [ ] **Edge: <case name>**: <what makes it edge> — `<test file path>` or `manual: <reason>`
- [ ] **Edge: <case name>**: <…> — `<test file path>` or `manual: <reason>`
- [ ] **Regression**: <previously broken behavior to preserve> — `<test file path>`

### Determinism

(For PRs that touch E2E or integration tests only — delete this section if not applicable.)

- [ ] No `waitForTimeout`
- [ ] No real time / real RNG / shared state across tests
- [ ] Stable selectors (`data-testid` or role+name; never CSS classes)
- [ ] Hermetic network in `apps/web-e2e/src/tests/` (no `route.continue()`)
- [ ] All 12 levers in [e2e-determinism.md](../../testing/references/e2e-determinism.md) audited

### Manual verification

(Required for any UI change — delete if not applicable.)

- [ ] Exercised in browser at `<URL>`: <what was checked>
- [ ] Mobile / tablet (if responsive change): <what was checked>
- [ ] Screen reader (if accessibility change): <what was checked>
