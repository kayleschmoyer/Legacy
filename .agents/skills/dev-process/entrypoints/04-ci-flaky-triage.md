# Entrypoint 04: CI / Flaky Test Triage

**Trigger**: a CI check on `main` is failing, or a test is intermittently failing across PRs ("flaky").

**Default risk tier**: Medium (raise to High if blocking all PR merges).

**Required artifacts**: [repro report](../artifacts/repro-report.md) (frequency must be quantified), [test plan](../artifacts/test-plan.md).

## Path notes

Flake is a P1 bug. Tests that "sometimes pass" are worse than tests that always fail — they teach the team to ignore failures, which then masks real bugs.

### Phase 1: Frame

- Quantify the flake rate. "Sometimes fails" is not a repro — gather data: across how many recent runs, what's the failure rate, is it correlated with anything (time of day, shard, parallel test count, environment)?
- Tag the test `@flaky` immediately so it stops blocking merges. **Filing the `@flaky` tag without a tracking ticket is an anti-pattern** — file the ticket in the same commit.
- For CI-on-main failures: separate "is the test broken" from "is the code broken." A green CI on PRs followed by a red CI on main usually means a merge race or environment difference.

### Phase 2: Design

- Apply the [12 determinism levers](../../testing/references/e2e-determinism.md) to identify the cause:
  - Real time? Real RNG? Shared state? `waitForTimeout`? Stable selectors?
- The fix is almost always one of these levers; if it isn't, the test may be exercising a real intermittent bug — escalate to bug-investigation.
- Test plan must include a **stress run**: run the test 50–100x locally and confirm zero failures.

### Phase 3: Implement

- Fix the determinism lever, not the symptom. "Add a retry" is a symptom fix; "remove the race" is a real fix.
- Remove the `@flaky` tag in the same commit as the fix.

### Phase 4: Verify

- Stress run: 50 local runs minimum. If any fail, the fix is incomplete.
- For CI-only flakes (cannot reproduce locally): merge with the fix, then monitor the next 20 main runs.

### Phase 5: Document

- If the flake exposed a class of issues (whole class of tests has the same problem): file a follow-up ticket to audit the class.
- Update [e2e-determinism.md](../../testing/references/e2e-determinism.md) if a new lever was discovered.

### Phase 6: Handoff

- Standard PR flow.
- PR title must include "flaky" and the test name: `fix(e2e): make <test-name> deterministic via <lever> (LS-####)`.

## Anti-patterns

- ❌ Adding `test.skip()` or `@flaky` without a tracking ticket. The test is now invisible until someone notices and re-files.
- ❌ "Add a retry to make it pass." Retries hide flake; they do not fix it.
- ❌ Increasing a timeout. The test was racing on something — find the something.
- ❌ Stress-running 5 times and declaring it fixed. Flakes often fail at 1-in-50 rates; you need 50+ runs.
- ❌ Closing the ticket without removing the `@flaky` tag.

## Related skills

- [testing](../../testing/SKILL.md) — test layers and tagging
- [e2e-determinism](../../testing/references/e2e-determinism.md) — the 12 levers
- [debugging](../../debugging/SKILL.md)
- [cloudwatch-archaeology](../../cloudwatch-archaeology/SKILL.md) — for backend-driven flakes
