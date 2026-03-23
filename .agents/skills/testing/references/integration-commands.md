# Running Integration Tests

Commands, Nx targets, environment setup, and troubleshooting for integration tests.

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
