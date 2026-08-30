# E2E Ledger (LS-9757)

A durable, queryable record of every executed E2E test — PR CI and nightly/full-suite runs alike — so a future regression can be attributed to its introducing commit by direct lookup instead of manual `git log` + surface-map archaeology (the [ADR-0014 bisect runbook](../../../../docs/decisions/0014-integration-nightly-bisect.md#bisect-runbook)).

**This ticket only writes and queries the ledger.** Nothing consumes it automatically yet — wiring it into the `e2e-hold` protocol (`.agents/skills/pr-lifecycle/references/e2e-hold.md`) or into [nightly-green-campaign](../../nightly-green-campaign/SKILL.md)'s Phase 4 bisect is the follow-up ticket, LS-9758.

## What gets recorded

One record per **executed** test (skipped tests are not executed, so they're excluded):

```json
{
  "sha": "abc1234...",
  "prNumber": 4213,
  "timestamp": "2026-08-30T00:00:00.000Z",
  "spec": "apps/web-e2e/src/tests/player-stats-row-click-modal.spec.ts",
  "testName": "player stats row › opens the modal on click",
  "status": "passed",
  "retryCount": 0,
  "relatedToDiff": true
}
```

- `status` is `passed`, `failed`, or `flaky` — `flaky` means the test failed on an earlier attempt and passed on retry (Playwright's `outcome() === 'flaky'`). **This is the important one to query for**: a flaky `@critical` test creeping onto `main` is invisible to the required CI Gate check once it passes on retry, but it's still real signal, and it's in the ledger either way.
- `prNumber` / `relatedToDiff` are `null` on nightly/full-suite runs — there's no PR diff to relate a nightly run to.
- On a PR run, `relatedToDiff` is `true` when the spec was in that PR's affected-spec set (`ci-pipeline.yml`'s `e2e-select` step, same signal that decides which specs actually run) or when `e2e-select` promoted to a full-suite run (a broad surface changed, so every executed spec counts as related); otherwise `false` — the spec ran only as part of the always-on `@critical` safety net, not because the diff touched its surface.

## Where it's written

Both write paths reuse the **same parsing step** — the `agent-md-reporter` (`apps/web-e2e/src/reporters/agent-md-reporter.ts`) that already parses Playwright's merged JSON results to emit `summary.md` and (on nightly) `flaky-tests.json` for `.github/scripts/flaky-tickets/file-flaky-tickets.mjs`. A `ledgerJsonFile` reporter option was added alongside the existing `flakyJsonFile` one — same parsing loop, one more output — so there is no second, parallel result parser to keep in sync.

| Run type             | Workflow                                     | Job                        | PR/diff context                               |
| -------------------- | -------------------------------------------- | -------------------------- | --------------------------------------------- |
| PR CI                | `.github/workflows/ci-pipeline.yml`          | `deploy-playwright-report` | `detect-changes` job's `e2e-select` outputs   |
| Nightly / full-suite | `.github/workflows/run-playwright-tests.yml` | `deploy-report`            | none — `prNumber`/`relatedToDiff` always null |

Each job's "Merge Playwright Reports" / "Merge Reports" step registers `ledgerJsonFile` on the reporter, then a follow-up step (`node .github/scripts/e2e-ledger/build-ledger-records.mjs`) enriches the reporter's raw per-test entries with `sha`/`prNumber`/`timestamp`/`relatedToDiff` and stages one NDJSON file per spec locally, and a final step syncs that staged tree to S3 (bucket `legacy-sports-dev-ci-artifacts`, same bucket the `s3-artifact` composite action uses for other CI artifacts — see [why not the `s3-artifact` action itself](#why-a-spec-first-key-layout-instead-of-the-s3-artifact-action) below).

**Fail-open, always.** Every ledger step (`build-ledger-records.mjs` and the S3 sync) is `continue-on-error: true` and internally swallows its own errors into a `::warning::`. A ledger write failure degrades to "no new data point for this run," exactly like `e2e-select`'s own degrade-to-`@critical`-only posture — it must never fail the PR's required `e2e-affected` check or the nightly job.

## Where it's stored

```
s3://legacy-sports-dev-ci-artifacts/e2e-ledger/v1/spec/<spec>/<sha>-<runId>.ndjson
```

One NDJSON file per spec per run (all tests from that spec, that run, in one object) — never overwritten or deleted, so there's no read-modify-write race between concurrent CI runs.

### Why a spec-first key layout instead of the `s3-artifact` action

The `s3-artifact` composite action (`.github/actions/s3-artifact/action.yml`) keys every upload as `ci-artifacts/${GITHUB_SHA}/<name>` and syncs with `--delete` — the right shape for a one-shot-per-run artifact (a blob report, a coverage fragment), wrong for an _accumulating_ ledger you need to query by spec across every commit that ever ran it. Under that layout, "every record for spec X" would mean listing every commit that ever ran E2E and checking each one for a ledger file — unbounded and growing forever. Keying by spec first makes it one `ListObjectsV2` prefix listing. The ledger write steps reuse the action's underlying mechanics (same OIDC role, same bucket, same `aws s3 sync`) directly rather than through the composite action, since the action's path template can't be overridden.

## How to query it

```bash
node .github/scripts/e2e-ledger/query-e2e-ledger.mjs --spec apps/web-e2e/src/tests/player-stats-row-click-modal.spec.ts
```

Prints a table of every ledger record for that spec, oldest to newest. Add `--json` for machine-readable output (`{ spec, records: [...] }`) — this is the primitive LS-9758 is expected to build on for automated bisection. Requires AWS credentials with read access to `legacy-sports-dev-ci-artifacts` in the environment (the default SDK credential chain — a CI OIDC role, or a local `aws sso login` session); `--bucket <name>` overrides the default bucket.

## Tests

`.github/scripts/e2e-ledger/__tests__/*.test.mjs` — pure-function unit tests for the record-building/grouping logic and the query-side NDJSON parsing/formatting (S3 calls are exercised against an injected fake client, not a live bucket). Run via `node --test .github/scripts/e2e-ledger/__tests__/*.test.mjs`, same convention as `.github/scripts/flaky-tickets/__tests__/`.
