# Triggering Playwright Runs

> Loaded from [read-playwright-report SKILL](../SKILL.md).

## Triggering Runs

MCP-first — `ci_dispatch_workflow`. These are non-PR `workflow_dispatch` runs (no push notification), so pass `waitForCompletion: true` when you need the result:

```
# E2E only (mocked)
ci_dispatch_workflow(workflow: "run-playwright-tests.yml", inputs: { "test-suite": "e2e", "shard-total": "3" })

# Integration only (live server) — all integration specs; wait for the verdict
ci_dispatch_workflow(workflow: "run-playwright-tests.yml", ref: "<branch>",
  inputs: { "test-suite": "integration", "shard-total": "3" },
  waitForCompletion: true, timeoutSeconds: 3600)

# Integration only — specific specs via grep pattern
ci_dispatch_workflow(workflow: "run-playwright-tests.yml",
  inputs: { "test-suite": "integration", "shard-total": "1", "test-grep": "roster-management|matchup-detail|trade-flow" })

# Both suites (mirrors nightly)
ci_dispatch_workflow(workflow: "run-playwright-tests.yml", inputs: { "test-suite": "all" })
```

Shell fallback (only when the CI MCP server is unavailable):

```bash
gh workflow run run-playwright-tests.yml -f test-suite=integration -f shard-total=3
```

Integration `shard-total` above 3 is clamped to the live-backend ceiling, and the `retries` input is ignored for the integration suite (always `retries: 0`) — see [fix-integration-tests](../../fix-integration-tests/references/nightly-profile.md).

### `test-file` vs `test-grep`

`test-file` accepts one or more **space-separated filenames** relative to the test directory. The workflow word-splits the input so each name becomes a separate positional argument to Playwright.

```
# Single file
test-file: "roster-management-ui.integration.spec.ts"

# Multiple files (space-separated)
test-file: "roster-management-ui.integration.spec.ts matchup-detail-ui.integration.spec.ts"
```

`test-grep` is for **pattern matching** across test titles and file names using a Playwright `--grep` regex:

```
# Match by filename fragment (pipe = OR)
test-grep: "roster-management|matchup-detail|trade-flow"

# Match by tag
test-grep: "@smoke"
```

Use `test-file` when you know the exact spec filenames; use `test-grep` when filtering by test title, tag, or a partial name pattern.

After triggering any run, always verify `stats.total > 0` before using the report as evidence (see [Zero-Test Guard](#zero-test-guard-mandatory-before-posting-evidence)).
