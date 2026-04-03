---
name: read-playwright-report
description: 'Download and parse Playwright HTML reports from the bkrupa/legacy-sports-deploys GitHub Pages repo. Use when asked about test results, which tests ran, pass/fail/skip counts, or whether specific tests (e.g. integration/draft) were included in a run.'
---

# Skill: Reading Playwright Reports

## Report Location

Reports are published to GitHub Pages on the `gh-pages` branch of **`bkrupa/legacy-sports-deploys`**:

```
playwright-report/
  nightly-<run_id>/     # scheduled runs
  manual-<run_number>/  # manual dispatches
```

Report URL pattern:

```
https://bkrupa.github.io/legacy-sports-deploys/playwright-report/<name>/
```

## Why WebFetch Doesn't Work

The Playwright HTML report is a client-side SPA — the `index.html` is a JS bundle that renders test data at runtime. `WebFetch` only retrieves static HTML, so it returns minified JS with no readable test data. Use the GitHub API instead.

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

```bash
# E2E only (mocked)
gh workflow run run-playwright-tests.yml -f test-suite=e2e -f shard-total=3

# Integration only (live server)
gh workflow run run-playwright-tests.yml -f test-suite=integration -f shard-total=1

# Both suites (mirrors nightly — requires test-suite: all, added in LS-2281)
gh workflow run run-playwright-tests.yml -f test-suite=all
```

Via MCP:

```
ci_dispatch_workflow(workflow: "run-playwright-tests.yml", inputs: { "test-suite": "all" })
```
