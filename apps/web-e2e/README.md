# web-e2e

Playwright test suite for the `web` app. Contains two distinct suites with different network contracts.

## Directory Structure

| Directory                | Suite type   | Network                                 | Playwright config                  |
| ------------------------ | ------------ | --------------------------------------- | ---------------------------------- |
| `src/tests/`             | E2E (mocked) | Hermetic — no real backend              | `playwright.config.ts`             |
| `src/integration/tests/` | Integration  | Live backend (`api.legacy-fantasy.com`) | `playwright.integration.config.ts` |

### E2E suite — `src/tests/`

Runs in CI against a static build with no backend. All network calls are intercepted and fulfilled by a 3-layer mock stack:

1. **Test layer** (`route.fulfill()` inline in each spec)
2. **Auth fixture layer** (`src/fixtures/auth.ts`)
3. **Baseline layer** (`src/fixtures/shared-mocks.ts`)

Rules:

- **Never use `route.continue()`** — there is no backend; it will hang. Use `route.fulfill()` for explicit responses and `route.fallback()` to cascade to the next mock layer.
- Test files use the `*.spec.ts` naming pattern.
- Suites are tagged (`@critical`, `@smoke`, `@regression`) for CI filtering.

Run locally:

```bash
pnpm exec nx e2e web-e2e -- --config=apps/web-e2e/playwright.config.ts
# or via Make
make e2e-scope  # detect minimum scope based on changed files
```

See [`.agents/skills/testing/references/e2e-testing.md`](../../.agents/skills/testing/references/e2e-testing.md) for the full mock architecture.

### Integration suite — `src/integration/tests/`

Runs against the live backend. Uses test-user credentials auto-linked from the main repo's `.env` by the worktree bootstrap script.

Rules:

- Direct `page.request` API calls are **expected** — this is not a hermeticity violation.
- Not run in CI for PRs (too slow) — local execution is the only gate.
- Test files use the `*.integration.spec.ts` naming pattern.
- Test names include `(Live Backend) @integration @critical`.

Run locally:

```bash
pnpm exec nx integration web-e2e -- --grep='Flow Name'
```

See [`.agents/skills/testing/references/integration-commands.md`](../../.agents/skills/testing/references/integration-commands.md) for credentials and setup details.

## Why two suites?

The split mirrors the distinction between unit tests and integration tests in the backend:

- **E2E (mocked)**: fast, deterministic, runs in CI — catches UI regressions and user-flow correctness without requiring a live backend.
- **Integration**: validates cross-service behavior (live draft state machine, real auth, async backend processes) that cannot be meaningfully mocked.

The same carve-out pattern already applies to `console.log` — `apps/web-e2e/.eslintrc.json` sets `"no-console": "off"` for `src/**/*.ts` because test files legitimately use console output.

## Precedent

[PR #3763](https://github.com/bkrupa/legacy-sports/pull/3763) (LS-4289) — the reviewer bot incorrectly flagged `page.request.post` in a live-draft integration spec as a hermeticity violation across 3 review cycles. This documentation and the corresponding rule updates in `AGENTS.md`, `.github/reviewer-rules.md`, and `.agents/skills/testing/SKILL.md` were added (LS-4290) to prevent that from recurring.
