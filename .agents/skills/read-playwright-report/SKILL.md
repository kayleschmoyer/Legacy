---
name: read-playwright-report
description: 'Download and parse Playwright HTML reports from the bkrupa/legacy-sports-deploys GitHub Pages repo. Use when asked about test results, which tests ran, pass/fail/skip counts, or whether specific tests (e.g. integration/draft) were included in a run.'
metadata:
  scope: '**'
---

# Skill: Reading Playwright Reports

## Report Location

Reports are published to GitHub Pages on the `gh-pages` branch of **`bkrupa/legacy-sports-deploys`**:

```
playwright-report/
  nightly-<run_id>/     # scheduled runs
  manual-<run_number>/  # manual dispatches
  pr-<N>/               # PR CI runs (where N is the PR number)
```

Report URL pattern:

```
https://bkrupa.github.io/legacy-sports-deploys/playwright-report/<name>/
```

**`pr-<N>` covers the hermetic PR CI e2e run only.** `run:integration`
label runs (run-integration-tests.yml) do NOT reliably publish a GH-Pages
report — expect a 404 for `pr-<N>` when the failure came from the
"Run Integration Suite" check. The PRIMARY evidence path for those runs is
raw CI logs: `ci_get_logs(jobName: "Run Integration Suite",
errorSummary: true)` on the run, which carries the per-spec Playwright
error blocks. `ci_get_playwright_test_result(source: "s3")` reaches the
raw blob artifacts once the Lambda's read grant is deployed (LS-8330 —
broken before 2026-07-04). In cloud sandboxes `gh` is usually NOT
installed, so the GitHub-API artifact download is not a fallback there —
raw CI logs are the fallback of record. (Canary finding, 2026-07-04.)

## 404s from `ci_get_playwright_report` may be a credentials gap (LS-8546, fixed in code by LS-8322 and LS-8547; recurred 4x as LS-8788)

`bkrupa/legacy-sports-deploys` is **private**. The CI MCP server reads it with
a token minted from `PREVIEW_APP_PRIVATE_KEY`/`PREVIEW_APP_ID`. LS-8322 wires
those vars into the hosted Lambda's cold-start (a new `mcp-preview-app-token`
Secrets Manager secret, fetched by `ensureCredentials()` in
`tools/mcp/ci-server/src/lambda.ts`) — but that fix only takes effect once
someone with AWS access runs `terraform apply`, seeds the new secret, and
redeploys the `mcp-ci` Lambda (agents in cloud sessions generally can't do
this themselves; see the LS-8322 PR body for the exact follow-up steps).
**Crucially, that Secrets-Manager bootstrap lives only in `lambda.ts`'s
`ensureCredentials()`, which runs only behind the API-Gateway/Lambda
`handler()` entrypoint.** Both local sessions and Claude Code Remote (CCR)
sessions actually launch the CI server as the `legacy-sports-ci-local` stdio
process (`.mcp.json` → `tools/mcp/ci-server/src/index.ts`), which never calls
`ensureCredentials()` — so `PREVIEW_APP_PRIVATE_KEY`/`PREVIEW_APP_ID` are
structurally never set for that path regardless of any Lambda-side fix.

LS-8547 adds a second, lower-effort fallback in `getDeploysToken()`: when
`PREVIEW_APP_PRIVATE_KEY`/`PREVIEW_APP_ID` are unset, it tries minting a token
from the **agent-author** GitHub App's own installation on
`bkrupa/legacy-sports-deploys` — the same key every hosted Lambda and cloud
agent session already has, no terraform/secret changes needed. **This still
requires a one-time human action**: someone with GitHub App admin access must
install the agent-author App (App ID `3158619`) on `bkrupa/legacy-sports-deploys`
with `Contents: Read`. Until that install happens, the discovery call 404s
and the code silently falls through to the broad-token fallback below —
functionally unchanged from before LS-8547.

Until either rollout happens, every hosted/cloud/CCR session still uses the
fallback token, and whether reports fetch depends on what that fallback is:

| Session class                                                            | Fallback token                                                 | Result                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------- |
| Local (stdio `legacy-sports-ci-local`, `gh` CLI available)               | `gh` CLI user token — can read the deploys repo                | ✅ works                  |
| Claude Code Remote / cloud (stdio `legacy-sports-ci-local`, no `gh` CLI) | agent-author App token — scoped to `bkrupa/legacy-sports` only | ❌ 404 on **every** fetch |

So in CCR/cloud sessions specifically, a `ci_get_playwright_report` /
`ci_get_playwright_test_result` 404 usually means **the token cannot see the
repo, not that the report is missing** — and it is **not a regression**: it
recurs on every CCR session until one of the two human actions above
actually lands, independent of how many times the code-side tickets that
enabled those fallbacks (LS-8322, LS-8547) get marked Done. **Verify which
tier is actually blocking with `ci_deploys_repo_auth_status` (LS-8788)**
instead of re-deriving it from a report 404 each time — it exercises both
credential tiers directly and reports `resolvedSource` (`"preview-app"` /
`"agent-author"` / `"fallback"`) plus the specific failure reason for each
unconfigured/failing tier, without needing a real report to exist. The tool
error says "credentials gap" when this is the case — trust it and do not
burn time re-checking whether the deploy happened. Both tools (LS-9236, LS-9592) now detect this automatically
and fall through to the S3 blob artifacts for you — a manual `source: "s3"`
retry is rarely needed. If the automatic fallback also comes up empty (S3
objects expire after 3 days) or the run/PR SHA can't be resolved, it falls
through unchanged to the credentials-gap error. If you still need to reach
for it manually:

- Confirm the deploy once via the "Deploy Playwright Report" job in CI logs if in doubt.
- For nightly/integration runs, use `ci_get_playwright_test_result(source: "s3")` with the numeric run ID (S3 access does not use the deploys-repo token).
- Or fetch the report from a local session, where the `gh` CLI fallback works.
- **Do not fall back to a direct `WebFetch`/`curl` of the `bkrupa.github.io` report URL in cloud/remote sessions** — that host is blocked at the session's own network-egress layer (CCR platform policy, not this credentials gap) and 403s on every attempt regardless of token. See [cloud-agent-mode Quirk 7](../cloud-agent-mode/SKILL.md#quirk-7-bkrupagithubio-connect-blocked-by-the-ccr-egress-proxy-cloudremote-sessions) (LS-8556) before spending time on it.

## `ci_get_playwright_test_result` — lookup modes and S3 blobs

Moved out of the tool description in LS-9706; the description now points here.

### Identifying the report

| You have                                   | Pass                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| A deployed report name                     | `reportName: "pr-2173"` / `"manual-146"` / `"nightly-<runId>"`                                                             |
| Only a numeric run ID                      | `reportName: "<id>"` — gh-pages mode auto-tries `nightly-<id>` then `manual-<id>`, so the exact deployed name isn't needed |
| An `<integration-results>` webhook payload | `runId` + `testFile` (below)                                                                                               |

### Identifying the test

`testTitle` matches a **case-insensitive substring** of the full title — the describe path joined with `" > "`, ending in the test name. Multiple matches return a **candidates list** instead of a result; add `fileName` to disambiguate. String fields are capped at ~4000 chars so a chatty test can't overflow the response.

**runId + testFile lookup (LS-8888).** The `<integration-results>` webhook payload only ever carries a run ID and a spec file path — never a resolved report name or an exact test title. Pass `runId` instead of `reportName` and `testFile` instead of `fileName` to look up straight from that payload. `testTitle` is then optional: a file with exactly one non-passing test resolves automatically, otherwise you get a candidates list.

### S3 mode (`source: "s3"`)

For integration/nightly runs whose GH Pages report is absent, or when you want the raw artifacts. It resolves the run ID to a HEAD SHA via the GitHub API and returns **1-hour presigned GET URLs** for every blob zip under:

```
s3://legacy-sports-dev-ci-artifacts/ci-artifacts/{sha}/playwright-blobs/
```

- **Objects expire after 3 days** — older runs come back `empty: true`. That is retention, not a lookup failure; don't re-check whether the run published.
- Each zip is a Playwright **blob-reporter archive**. Use `playwright merge-reports`, or unzip to pull individual test-results (`error-context.md`, `trace.zip`).
- S3 access does **not** use the deploys-repo token, so it works when gh-pages 404s on the credentials gap above.
- `maxChars` is reserved for future use: presigned URLs can't be truncated without invalidating them, so s3 mode always returns full fields, while gh-pages applies its fixed 4000-char per-field cap.
- `artifactType` (LS-9741) selects which prefix under `ci-artifacts/{sha}/` to list: `"blobs"` (default — `playwright-blobs/`, the merge-reports archives above), `"coverage"` (`playwright-coverage/` — raw per-spec coverage fragments), or `"output"` (`playwright-output/` — raw Playwright output files). Same SHA-resolution, bucket, and presigned-URL shape for all three — only the prefix segment changes.

## Preferred: `summary.md` (LS-7838)

Every report published after LS-7838 includes a compact, agent-targeted **`summary.md`** next to `index.html`:

```
https://bkrupa.github.io/legacy-sports-deploys/playwright-report/<name>/summary.md
```

It carries the top-line stats plus full detail for failures (location + error + snippet), flaky tests, and skips (with reason); passing tests collapse to a count. It is ~20-50x smaller than the HTML SPA and needs **no zip extraction** — a single fetch.

- **Via MCP (preferred)**: `ci_get_playwright_report(reportName: "<name>")` now returns this Markdown directly — it fetches the published `summary.md` when present and otherwise renders the same layout server-side from `report.json`, so it works for historical reports too.
- **Via GitHub API**: fetch the file directly:

  ```bash
  gh api repos/bkrupa/legacy-sports-deploys/contents/playwright-report/<name>/summary.md?ref=gh-pages \
    --jq '.content' | base64 -d
  ```

The header line makes a zero-test run explicit (`0 total` → `❌ FAILED` with a warning), so the [Zero-Test Guard](#zero-test-guard-mandatory-before-posting-evidence) still applies — never treat `0 total` as passing evidence.

Fall back to the embedded-zip parse below only for reports that predate this feature **and** are unreachable via the MCP tool.

## Why WebFetch Doesn't Work

The Playwright HTML report is a client-side SPA — the `index.html` is a JS bundle that renders test data at runtime. `WebFetch` only retrieves static HTML, so it returns minified JS with no readable test data. Use the GitHub API instead.

In cloud/remote sessions there is also a second, independent reason a direct `bkrupa.github.io` fetch fails: the session's outbound egress proxy denies `CONNECT` to that host outright (bare 403, no body), regardless of whether the target is `index.html` or `summary.md`. See [cloud-agent-mode Quirk 7](../cloud-agent-mode/SKILL.md#quirk-7-bkrupagithubio-connect-blocked-by-the-ccr-egress-proxy-cloudremote-sessions).

## How to Extract Test Data

The `index.html` embeds all test data as a base64-encoded zip in its last `<script>` tag. Steps:

### 1. List the report directory

```bash
gh api repos/bkrupa/legacy-sports-deploys/git/trees/gh-pages?recursive=1 \
  --jq '.tree[] | select(.path | startswith("playwright-report/<name>")) | .path'
```

### 2. Get the SHA of index.html

```bash
gh api repos/bkrupa/legacy-sports-deploys/contents/playwright-report/<name>/index.html?ref=gh-pages \
  --jq '.sha'
```

### 3. Download via blob API (required — file is >1 MB, contents API returns empty)

```bash
gh api repos/bkrupa/legacy-sports-deploys/git/blobs/<sha> \
  --jq '.content' | tr -d '\n' | base64 -d > /tmp/pw-index.html
```

### 4. Extract and parse with Python

```python
import re, base64, zipfile, io, json

html_bytes = open('/tmp/pw-index.html', 'rb').read()
marker = b'data:application/zip;base64,'
idx = html_bytes.find(marker)
end_idx = html_bytes.find(b'</script>', idx)
data = base64.b64decode(html_bytes[idx + len(marker):end_idx])
zf = zipfile.ZipFile(io.BytesIO(data))
report = json.loads(zf.read('report.json'))
```

> **Note**: Write the Python script to `scratch/parse-report.py` and run it with `python3 scratch/parse-report.py`. Avoid inline `python3 -c` for multi-line scripts on Windows.

## report.json Structure

```json
{
  "stats": {
    "total": 1054,
    "expected": 1048, // passed
    "unexpected": 0, // failed
    "flaky": 1,
    "skipped": 5,
    "ok": false // false if any unexpected failures
  },
  "files": [
    {
      "fileId": "...",
      "fileName": "draft-functionality.spec.ts",
      "tests": [{ "title": "...", "outcome": "expected" }],
      "stats": { "total": 6, "expected": 6, "skipped": 0, "unexpected": 0 }
    }
  ]
}
```

Key fields per test: `title`, `outcome` (`"expected"` = pass, `"unexpected"` = fail, `"skipped"`).

## Zero-Test Guard (MANDATORY before posting evidence)

**Always check `stats.total` before treating a report as passing evidence:**

```python
if report['stats']['total'] == 0:
    print("ERROR: 0 tests ran — this report is NOT valid passing evidence")
    print("The run was misconfigured. Re-trigger with corrected parameters.")
else:
    print(f"OK: {report['stats']['total']} tests ran, {report['stats']['expected']} passed")
```

**Why this matters**: Playwright exits 0 and sets `ok: true` even when 0 tests run (no failures = success). A `manual-<N>` or `pr-<N>` report with `total: 0` looks like a successful CI run but provides **zero test coverage**. Posting it as integration test evidence will cause the review bot to flag missing evidence.

**Common causes**: a `test-file` value that matches no spec (typo, or a path not relative to the suite's test directory) or a `test-grep` regex that matches no titles — Playwright finds nothing to run and exits 0. (Historical note: space-separated multi-file `test-file` values used to be passed as one quoted string and produced 0-test runs; the workflow now word-splits the input — see the `read -ra TEST_FILE_ARGS` step in `run-playwright-tests.yml` — so multiple filenames are supported.) See [Triggering Runs](#triggering-runs).

## Useful Queries

**List all files with stats (highlighting draft/integration):**

```python
for f in sorted(report['files'], key=lambda x: x['fileName']):
    fname = f['fileName']
    stats = f.get('stats', {})
    flag = ' <-- DRAFT' if 'draft' in fname.lower() or 'integration' in fname.lower() else ''
    print(f"{fname:<65} total={stats.get('total',0)} pass={stats.get('expected',0)} skip={stats.get('skipped',0)} fail={stats.get('unexpected',0)}{flag}")
```

**Check if integration tests ran:**

```python
files = [f['fileName'] for f in report['files']]
integration_tests = [f for f in files if 'integration' in f.lower()]
print("Integration tests:", integration_tests or "NONE — not included in this run")
```

## Suite Types and Their Test Files

| Suite         | Config                                          | Test directory                        | Includes live backend?                |
| ------------- | ----------------------------------------------- | ------------------------------------- | ------------------------------------- |
| `e2e`         | `apps/web-e2e/playwright.config.ts`             | `apps/web-e2e/src/tests/`             | No — all mocked via `route.fulfill()` |
| `integration` | `apps/web-e2e/playwright.integration.config.ts` | `apps/web-e2e/src/integration/tests/` | Yes — real GraphQL API + WebSockets   |

The integration suite is **only included** when:

- The nightly schedule runs (03:00 UTC)
- A manual dispatch selects `test-suite: integration` or `test-suite: all`

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

Integration `shard-total` above 3 is clamped to the live-backend ceiling, and the `retries` input is ignored for the integration suite (always `retries: 0`) — see [fix-integration-tests](../fix-integration-tests/SKILL.md#nightly-execution-profile--why-local-single-spec-runs-mislead).

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
