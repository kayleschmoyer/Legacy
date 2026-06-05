# Gate: Pre-PR Checklist

The mandatory checklist between Phase 4 (Verify) and Phase 6 (Handoff). This is the **mark-ready gate** — run it before calling `github_mark_pr_ready`, not before pushing. Push the first commit and open the **draft** PR early as a durable checkpoint (so an ephemeral/cloud container reaped during `make pc` is non-fatal); a draft PR is inert until marked ready. The `make pc` check below must be green before mark-ready, but does not gate the first push or the draft-PR open — see the draft-PR-first note in [create-pr.md](../../pr-lifecycle/references/create-pr.md#prerequisites). The bot review is not a substitute — it catches mechanical issues; this catches everything else.

## Universal checks (every entrypoint, every tier)

- [ ] **`make pc` passes cleanly.** Not "I think it passes" — actually green output, not a stale cached run.
- [ ] **All test-plan cases have a corresponding test or `manual: <reason>` evidence.**
- [ ] **No `console.*` in production code.** Use `LOGGER` from `@legacy-sports/logging`.
- [ ] **No `@ts-ignore`, `@ts-expect-error`, `eslint-disable` in this PR.** Suppressions are banned — fix the root cause. The narrow exception path (single-line, named rule, `-- description`) is documented in [standards/lint-discipline.md](../../standards/references/lint-discipline.md) and requires explicit justification in the PR description.
- [ ] **No generated files manually edited.** `*.generated.ts`, `schema.graphql` are auto-produced.
- [ ] **No secrets in code, comments, or commit messages.**
- [ ] **All TODOs in this PR have a Jira ticket.** Bare `// TODO` or `// FIXME` is deferred work without an owner.
- [ ] **PR description includes the test plan and manual verification evidence.**
- [ ] **Branch contains the Jira key in the commit messages** for branch-sync to fire.

## Code-touch checks

- [ ] **Read every file you changed in full** (not just the diff hunk). Issues hide outside the diff window.
- [ ] **No drive-by changes** unrelated to the ticket. If you found something while in there, file a separate ticket.
- [ ] **Touched docs updated** per the [touch-map](documentation-freshness.md).
- [ ] **Self-review using `/review`** — the 13 mechanical patterns + 7 judgment patterns from [common-review-patterns.md](../../pr-lifecycle/references/common-review-patterns.md).

## UI-touch checks

- [ ] **Manually exercised the change in a browser.** Golden path + at least one edge case.
- [ ] **Responsive check** if a layout changed.
- [ ] **Accessibility check** (keyboard navigation, screen reader, focus order) if interactive elements changed.
- [ ] **No `transition: all`** — enumerate specific properties; only animate transform/opacity.
- [ ] **No inline hex** in `.tsx` files — use named constants from `colors.ts`.

## Test-touch checks

- [ ] **Wrote tests that fail without your fix and pass with it.** For bug fixes: assert the regression case fails first, then passes.
- [ ] **Ran the new/modified test files locally** before commit.
- [ ] **For E2E or integration tests: full [determinism checklist](../../testing/references/e2e-determinism.md) audited.**
- [ ] **Stress-ran new E2E tests** at least 20 times locally; zero failures.
- [ ] **No `waitForTimeout`, no real `Date.now()`, no real RNG, no shared state.**

## Schema/migration-touch checks

- [ ] **Migration is idempotent.** Re-runnable safely if interrupted.
- [ ] **Rollback plan documented in PR description.**
- [ ] **Locally applied + locally rolled back** to verify both directions.
- [ ] **Forward-compatible**: code that reads the new schema is in a separate PR from the schema change.

## Tier-specific checks

### Medium and above

- [ ] **RFC exists and is `Status: Accepted`** before the implementation PR opens.

### High and above

- [ ] **ADR for any architectural decision** introduced.
- [ ] **Two reviewers requested** (CODEOWNERS + one additional).
- [ ] **Local integration test run** mandatory; not optional.

### Critical

- [ ] **Postmortem scheduled** (within 24h of incident close, published within 1 week).
- [ ] **Incident commander identified.**
- [ ] **Production monitoring confirmed** for at least 30 min post-deploy.

## What this checklist is not

- It is not a substitute for thinking. Each box is a prompt — passing it requires actual verification, not just clicking.
- It is not a substitute for the bot review. The bot catches different things.
- It is not a substitute for the [common-review-patterns](../../pr-lifecycle/references/common-review-patterns.md) self-review.

## Anti-patterns

- ❌ Checking boxes you didn't actually verify.
- ❌ "Mostly green" `make pc`. Green or not green; there is no mostly.
- ❌ Skipping manual UI verification because "tests pass." Tests prove invariants you knew to assert; manual catches the rest.
- ❌ "I'll add the test plan to the PR description after merge." Never happens.

## Related

- [Spine: Phase 4 Verify](../spine.md#phase-4-verify)
- [pr-lifecycle self-review](../../pr-lifecycle/references/self-review.md)
- [common-review-patterns](../../pr-lifecycle/references/common-review-patterns.md)
- [e2e-determinism](../../testing/references/e2e-determinism.md)
