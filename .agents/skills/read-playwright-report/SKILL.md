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

In cloud/remote sessions there is also a second, independent reason a direct `bkrupa.github.io` fetch fails: the session's outbound egress proxy denies `CONNECT` to that host outright (bare 403, no body), regardless of whether the target is `index.html` or `summary.md`. See [cloud-agent-mode Quirk 7](../cloud-agent-mode/references/known-quirks.md#quirk-7-bkrupagithubio-connect-blocked-by-the-ccr-egress-proxy-cloudremote-sessions).

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

## References

- **[references/credentials-gap.md](references/credentials-gap.md)** — a 404 from `ci_get_playwright_report` is usually a credentials gap, not a missing report (LS-8546; rediscovered and re-ticketed four times). Check `ci_deploys_repo_auth_status` before re-deriving the diagnosis from another 404.
- **[references/test-result-lookup.md](references/test-result-lookup.md)** — `ci_get_playwright_test_result` lookup modes and the S3 blob layout.
- **[references/triggering-runs.md](references/triggering-runs.md)** — dispatching a Playwright run and the inputs each suite accepts (including the integration `shard-total` clamp and the ignored `retries` input).
