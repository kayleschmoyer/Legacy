import type { Page, TestInfo } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Per-test source-coverage collection for the nightly Playwright run (LS-7849,
 * foundational child of LS-7848 "coverage-driven surface-map auto-sync").
 *
 * The web build served in the nightly e2e job is instrumented with
 * babel-plugin-istanbul (via vite-plugin-istanbul, gated on COLLECT_COVERAGE —
 * see apps/web/vite.config.mts), which populates `window.__coverage__` with a
 * per-source-file execution map. This module snapshots that object before and
 * after each test, attributes every source file the test executed to the spec
 * that owns the test, and appends the attribution to a per-worker fragment.
 *
 * The merged per-shard `coverage-fragment.json` (spec → sorted source files) is
 * produced by {@link mergeShardFragments} from a Playwright globalTeardown and
 * uploaded to S3 by the nightly workflow. Later children of LS-7848 aggregate
 * the per-shard fragments across the matrix and audit the surface maps
 * (integration-surface-map.json today; the e2e map in LS-7846).
 *
 * Everything here is gated on COLLECT_COVERAGE and is fully best-effort: when
 * the flag is unset (all PR CI, local runs) or the served build is not
 * instrumented (integration specs hit the live, non-instrumented site today),
 * collection is a no-op and never affects a test's outcome.
 */

/** True only when the nightly workflow sets COLLECT_COVERAGE. */
export const COLLECT_COVERAGE = !!process.env.COLLECT_COVERAGE;

/**
 * Repo root used to relativise istanbul's absolute file paths. The Playwright
 * runner is invoked from the workspace root in CI; COVERAGE_REPO_ROOT is an
 * escape hatch for unusual invocations.
 */
const REPO_ROOT = process.env.COVERAGE_REPO_ROOT ?? process.cwd();

/** Directory holding the per-worker fragments and the merged per-shard file. */
export const COVERAGE_FRAGMENT_DIR =
  process.env.COVERAGE_FRAGMENT_DIR ??
  path.resolve(__dirname, '../../coverage-fragments');

/** Merged artifact name uploaded to S3 (one per shard). */
const MERGED_FRAGMENT_FILE = 'coverage-fragment.json';

/** Istanbul's per-file coverage entry — only the fields we read. */
interface IstanbulFileCoverage {
  path?: string;
  /** Statement-hit counts keyed by statement id. */
  s?: Record<string, number>;
}
type IstanbulCoverage = Record<string, IstanbulFileCoverage>;

/** One per-test attribution line in a worker fragment. */
interface FragmentEntry {
  spec: string;
  title: string;
  files: string[];
}

/**
 * Normalise an istanbul file path (absolute, OS-specific) to a repo-relative
 * POSIX path. Returns undefined for paths outside the repo or inside
 * node_modules — neither belongs in a source surface map.
 */
function toRepoRelative(filePath: string): string | undefined {
  const rel = path.relative(REPO_ROOT, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  const posix = rel.split(path.sep).join('/');
  if (posix.includes('node_modules/')) return undefined;
  return posix;
}

/**
 * Return the set of repo-relative source files in `coverage` that have at least
 * one executed statement — the files a test actually exercised (not merely
 * loaded). Istanbul resets counts on a full document load, so for the SPA this
 * reflects everything executed since the last hard navigation; a `page.reload()`
 * mid-test drops coverage accumulated before it (acceptable: over-selection is
 * safe for the surface map, under-selection is the only real risk).
 */
function executedFiles(coverage: IstanbulCoverage | undefined): Set<string> {
  const files = new Set<string>();
  if (!coverage) return files;
  for (const entry of Object.values(coverage)) {
    const counts = entry.s ? Object.values(entry.s) : [];
    if (!counts.some((c) => c > 0)) continue;
    const rel = entry.path ? toRepoRelative(entry.path) : undefined;
    if (rel) files.add(rel);
  }
  return files;
}

/** Read `window.__coverage__` from a page; best-effort, undefined on any error. */
async function readCoverage(page: Page): Promise<IstanbulCoverage | undefined> {
  try {
    return await page.evaluate(
      () =>
        (window as unknown as { __coverage__?: IstanbulCoverage }).__coverage__,
    );
  } catch {
    // Page closed / navigated / crashed — coverage is unavailable, not fatal.
    return undefined;
  }
}

/** Repo-relative POSIX path of the spec file owning a test. */
function specRelPath(testInfo: TestInfo): string {
  return (
    toRepoRelative(testInfo.file) ?? testInfo.file.split(path.sep).join('/')
  );
}

/** Append a per-test attribution to this worker's fragment (best-effort). */
function appendFragmentEntry(testInfo: TestInfo, files: string[]): void {
  try {
    fs.mkdirSync(COVERAGE_FRAGMENT_DIR, { recursive: true });
    // One file per worker process; tests run serially within a worker, so
    // appends never race. The merge step unions across workers per shard.
    const fragmentPath = path.join(
      COVERAGE_FRAGMENT_DIR,
      `worker-${testInfo.workerIndex}.ndjson`,
    );
    const entry: FragmentEntry = {
      spec: specRelPath(testInfo),
      title: testInfo.title,
      files: [...files].sort(),
    };
    fs.appendFileSync(fragmentPath, `${JSON.stringify(entry)}\n`);
  } catch {
    // Never fail a test because coverage couldn't be persisted.
  }
}

/**
 * Snapshot the executed-file baseline on a page before the test body runs. Pair
 * with {@link attributePageCoverage} afterwards so only files newly executed by
 * the test are attributed to it. No-op (empty set) unless COLLECT_COVERAGE.
 */
export async function snapshotCoverageBaseline(
  page: Page,
): Promise<Set<string>> {
  if (!COLLECT_COVERAGE) return new Set();
  return executedFiles(await readCoverage(page));
}

/**
 * Attribute the source files a test executed (after-baseline diff) to its spec,
 * appending to this worker's fragment. No-op unless COLLECT_COVERAGE, or when
 * the served build is not instrumented (no `window.__coverage__`).
 */
export async function attributePageCoverage(
  page: Page,
  testInfo: TestInfo,
  baseline: Set<string>,
): Promise<void> {
  if (!COLLECT_COVERAGE) return;
  const after = executedFiles(await readCoverage(page));
  const files = [...after].filter((f) => !baseline.has(f));
  if (files.length === 0) return;
  appendFragmentEntry(testInfo, files);
}

/** Read every per-worker fragment in the directory into a flat entry list. */
function readWorkerFragments(): FragmentEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(COVERAGE_FRAGMENT_DIR);
  } catch {
    return []; // directory absent — nothing collected this shard
  }
  const entries: FragmentEntry[] = [];
  for (const name of names) {
    if (!name.endsWith('.ndjson')) continue;
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(COVERAGE_FRAGMENT_DIR, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as FragmentEntry);
      } catch {
        // Skip a malformed line rather than aborting the whole merge.
      }
    }
  }
  return entries;
}

/**
 * Merge this shard's per-worker fragments into a single `coverage-fragment.json`
 * (spec → sorted unique source files) and delete the intermediate NDJSON so only
 * the merged artifact is uploaded. Idempotent; safe to call from globalTeardown.
 * No-op unless COLLECT_COVERAGE. Returns a summary for logging.
 */
export function mergeShardFragments(): { specs: number; files: number } {
  if (!COLLECT_COVERAGE) return { specs: 0, files: 0 };

  const bySpec = new Map<string, Set<string>>();
  for (const entry of readWorkerFragments()) {
    let set = bySpec.get(entry.spec);
    if (!set) {
      set = new Set();
      bySpec.set(entry.spec, set);
    }
    for (const file of entry.files ?? []) set.add(file);
  }

  const specs: Record<string, string[]> = {};
  let fileCount = 0;
  for (const [spec, set] of [...bySpec.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    specs[spec] = [...set].sort();
    fileCount += set.size;
  }

  const merged = {
    $comment:
      'Per-shard spec→source-file coverage fragment (LS-7849). Generated by the nightly Playwright run when COLLECT_COVERAGE=1; aggregated across shards and audited against the surface maps by later children of LS-7848.',
    generatedAt: new Date().toISOString(),
    specs,
  };

  try {
    fs.mkdirSync(COVERAGE_FRAGMENT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(COVERAGE_FRAGMENT_DIR, MERGED_FRAGMENT_FILE),
      `${JSON.stringify(merged, null, 2)}\n`,
    );
    for (const name of fs.readdirSync(COVERAGE_FRAGMENT_DIR)) {
      if (name.endsWith('.ndjson')) {
        fs.rmSync(path.join(COVERAGE_FRAGMENT_DIR, name));
      }
    }
  } catch {
    // Best-effort — a write failure must not fail the run's teardown.
  }

  return { specs: Object.keys(specs).length, files: fileCount };
}
