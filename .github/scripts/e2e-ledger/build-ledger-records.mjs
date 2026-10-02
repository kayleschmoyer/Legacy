#!/usr/bin/env node
/**
 * E2E ledger record builder (LS-9757).
 *
 * Reuses the per-test entries the agent-md-reporter already collects while
 * parsing Playwright's merged JSON results (`ledgerJsonFile` option, added
 * alongside the existing `flakyJsonFile` — see
 * apps/web-e2e/src/reporters/agent-md-reporter.ts) and enriches each one
 * with the run-level context the reporter itself doesn't have: commit SHA,
 * PR number (null on nightly/full-suite runs), a timestamp, and
 * `relatedToDiff` — computed from the SAME `e2e-select` selector output
 * (`apps/web-e2e/src/e2e-surface-map.json`) that `ci-pipeline.yml` already
 * uses to decide which specs to run for a PR.
 *
 * Output layout: one NDJSON file per spec per run, staged locally under
 * `<outDir>/spec/<spec>/<sha>-<runId>.ndjson`. A separate workflow step
 * syncs `<outDir>/` to `s3://<bucket>/e2e-ledger/v1/`, so the final S3 key
 * is `e2e-ledger/v1/spec/<spec>/<sha>-<runId>.ndjson`. Grouping by spec
 * (rather than the sha-first layout the `s3-artifact` composite action
 * uses for other CI artifacts) makes "every record for spec X" a single
 * prefix listing instead of a scan of every commit that ever ran E2E —
 * see query-e2e-ledger.mjs. Records are never rewritten in place (each run
 * writes new, uniquely-named files), so there is no read-modify-write
 * race between concurrent CI runs.
 *
 * This step must never fail the CI run it's attached to (same fail-open
 * posture as `e2e-select` in ci-pipeline.yml): missing/malformed input
 * degrades to "no ledger records produced," not a thrown error.
 *
 * Usage:
 *   node build-ledger-records.mjs \
 *     --ledger-json <path>          # agent-md-reporter's ledgerJsonFile output
 *     --sha <sha>
 *     --run-id <id>                 # GITHUB_RUN_ID, for unique filenames
 *     --out-dir <dir>                # local staging directory
 *     [--pr-number <n>]             # omit for nightly/full-suite runs
 *     [--timestamp <iso>]           # default: now
 *     [--run-all]                   # e2e-select's run-all=true (full suite)
 *     [--affected-specs-file <path>] # newline-delimited e2e-select specs output
 *     [--manifest <path>]           # e2e-surface-map.json, to canonicalize spec paths
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const log = (...args) => console.error(...args);

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Whether `spec` is safe to join onto the local staging directory: a
 * relative path that stays inside it (LS-9757 review: the reporter's raw
 * entries are trusted today, but this is the boundary where an untrusted
 * `ledgerJsonFile` — a malformed/tampered reporter output — could otherwise
 * inject `../` segments into a filesystem write). Rejects absolute paths
 * and any path that normalizes to climb above its own root.
 */
export function isSafeSpecPath(spec) {
  if (typeof spec !== 'string' || spec.length === 0) return false;
  if (isAbsolute(spec)) return false;
  const normalized = normalize(spec);
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) return false;
  return true;
}

/**
 * Whether a spec counts as related to the PR's diff, per the same
 * `e2e-select` signal ci-pipeline.yml already computes:
 *   - Nightly/full-suite runs have no diff to relate to → null.
 *   - `runAll` (a broad surface changed) → every executed spec is related.
 *   - Otherwise → related iff the spec is in e2e-select's affected-specs set.
 */
export function computeRelatedToDiff({ isPrRun, runAll, affectedSpecs, spec }) {
  if (!isPrRun) return null;
  if (runAll) return true;
  return (affectedSpecs ?? new Set()).has(spec);
}

/**
 * Build full ledger records ({sha, prNumber, timestamp, spec, testName,
 * status, retryCount, relatedToDiff}) from the reporter's raw per-test
 * entries ({spec, testName, status, retryCount}).
 */
export function buildLedgerRecords({
  entries,
  sha,
  prNumber,
  timestamp,
  isPrRun,
  runAll,
  affectedSpecs,
}) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    sha,
    prNumber: prNumber ?? null,
    timestamp,
    spec: entry.spec,
    testName: entry.testName,
    status: entry.status,
    retryCount: entry.retryCount ?? 0,
    relatedToDiff: computeRelatedToDiff({
      isPrRun,
      runAll,
      affectedSpecs,
      spec: entry.spec,
    }),
  }));
}

/** Group records by spec, preserving encounter order within each group. */
export function groupRecordsBySpec(records) {
  const bySpec = new Map();
  for (const record of records) {
    let group = bySpec.get(record.spec);
    if (!group) {
      group = [];
      bySpec.set(record.spec, group);
    }
    group.push(record);
  }
  return bySpec;
}

/** Newline-delimited JSON, one record per line, trailing newline. */
export function toNdjson(records) {
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

/** Parse a newline-delimited spec list (e2e-select's `specs` output),
 * ignoring blank lines. */
export function parseAffectedSpecs(text) {
  return new Set(
    (text ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

/**
 * Canonicalize a reporter spec path to the repo-relative form e2e-select and
 * the surface-map manifest use (`apps/web-e2e/src/tests/<name>.spec.ts`).
 *
 * The reporter emits spec paths relative to Playwright's `config.rootDir`,
 * and in the CI merge-reports pass that is the merge config's
 * `testDir: "apps/web-e2e/src"` — the common parent of the e2e and
 * integration test dirs, needed so mixed-testDir blobs merge at all. Each
 * shard's blob only stores locations relative to its own rootDir (the
 * shard's testDir), so after re-rooting the `tests/` / `integration/tests/`
 * segment is gone and the reporter can only see a bare `<name>.spec.ts`
 * (LS-10337). Without canonicalization the S3 key would be
 * `spec/<name>.spec.ts/...`, `query-e2e-ledger.mjs --spec <manifest path>`
 * would never find it, and `relatedToDiff` (an exact-path set lookup) would
 * never be true.
 *
 * Resolution: an exact match in `knownSpecs` wins; otherwise the unique
 * known spec ending in `/<spec>` wins; anything else (no match, or an
 * ambiguous basename) is returned unchanged so the record is still written
 * under a stable, if less useful, key.
 */
export function canonicalizeSpec(spec, knownSpecs) {
  if (!knownSpecs || knownSpecs.size === 0 || knownSpecs.has(spec)) return spec;
  const suffix = `/${spec}`;
  let match = null;
  for (const known of knownSpecs) {
    if (!known.endsWith(suffix)) continue;
    if (match !== null) return spec; // ambiguous
    match = known;
  }
  return match ?? spec;
}

/** Spec paths from e2e-select's manifest (`apps/web-e2e/src/e2e-surface-map.json`
 * — `specs` is keyed by repo-relative spec path). Fail-open: anything that
 * isn't a manifest with a `specs` object yields an empty set. */
export function parseManifestSpecs(text) {
  try {
    const parsed = JSON.parse(text ?? '');
    const specs = parsed?.specs;
    return new Set(
      specs && typeof specs === 'object' && !Array.isArray(specs)
        ? Object.keys(specs)
        : [],
    );
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    ledgerJson: null,
    sha: null,
    runId: null,
    outDir: null,
    prNumber: null,
    timestamp: new Date().toISOString(),
    runAll: false,
    affectedSpecsFile: null,
    manifest: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ledger-json') args.ledgerJson = argv[++i];
    else if (a === '--sha') args.sha = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--pr-number') args.prNumber = argv[++i];
    else if (a === '--timestamp') args.timestamp = argv[++i];
    else if (a === '--run-all') args.runAll = true;
    else if (a === '--affected-specs-file') args.affectedSpecsFile = argv[++i];
    else if (a === '--manifest') args.manifest = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ledgerJson || !args.sha || !args.runId || !args.outDir) {
    log('error: --ledger-json, --sha, --run-id, and --out-dir are required');
    process.exitCode = 2;
    return;
  }

  // Fail-open: any problem reading/parsing input degrades to "no records
  // written," never a thrown error that could fail the CI run (LS-9757 AC4,
  // same posture as e2e-select in ci-pipeline.yml).
  try {
    if (!existsSync(args.ledgerJson)) {
      log(
        `[e2e-ledger] no reporter ledger output at ${args.ledgerJson} — nothing to write`,
      );
      return;
    }

    const raw = JSON.parse(readFileSync(args.ledgerJson, 'utf8'));
    const rawEntries = Array.isArray(raw?.entries) ? raw.entries : [];
    const entries = rawEntries.filter((entry) => isSafeSpecPath(entry?.spec));
    if (entries.length < rawEntries.length) {
      log(
        `::warning::[e2e-ledger] dropped ${rawEntries.length - entries.length} entr(y/ies) with an unsafe spec path (not a clean relative path)`,
      );
    }
    if (entries.length === 0) {
      log(
        '[e2e-ledger] reporter ledger output has zero entries — nothing to write',
      );
      return;
    }

    const isPrRun = args.prNumber != null && args.prNumber !== '';
    const prNumber = isPrRun ? Number(args.prNumber) : null;
    const affectedSpecs =
      args.affectedSpecsFile && existsSync(args.affectedSpecsFile)
        ? parseAffectedSpecs(readFileSync(args.affectedSpecsFile, 'utf8'))
        : new Set();
    const manifestSpecs =
      args.manifest && existsSync(args.manifest)
        ? parseManifestSpecs(readFileSync(args.manifest, 'utf8'))
        : new Set();
    const knownSpecs = new Set([...manifestSpecs, ...affectedSpecs]);
    const canonicalEntries = entries.map((entry) => ({
      ...entry,
      spec: canonicalizeSpec(entry.spec, knownSpecs),
    }));

    const records = buildLedgerRecords({
      entries: canonicalEntries,
      sha: args.sha,
      prNumber,
      timestamp: args.timestamp,
      isPrRun,
      runAll: args.runAll,
      affectedSpecs,
    });

    const bySpec = groupRecordsBySpec(records);
    let filesWritten = 0;
    for (const [spec, specRecords] of bySpec) {
      const dest = join(
        args.outDir,
        'spec',
        spec,
        `${args.sha}-${args.runId}.ndjson`,
      );
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, toNdjson(specRecords), 'utf-8');
      filesWritten++;
    }

    log(
      `[e2e-ledger] wrote ${records.length} record(s) across ${filesWritten} spec file(s) to ${args.outDir}`,
    );
  } catch (error) {
    log(
      `::warning::e2e-ledger build failed (fail-open, no ledger data this run): ${error.message}`,
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
