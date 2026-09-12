# ci_get_playwright_test_result — Lookup Modes and S3 Blobs

> Loaded from [read-playwright-report SKILL](../SKILL.md).

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
