---
name: read-playwright-report
description: 'Download and parse a Playwright HTML report from the bkrupa/legacy-sports-deploys GitHub Pages repo. Use when asked about test results, which tests ran, pass/fail/skip counts, or whether specific tests (e.g. integration/draft) were included in a run. Invoke as /read-playwright-report <name> where name is e.g. manual-15 or nightly-<run_id>.'
---

# Skill: Read Playwright Report

## When to Use

- User asks what tests ran / failed / were skipped in a CI run
- User provides a report URL like `https://bkrupa.github.io/legacy-sports-deploys/playwright-report/manual-15/`
- Discord CI failure message includes a `/read-playwright-report <name>` hint
- You need to check whether integration tests (live server) were included in a run

## Steps

### Step 1 — Resolve the report name

Extract the report name from the args or context:

- From args: `/read-playwright-report manual-15` → name = `manual-15`
- From a URL: `…/playwright-report/nightly-123456/` → name = `nightly-123456`
- If no name given, ask: "Which report? (e.g. manual-15 or nightly-<run_id>)"

### Step 2 — Get the SHA of index.html

```bash
gh api "repos/bkrupa/legacy-sports-deploys/contents/playwright-report/<name>/index.html?ref=gh-pages" \
  --jq '.sha'
```

If the path returns 404, list available reports:

```bash
gh api "repos/bkrupa/legacy-sports-deploys/contents/playwright-report?ref=gh-pages" \
  --jq '.[].name'
```

### Step 3 — Download via blob API

The file is >1 MB — the contents API returns empty. Use the blob API:

```bash
SHA=<sha from step 2>
TMPDIR="${TEMP:-${TMPDIR:-/tmp}}"
gh api "repos/bkrupa/legacy-sports-deploys/git/blobs/$SHA" \
  --jq '.content' | tr -d '\n' | base64 -d > "$TMPDIR/pw-index.html"
```

> On Windows, `/tmp/` is reset between Bash sessions — use `$TEMP` instead (set automatically by the shell). The `${TEMP:-${TMPDIR:-/tmp}}` expression handles Windows, macOS, and Linux.

### Step 4 — Parse report.json

Write to a temp script and run it (avoid inline `python3 -c` on Windows):

```python
# $TMPDIR/parse-pw-report.py
import base64, zipfile, io, json, os

tmp = os.environ.get('TEMP') or os.environ.get('TMPDIR') or '/tmp'
html_bytes = open(f'{tmp}/pw-index.html', 'rb').read()
marker = b'data:application/zip;base64,'
idx = html_bytes.find(marker)
end_idx = html_bytes.find(b'</script>', idx)
data = base64.b64decode(html_bytes[idx + len(marker):end_idx])
zf = zipfile.ZipFile(io.BytesIO(data))
report = json.loads(zf.read('report.json'))

print(f"Stats: {report['stats']}\n")
print(f"{'File':<65} {'total':>5} {'pass':>5} {'skip':>5} {'fail':>5}")
print("-" * 90)
for f in sorted(report['files'], key=lambda x: x['fileName']):
    fname = f['fileName']
    s = f.get('stats', {})
    flag = ' <--' if 'draft' in fname.lower() or 'integration' in fname.lower() else ''
    print(f"{fname:<65} {s.get('total',0):>5} {s.get('expected',0):>5} {s.get('skipped',0):>5} {s.get('unexpected',0):>5}{flag}")
```

```bash
python3 "$TMPDIR/parse-pw-report.py"
```

### Step 5 — Report findings

Summarise:

1. **Overall stats** — total / passed / failed / skipped / flaky
2. **Failed tests** — list any files where `unexpected > 0` with the test titles
3. **Integration tests** — were they included? List the integration test files and their results
4. **Notable skips** — any files with `skipped > 0`

---

## Reference

### report.json structure

```json
{
  "stats": {
    "total": 1054,
    "expected": 1048,
    "unexpected": 0,
    "flaky": 1,
    "skipped": 5,
    "ok": true
  },
  "files": [
    {
      "fileName": "draft-functionality.spec.ts",
      "tests": [{ "title": "...", "outcome": "expected" }],
      "stats": { "total": 6, "expected": 6, "skipped": 0, "unexpected": 0 }
    }
  ]
}
```

Outcome values: `"expected"` = pass · `"unexpected"` = fail · `"skipped"`

### Suite types

| Suite         | Test directory                        | Live backend?                     |
| ------------- | ------------------------------------- | --------------------------------- |
| `e2e`         | `apps/web-e2e/src/tests/`             | No — mocked via `route.fulfill()` |
| `integration` | `apps/web-e2e/src/integration/tests/` | Yes — real GraphQL + WebSockets   |

Integration tests only run on nightly schedule or when `test-suite: integration` / `test-suite: all` is selected.

### Trigger a new run

```
ci_dispatch_workflow(workflow: "run-playwright-tests.yml", inputs: { "test-suite": "all" })
```
