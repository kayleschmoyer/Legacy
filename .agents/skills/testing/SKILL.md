---
name: testing
description: 'Write, run, and debug tests: Jest unit tests, Playwright E2E tests (hermetic, mocked), and Playwright integration tests (real services). Covers test type selection, commands, tagging, API isolation, and CI pipeline.'
---

# Skill: Testing

## When to Use

- Writing or modifying any test (unit, E2E, or integration)
- Running tests before committing changes
- Debugging test failures locally or in CI
- Deciding which test type to use for a feature

## Test Type Selection Guide

| Type             | Tool       | When to Use                                                                  | Reference                                                              |
| ---------------- | ---------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Unit**         | Jest       | Isolated logic, utilities, components, resolvers with mocked deps            | [references/unit-testing.md](references/unit-testing.md)               |
| **E2E (mocked)** | Playwright | Full user flows against a static build; hermetic (no backend)                | [references/e2e-testing.md](references/e2e-testing.md)                 |
| **Integration**  | Playwright | Cross-service validation against real APIs, multi-user flows, async backends | [references/integration-testing.md](references/integration-testing.md) |

### Quick Decision Table

| Scenario                                          | Unit | E2E | Integration |
| ------------------------------------------------- | ---- | --- | ----------- |
| Pure function / utility logic                     | x    |     |             |
| React component renders correctly with known data |      | x   |             |
| Empty/loading/error states                        |      | x   |             |
| Button disabled when input empty                  |      | x   |             |
| Data written to DB and visible to another user    |      |     | x           |
| Role-based access verified against real identity  |      |     | x           |
| Multi-step workflow across multiple users         |      |     | x           |
| Backend async processes complete correctly        |      |     | x           |

## Commands

```bash
# Run affected tests (preferred)
make test

# Test a specific project (prefer nx_run MCP tool when available)
pnpm exec nx run <project>:test

# Run specific test file
pnpm exec nx run <project>:test --testPathPattern="SpecName"

# E2E tests (build first: pnpm exec nx build web)
pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts

# Integration tests (requires deployed/local services)
pnpm exec nx integration web-e2e -- --grep='Flow Name'

# Full pre-commit validation
make pc
```

## Critical Rules

1. **Always run new/modified tests before committing** -- never push untested test code. For bulk test writing (>5 files), run tests per-file as you write rather than batching at the end.
2. **Hermetic E2E -- no `route.continue()`** -- there is no backend in CI. Use `route.fulfill()` for explicit responses and `route.fallback()` to cascade to baseline mocks.
3. **Assert behavior, not pixels** -- use web-first assertions (`await expect(locator).toBeVisible()`) over manual checks. Never use `toHaveScreenshot()` or `toMatchSnapshot()` in E2E tests -- visual regression belongs in Storybook/Chromatic.
4. **Never use `waitForTimeout()`** -- use condition-based waits. Never use `waitForLoadState('networkidle')` -- wait for specific elements.
5. **No `@ts-ignore` or `eslint-disable`** in tests -- fix root causes.
6. **Tag test suites** (`@critical`, `@smoke`, `@regression`, `@slow`) for CI filtering. `@visual` is deprecated. See [references/test-tagging-guide.md](references/test-tagging-guide.md).
7. **Selector sync rule** -- when a PR changes login/landing page UI, update E2E selectors in the same PR.
8. **Kill background servers when done** -- stale processes hold native `.node` addons. Use `make kill-stale`.

## File Naming Convention

| Test Type                           | File Pattern                                                     | Example                                |
| ----------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Unit test                           | `*.spec.ts`                                                      | `scoring.spec.ts`                      |
| Integration test (Jest + DB)        | `*.integration.spec.ts`                                          | `leagues.resolver.integration.spec.ts` |
| Mocked E2E (Playwright)             | `*.spec.ts` in `apps/web-e2e/src/tests/`                         | `league-overview.spec.ts`              |
| Full-stack integration (Playwright) | `*.integration.spec.ts` in `apps/web-e2e/src/integration/tests/` | `live-draft-ui.integration.spec.ts`    |

## E2E Reference Files

- [API Isolation Architecture](references/api-isolation-architecture.md) -- 3-layer mock system
- [CI Pipeline & Validation](references/e2e-ci-and-validation.md) -- running tests, CI behavior, troubleshooting
- [Playwright Best Practices](references/playwright-best-practices.md) -- required patterns and anti-patterns
- [Run E2E Headless](references/run-e2e-headless.md) -- suppress HTML reporter for agent/CI/headless execution (always use `nx run web-e2e:e2e` or `nx_run` MCP tool, never bare `playwright test`)
- [Shutdown Hygiene](references/shutdown-hygiene.md) -- stale process detection and cleanup
- [Test Tagging Guide](references/test-tagging-guide.md) -- tag decision guide with examples

## Integration Reference Files

- [Integration Commands](references/integration-commands.md) -- Nx targets, CLI commands, environment setup
- [UI Integration Patterns](references/ui-integration-patterns.md) -- Playwright+Tamagui interaction patterns
- [UI Serial Phases](references/ui-serial-phases.md) -- serial phase template, switchUser helper, decision table

## Integration with Workflow

Testing is part of the pre-commit sequence: typecheck -> lint -> test -> build. Run the full suite with `make pc`. See [makefile](../makefile/SKILL.md) for all targets.
