# Running Integration Tests

Commands, Nx targets, environment setup, and troubleshooting for integration tests.

## Integration tests target live services — never localhost

Integration tests (`*.integration.spec.ts`) run against real deployed services. **Never configure `INTEGRATION_BASE_URL` to point at localhost or a static file server.** The fixture's `getTestUserJwt()` call, WebSocket connections, and GraphQL mutations all require a live backend. A localhost target will produce misleading 404s or connection-refused errors that look like test logic failures but are actually environment misconfiguration.

If you need a local backend, run the lambda stack locally (`make dev`) and point `INTEGRATION_BASE_URL` at `http://localhost:5001` — but only if you have verified the full stack is running. In CI, `INTEGRATION_BASE_URL` must always point to a deployed environment (staging or production).

## Integration tests CAN be run locally

Agents commonly assume integration auth requires credentials only available in CI. **It does not.** Test-user credentials live in the main repo's gitignored `.env` (`E2E_COMMISSIONER_EMAIL/PASSWORD`, `E2E_MANAGER_1..3_EMAIL/PASSWORD`, `E2E_POOL_PASSWORD`, `VITE_OAUTH_PROXY_URL`), and the worktree bootstrap script symlinks that file into every native worktree. After running:

```
node scripts/modules-pool/link.mjs
```

…integration tests will pick up auth automatically — `playwright.integration.config.ts` loads `<repo>/.env` and the API/UI fixtures call `getTestUserJwt()` against the live OAuth proxy to obtain JWTs at runtime. No additional setup is required for the standard fixtures (`api`, `api2`, `apiCommissioner`, `commissionerPage`, `managerPage1..3`).

**Tier-based auth (LS-8055)**: to authenticate as a specific access level, use `loginAs(tier, seat = 1)` from `apps/web-e2e/src/utils/test-user-auth.ts` (defaults to `('premium', 1)`), or the `premiumJwt` / `premiumJwt2` / `freeJwt` / `freeJwt2` / `adminJwt` / `adminJwt2` API fixtures. **Premium is the convention default; reserve `free` for specs that assert a premium gate fires** — see the canonical [Tiered Test-User Model](../SKILL.md#tiered-test-user-model-premium-default-free-for-gates) section for the rule and copy-paste examples. These resolve to stable, pre-provisioned identities (not per-spec hashed emails), because a user's tier is a DB column with no GraphQL write path. The provisioned pool is **6 premium / 6 free / 2 admin**: premium seats 1-2 are the commissioner + manager-2 (promoted to `subscription_tier='premium'`), free seats 1-2 are manager-1 + manager-3, admin seat 1 is `access_level='admin'` on a _free_ subscription (exercises the isAdmin→premium override) and seat 2 is admin + premium. Seats 3-6 (and admin) are new `@test.legacysports.dev` users sharing `E2E_POOL_PASSWORD`. Use `seat` to draw distinct same-tier identities for a multi-user league (e.g. `loginAs('premium', 2)` for a premium↔premium trade). A premium token is **not** blocked by `premium-feature-gate`. Note that _commissioner vs member vs non-member is a per-league role_ (who owns/joins the league), not a property of the identity — compose it in the spec. `E2E_POOL_PASSWORD` must be present in `.env` for any seat ≥ 3 and the admin seats.

Caveats:

- **Google OAuth tests only**: a small subset of tests need `GOOGLE_TEST_EMAIL` / `GOOGLE_TEST_PASSWORD`. These are not in the main `.env` by default. If you need to run those specifically, ask the user to populate the values; otherwise filter them out with `--grep-invert='@google'` or similar.
- **`INTEGRATION_BASE_URL`** defaults to production (`https://api.legacy-fantasy.com/`) when unset. Override only if you need to target staging or a local backend.
- **`.env` linking**: `node scripts/modules-pool/link.mjs` (and `make install` / `make wt-setup`) symlinks `.env` and `.env.local` from the main repo into the worktree as part of setup. If a real (non-symlink) `.env` is already present in the worktree, the resolver leaves it alone — copy `.env`/`.env.local` from main manually in that case.

## Nx Targets

## Nx Targets

The following targets are already configured in `apps/web-e2e/project.json` using the `nx:run-commands` executor:

```json
{
  "integration": {
    "executor": "nx:run-commands",
    "options": {
      "command": "playwright test --config=playwright.integration.config.ts",
      "cwd": "{projectRoot}"
    }
  },
  "integration:ui": {
    "executor": "nx:run-commands",
    "options": {
      "command": "playwright test --config=playwright.integration.config.ts --ui",
      "cwd": "{projectRoot}"
    }
  }
}
```

## Commands

```powershell
# Run all integration tests
pnpm exec nx integration web-e2e

# Run a specific flow
pnpm exec nx integration web-e2e -- --grep='Draft Flow'

# Run smoke checks only
pnpm exec nx integration web-e2e -- --grep='@smoke'

# Interactive UI mode
pnpm exec nx integration:ui web-e2e

# Against a deployed environment
$env:INTEGRATION_BASE_URL = "https://api.staging.example.com"
$env:INTEGRATION_WS_URL = "wss://ws.staging.example.com"
$env:INTEGRATION_JWT = "eyJ..."
pnpm exec nx integration web-e2e
```

## Troubleshooting

### Test times out waiting for async flow

1. Check Lambda logs: `.\scripts\aws-logs.ps1 -Function <lambda> -Since 15m -Filter "ERROR"`
2. Check SQS DLQ for failed messages (see `.agents/skills/debugging/SKILL.md`)
3. Increase timeout and intervals — some flows are slower under load
4. Verify the trigger mutation returned successfully (check for GraphQL errors)

### WebSocket never connects

1. Verify `INTEGRATION_WS_URL` points to the correct endpoint
2. Check JWT is valid and not expired
3. Test WS connectivity manually: open browser console → `new WebSocket('wss://...')`
4. Check WebSocket Lambda logs: `.\scripts\aws-logs.ps1 -Function websocket -Since 15m`

### Tests pass locally but fail in CI

1. CI may use different env vars — verify `INTEGRATION_BASE_URL` is set in CI workflow
2. Network latency is higher in CI — increase timeouts
3. Check if the target environment is actually running / deployed

### `expect.poll()` passes but data is wrong

The poll succeeded (condition met) but downstream assertions fail — the async process completed with incorrect data. This is a real bug. Follow `.agents/skills/debugging/SKILL.md` to root-cause.
