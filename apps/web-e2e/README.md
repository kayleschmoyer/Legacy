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
- Not run in CI for PRs by default (too slow) — local execution or the on-demand `run:integration` label is the gate.
- Test files use the `*.integration.spec.ts` naming pattern.
- Test names include `(Live Backend) @integration @critical`.

Run locally:

```bash
pnpm exec nx integration web-e2e -- --grep='Flow Name'
```

See [`.agents/skills/testing/references/integration-commands.md`](../../.agents/skills/testing/references/integration-commands.md) for credentials and setup details.

#### Per-spec unique test users (LS-4940)

Integration fixtures (`src/integration/fixtures/{ui,api}.ts`) derive each spec's commissioner and manager identities from the spec file name rather than re-using a single shared persona email. Each email embeds an 8-char SHA-256 hash of the spec slug — for `league-activity-feed-ui.integration.spec.ts` (slug `league-activity-feed-ui`, hash `b6d61c69`) the logins are:

```
commissioner-b6d61c69@test.legacysports.dev
manager1-b6d61c69@test.legacysports.dev
manager2-b6d61c69@test.legacysports.dev
manager3-b6d61c69@test.legacysports.dev
```

`specSlugFromTestInfo(testInfo)` in [`src/utils/test-user-auth.ts`](src/utils/test-user-auth.ts) returns `<file basename minus extension>`, lowercase; `specUserEmail` hashes it. The hash exists because the underlying `users.username` column is `varchar(50)` and the raw slug would overflow (e.g. `commissioner-league-activity-feed-ui@test.legacysports.dev` is 58 chars). The password is shared across personas via the existing `E2E_<PERSONA>_PASSWORD` env vars — only the email is unique.

**Why**: every spec sharing the same fixed email (`commissioner@test.legacysports.dev`, `manager2@test.legacysports.dev`, ...) hit `429 Too many requests` from Cognito during nightly shard fan-out — both initial login and post-registration login failed back-to-back. Per-spec identities eliminate the collision: each Cognito identity sees at most one login per shard.

**Stable across runs**: the slug is derived from the file path only (not run-id or worker index), so the same spec re-uses the same identity on every run. Per-test `afterAll` cleanup continues to work because each spec's commissioner only ever owns that spec's league(s).

**Adding a new integration spec**: there is nothing to wire up — request `commissionerJwt` / `commissionerPage` / `managerJwt{1,2,3}` from the `ui` fixtures (or `api` / `api2` / `apiCommissioner` from the `api` fixtures) as before; the fixture transparently derives the per-spec identity from `testInfo`.

**Overrides**: `INTEGRATION_JWT` (UI fixtures) / `INTEGRATION_JWT_COMMISSIONER` (API fixtures) still short-circuit the per-spec commissioner with a pre-issued JWT, and the local CLI auth store (`~/.legacy-sports/auth.json`) still wins over the per-spec path for local debugging. The per-spec path is the nightly-CI fallback.

#### Reviewer evidence: the `run:integration` label (LS-4617)

The reviewer bot expects structured evidence for any touched integration spec because the suite does not run on PRs by default. Apply the **`run:integration`** label to a PR to dispatch [`.github/workflows/run-integration-tests.yml`](../../.github/workflows/run-integration-tests.yml):

1. The workflow checks out the PR head, diffs against the merge base to find every touched `apps/web-e2e/src/integration/tests/**/*.integration.spec.ts` file, and runs only those (`workers=1` against `api.legacy-fantasy.com`).
2. It uploads the HTML report as a workflow artifact and posts a PR comment containing one `<integration-results>` block per touched spec, e.g.

   ```text
   <integration-results>
   spec: apps/web-e2e/src/integration/tests/foo.integration.spec.ts
   status: passed
   duration_ms: 12345
   report: https://github.com/<owner>/<repo>/actions/runs/<id>#artifacts
   </integration-results>
   ```

3. The reviewer bot parses every `<integration-results>` block from PR comments and treats `status: passed` as sufficient evidence for that spec. A touched integration spec with no matching block (or a non-passed status) is flagged `high` with the remediation **"apply the `run:integration` label"** — clear and actionable, never the older "make the report URL fetchable" mandate.

The hermetic suite under `src/tests/` does NOT need this — the green `e2e` GitHub check is sufficient evidence on its own. The label is removed automatically after the run completes; re-apply it to re-run.

You can also dispatch the workflow manually from the Actions tab (`Run workflow` → enter the PR number) for cases where the label cannot be applied (e.g. from a fork PR running with reduced permissions).

## Local authentication

Both suites need a JWT to drive the authenticated UI. Two modes:

- **CI** (or `E2E_AUTH_MODE=ci`): `global-setup.ts` signs a hermetic JWT locally with `E2E_SIGNING_SECRET`. No backend validates it — the hermetic mocks never check signatures. Nothing to set up.
- **Local**: the OAuth device flow signs you in with a real Google account. The resulting JWT is cached **machine-wide** at `~/.legacy-sports/e2e-token.json` (Windows: `%USERPROFILE%\.legacy-sports\e2e-token.json`), so every worktree on the same machine reuses one cached token until it expires. The cache file lives outside any worktree, so `twig worktree clean` never destroys it.

To mint or refresh the token without launching Playwright:

```bash
make e2e-auth
# prints `already authenticated as <email>` if a valid token is cached,
# otherwise opens the browser for the device handshake and writes the cache.
```

The CLI lives at [`scripts/e2e-auth.mjs`](../../scripts/e2e-auth.mjs) and shares its device-flow + cache implementation with [`src/global-setup.ts`](src/global-setup.ts) (LS-4679).

## Why two suites?

The split mirrors the distinction between unit tests and integration tests in the backend:

- **E2E (mocked)**: fast, deterministic, runs in CI — catches UI regressions and user-flow correctness without requiring a live backend.
- **Integration**: validates cross-service behavior (live draft state machine, real auth, async backend processes) that cannot be meaningfully mocked.

The same carve-out pattern already applies to `console.log` — `apps/web-e2e/.eslintrc.json` sets `"no-console": "off"` for `src/**/*.ts` because test files legitimately use console output.

## Precedent

[PR #3763](https://github.com/bkrupa/legacy-sports/pull/3763) (LS-4289) — the reviewer bot incorrectly flagged `page.request.post` in a live-draft integration spec as a hermeticity violation across 3 review cycles. This documentation and the corresponding rule updates in `AGENTS.md`, `.github/reviewer-rules.md`, and `.agents/skills/testing/SKILL.md` were added (LS-4290) to prevent that from recurring.
