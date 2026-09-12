# Test Commands

> Loaded from [testing SKILL](../SKILL.md). MCP-first command surface for every test layer, plus the shell fallbacks and pre-commit scope detection.

## Commands

### MCP-first (preferred)

Use the `nx_run` MCP tool for all test runs — it provides structured output and avoids shell quoting issues:

```
# Run all tests for a project
nx_run(project: "scoring", target: "test")

# Run a specific test file with verbose output
nx_run(project: "web", target: "test", args: ["--testPathPatterns=csrf\\.spec", "--verbose"])

# Bypass Nx cache (use when output appears empty or stale)
nx_run(project: "web", target: "test", args: ["--testPathPatterns=useAuth\\.spec", "--verbose"], noCache: true)

# Run in a worktree
nx_run(project: "scoring", target: "test", args: ["--testPathPatterns=lwar\\.spec", "--verbose"], worktreePath: "$wt")
```

> **`--testPathPatterns` preferred**: always use `--testPathPatterns` (plural) in new commands. The singular `--testPathPattern` still works — the `nx_run` MCP tool auto-translates it — but it is deprecated in Jest 30+. Common causes of "0 tests found": wrong project (e.g., a project whose `test` target delegates to sub-targets rather than running Jest directly), typo in the pattern, or missing `--all` flag (see shell fallback note below).

> **Empty output?** If `nx_run` returns no test names or truncated output, re-run with `noCache: true` before falling back to Bash. Nx cache can replay stale summaries that omit verbose detail.

### Playwright specs via MCP: `nx_run_e2e_specs`

Prefer `nx_run_e2e_specs` over raw `playwright test` / `nx e2e` shell commands for running individual specs — it returns a compact pass/fail summary instead of a full reporter dump:

```
# Hermetic (default): runs against a local static build.
# Precondition: dist/apps/web exists — run nx_run(project: "web", target: "build") first.
nx_run_e2e_specs(specs: ["src/tests/roster-management.spec.ts"], grep: "@critical")

# Live integration: runs against api.legacy-fantasy.com with workers=1 enforced.
nx_run_e2e_specs(specs: ["src/integration/tests/league-creation.integration.spec.ts"], integration: true, withTracing: true)
```

- Spec paths are relative to `apps/web-e2e/` (absolute paths also accepted); `project` selects the browser (default `chromium`); `worktreePath` runs in a worktree.
- Hermetic mode auto-selects a free `E2E_PORT` and forces `E2E_AUTH_MODE=ci` (no OAuth handshake needed).
- Integration mode checks e2e JWT freshness (`~/.legacy-sports/e2e-token.json`, minted by `make e2e-auth`) and `E2E_POOL_PASSWORD` before launching, and returns `graphqlErrors` plus (with `withTracing: true`) `traceArtifacts` — the sanctioned way to get a Playwright trace, since CI traces are off (see [references/e2e-determinism.md](e2e-determinism.md), lever 10).

### Shell fallback

Use these only when the `nx_run` MCP tool is unavailable:

```bash
# Run affected tests (preferred)
make test

# Test a specific project
pnpm exec nx run <project>:test

# Run specific test file with verbose output (--all bypasses --onlyChanged default)
pnpm exec nx run <project>:test -- --all --testPathPatterns="SpecName" --verbose

# E2E tests (build first: pnpm exec nx build web)
pnpm exec nx e2e web-e2e -- --grep='test name' --config=apps/web-e2e/playwright.config.ts

# Integration tests (requires deployed/local services)
pnpm exec nx integration web-e2e -- --grep='Flow Name'

# Full pre-commit validation
make pc
```

## Integration with Workflow

Testing is part of the pre-commit sequence: typecheck -> lint -> test -> build. Run the full suite with `make pc`. See [repo-tooling](../../repo-tooling/SKILL.md) for all targets.

### E2E Pre-Commit Scope Detection

Before running E2E tests, determine the minimum scope needed based on changed files:

```bash
make e2e-scope
# or: node scripts/e2e-pre-commit.js --json
```

This classifies changes and recommends: **targeted** (specific test files changed), **critical** (@critical suite for fixture/helper changes), or **none** (no E2E-relevant changes). Use `--run` to execute the recommended tests directly.
