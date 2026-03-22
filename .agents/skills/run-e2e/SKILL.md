---
name: run-e2e
description: 'Run Playwright E2E tests without triggering the HTML reporter or opening a browser window. Use when executing E2E tests from an agent, CI, or headless context where interactive reporters must be suppressed.'
---

# Skill: Run E2E Tests (No HTML Reporter)

## Overview

When agents run Playwright E2E tests, the HTML reporter can block execution by opening a browser window. This skill ensures tests run headlessly with non-interactive reporters.

The web-e2e Playwright config already uses `json` + `line` reporters (no HTML), but agents must use the correct config and avoid fallback behaviors that trigger the HTML report.

## When to Use

- Running E2E tests from an agent or automated workflow
- Executing E2E tests in CI or any headless environment
- Debugging why an E2E test run opened an HTML report unexpectedly

## Rules

| Rule                                                              | Why                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Always use `nx run web-e2e:e2e`** (or `nx_run` MCP tool)        | Uses `apps/web-e2e/playwright.config.ts` which has `json` + `line` reporters |
| **Never run `playwright test` from repo root without `--config`** | Falls back to root `playwright.config.ts` which uses the `html` reporter     |
| **Never use the `e2e:ui` target** from an agent                   | Opens Playwright's interactive UI mode — blocks the terminal                 |

## Running Tests

### Preferred: MCP tool (nx_run)

```
nx_run(project: "web-e2e", target: "e2e")
nx_run(project: "web-e2e", target: "e2e", args: "--grep='League Detail'")
```

### Shell fallback

```bash
# All tests
pnpm exec nx run web-e2e:e2e

# Single test by name
pnpm exec nx run web-e2e:e2e -- --grep='League Detail'

# Filter by tag
PLAYWRIGHT_GREP='@critical|@smoke' pnpm exec nx run web-e2e:e2e
```

### Suppressing HTML reporter explicitly

If you must run Playwright directly (rare), always pass both `--config` and `--reporter`:

```bash
pnpm exec playwright test \
  --config=apps/web-e2e/playwright.config.ts \
  --reporter=line
```

## Reporter Configurations by Config File

| Config file                                     | Reporters                        | Safe for agents?                               |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| `apps/web-e2e/playwright.config.ts`             | `json`, `line`, `blob` (CI)      | Yes                                            |
| `apps/web-e2e/playwright.integration.config.ts` | `html` (`open: 'never'`), `list` | Yes — HTML artifacts saved but no window opens |
| Root `playwright.config.ts` (legacy)            | `html`                           | No — never use this config                     |

## Integration Tests (Special Handling)

The integration test config uses the HTML reporter with `open: 'never'`, so it won't open a browser window. The HTML report artifacts are still written to disk. If you want to avoid generating HTML artifacts entirely, override the reporter:

```bash
# MCP
nx_run(project: "web-e2e", target: "integration", args: "--reporter=list")

# Shell
pnpm exec nx run web-e2e:integration -- --reporter=list
```

## Troubleshooting

| Problem                                      | Fix                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| HTML report opens after test run             | You're using a config without `open: 'never'` — switch to `nx run web-e2e:e2e` or pass `--reporter=line` |
| Tests use wrong config (port 4200, 1 worker) | Pass `--config=apps/web-e2e/playwright.config.ts` explicitly                                             |
| Agent hangs after test completion            | Check if Playwright spawned a browser for the HTML report — pass `--reporter=line` to suppress it        |
| `e2e:ui` target blocks terminal              | Use `e2e` target instead — `e2e:ui` is for interactive local development only                            |

## Related Skills

- `e2e-testing` — full E2E testing guide (auth, mocks, fixtures, page objects)
- `integration-testing` — full-stack integration tests against live backend
