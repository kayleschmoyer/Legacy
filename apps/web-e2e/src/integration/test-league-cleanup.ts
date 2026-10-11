/**
 * Shared helpers for integration test league cleanup. Used by both
 * `global-setup.ts` and `global-teardown.ts` to identify which leagues are
 * test-created and safe to delete.
 */
import fs from 'fs';
import path from 'path';
import { belongsToRun } from './league-run-scope';

export {
  belongsToRun,
  extractRunTag,
  INTEGRATION_RUN_ID_ENV,
  resolveRunTag,
  testLeagueName,
} from './league-run-scope';

/**
 * Well-known name patterns produced by integration tests. Any league whose
 * name matches one of these is eligible for cleanup.
 *
 * Add a pattern here whenever a new spec introduces a league name that does
 * not start with `Test League`, does not include the `E2E` marker, and does
 * not match one of the existing entries. Forgetting to do so silently leaks
 * leagues into the test environment: LS-4539 found 110 orphan
 * `Season Lifecycle Integration Test` leagues for exactly this reason — the
 * name matched none of the patterns and accumulated over weeks.
 */
const TEST_LEAGUE_PATTERNS = [
  'Test League',
  'Integration Season Test League',
  'Season Lifecycle Integration Test',
  // `Mock Draft Practice` is the server-assigned name for leagues created by
  // `mock-draft-simulator-ui.integration.spec.ts` (see initialize-mock-draft.ts).
  // Including it here is safe because cleanup is scoped to the commissioner
  // test user only — never touches other users' practice drafts.
  'Mock Draft Practice',
  // Dual-mode seeded leagues (`fixtures/test-data.ts`) are the two live-backend
  // names that carry no `E2E` marker, so they matched none of the patterns
  // above and were never cleanup candidates (LS-10138 — the same silent-leak
  // failure mode this docblock warns about, and LS-4539 before it).
  //
  // `Dual QR Invite` is the one that bites hardest: a *premium* manager persona
  // joins it via `joinLeagueByCode` (`TestData.inviteJoin` → `loginAs('premium',
  // 1)` → MANAGER_2), so each leaked league permanently consumes one of that
  // shared persona's membership slots. Two of them had accrued over 2+ days and
  // pinned MANAGER_2 at 3/3.
  'Dual QR Invite',
  'Dual Scoring Editor',
  // All UI integration tests use "<Label> E2E <timestamp>" naming
  /\bE2E\b/,
];

export function isTestLeague(name: string): boolean {
  return TEST_LEAGUE_PATTERNS.some((pattern) =>
    typeof pattern === 'string' ? name.startsWith(pattern) : pattern.test(name),
  );
}

/** Shard identity for the integration run (1-based current of total). */
export interface ShardIdentity {
  current: number;
  total: number;
}

/**
 * Resolve the integration run's shard identity (LS-7845).
 *
 * The nightly workflow used to fan out via Playwright's native `--shard`, which
 * populated `config.shard`. The weighted-balance partition (shard-partition.ts)
 * passes each shard its own explicit spec list instead and no longer sets
 * `--shard`, so shard identity now travels via the `INTEGRATION_SHARD_CURRENT` /
 * `INTEGRATION_SHARD_TOTAL` env vars. This helper prefers those env vars and
 * falls back to `config.shard` for any path still using native sharding.
 *
 * Returns `null` for a non-sharded run (single job / `1/1`) — callers treat
 * that as "this process owns the whole suite" and run the cleanup sweep.
 */
export function resolveShardIdentity(config?: {
  shard?: { current: number; total: number } | null;
}): ShardIdentity | null {
  const envCurrent = Number(process.env.INTEGRATION_SHARD_CURRENT);
  const envTotal = Number(process.env.INTEGRATION_SHARD_TOTAL);
  if (
    Number.isInteger(envCurrent) &&
    Number.isInteger(envTotal) &&
    envTotal > 1 &&
    envCurrent >= 1 &&
    envCurrent <= envTotal
  ) {
    return { current: envCurrent, total: envTotal };
  }
  if (config?.shard && config.shard.total > 1) {
    return { current: config.shard.current, total: config.shard.total };
  }
  return null;
}

/**
 * Enumerate the slugs of every integration spec file in `tests/`. The slug
 * matches `specSlugFromTestInfo` (test-user-auth.ts) so it can be fed to
 * `specUserEmail('COMMISSIONER', slug)` / `getSpecUserJwt` to address the
 * per-spec commissioner identity each spec authenticates as.
 *
 * Why the sweep needs this (LS-7704): specs run as a per-spec commissioner
 * (`commissioner-<hash>@...`, LS-4940), but the pre-run/teardown sweeps only
 * ever resolved the *base* commissioner. Leagues leaked by a spec therefore
 * accumulated under its per-spec identity, invisible to the sweep, until the
 * next run tripped the free-tier 3-league limit. Enumerating the slugs lets the
 * sweep reach those identities.
 *
 * Returns an empty array if the directory cannot be read (best-effort — a
 * missing dir must never break global setup/teardown).
 */
export function listIntegrationSpecSlugs(
  testsDir: string = path.resolve(__dirname, 'tests'),
): string[] {
  try {
    return fs
      .readdirSync(testsDir)
      .filter((f) => f.endsWith('.integration.spec.ts'))
      .map((f) =>
        f
          .replace(/\.integration\.spec\.ts$/, '')
          .replace(/\.spec\.ts$/, '')
          .replace(/[^a-z0-9-]/gi, '-')
          .toLowerCase(),
      );
  } catch {
    return [];
  }
}

/**
 * Skip cleanup of leagues younger than this so that concurrent runs on
 * different branches don't delete each other's in-flight leagues. The shared
 * commissioner test user means every run sees every other run's leagues
 * (LS-4442). 4h covers the longest current integration spec (live-draft-ui
 * with @slow takes ~60-90min) with headroom.
 */
export const MIN_LEAGUE_AGE_FOR_CLEANUP_MS = 4 * 60 * 60 * 1000;

/**
 * Integration tests embed a creation timestamp in the league name:
 *   - `<Label> E2E ${Date.now()}` — 13-digit unix ms at end
 *   - `Test League ${new Date().toISOString()}` — ISO 8601 at end (CLI workflow)
 *
 * Returns the age in ms if a timestamp is parseable, else undefined. Leagues
 * without a parseable timestamp (e.g. the hardcoded `Integration Season Test
 * League`) fall through to the existing brute-force cleanup.
 */
export function extractLeagueAgeMs(
  name: string,
  now: number = Date.now(),
): number | undefined {
  const msMatch = name.match(/\b(\d{13})\b\s*$/);
  if (msMatch) {
    return now - Number(msMatch[1]);
  }
  const isoMatch = name.match(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (isoMatch) {
    const ts = Date.parse(isoMatch[0]);
    if (!Number.isNaN(ts)) return now - ts;
  }
  return undefined;
}

export function isYoungerThanCleanupThreshold(
  name: string,
  now: number = Date.now(),
): boolean {
  const ageMs = extractLeagueAgeMs(name, now);
  return ageMs !== undefined && ageMs < MIN_LEAGUE_AGE_FOR_CLEANUP_MS;
}

export interface CleanupCandidate {
  id: number;
  name: string;
}

export interface CleanupSelection<T extends CleanupCandidate> {
  /** Safe to delete now. */
  targets: T[];
  /** Skipped: likely owned by a concurrent run still in flight. */
  inFlight: T[];
}

/**
 * Run-scoped cleanup selection (LS-10330).
 *
 * Partitions the test-pattern-matched leagues visible to a sweep into the set
 * it may delete and the set it must leave alone. Ownership beats age:
 *
 * 1. A league tagged with **this job's** tag is always a target — the job is
 *    either finishing (teardown) or re-attempting (a `run_attempt` retry of
 *    the same job after the first attempt died mid-suite), and in both cases
 *    nothing else can be using it. This is only sound because the tag is per
 *    *job* (`resolveJobKey` in league-run-scope.ts): with one run-wide tag,
 *    a sibling shard's or the shared-live job's live league also matched and
 *    was deleted mid-spec (LS-11054).
 * 2. A league tagged with **any other** tag — another run, or a sibling job of
 *    this run — is a target only once it is older than
 *    `MIN_LEAGUE_AGE_FOR_CLEANUP_MS`; before that it is that job's live
 *    fixture, whether or not the two are (mistakenly) overlapping.
 * 3. An **untagged** league (legacy names, the server-assigned `Mock Draft
 *    Practice`) keeps the pre-existing timestamp heuristic: skipped while a
 *    parseable timestamp says it is young, otherwise deleted.
 */
export function selectCleanupTargets<T extends CleanupCandidate>(
  leagues: readonly T[],
  options: { runTag: string; now?: number },
): CleanupSelection<T> {
  const now = options.now ?? Date.now();
  const targets: T[] = [];
  const inFlight: T[] = [];
  for (const league of leagues) {
    if (!isTestLeague(league.name)) continue;
    if (belongsToRun(league.name, options.runTag)) {
      targets.push(league);
      continue;
    }
    // Tagged names always end in a 13-digit timestamp (league-run-scope.ts),
    // so the age guard is what separates another run's live fixture from an
    // abandoned one; untagged names fall through to the legacy heuristic.
    if (isYoungerThanCleanupThreshold(league.name, now)) {
      inFlight.push(league);
    } else {
      targets.push(league);
    }
  }
  return { targets, inFlight };
}

/**
 * Active-run lockfile (LS-4539).
 *
 * On-disk sentinel that lets `global-setup` skip the sweep when another
 * Playwright integration process is running on the same host. The path lives
 * inside `apps/web-e2e/.playwright-integration.lock` so it sits next to the
 * suite it guards.
 *
 * Stale locks (older than `ACTIVE_RUN_LOCK_STALE_MS`) are ignored, so a
 * crashed previous run cannot block crash recovery indefinitely. Cross-machine
 * concurrency is still handled by the per-league 4h age guard; this lock only
 * adds protection for same-host reruns (developer running the suite twice in
 * parallel, etc.).
 */
export const ACTIVE_RUN_LOCK_STALE_MS = 15 * 60 * 1000;

const ACTIVE_RUN_LOCK_FILENAME = '.playwright-integration.lock';

function resolveActiveRunLockPath(): string {
  // `path.resolve(__dirname, ...)` would tie the helper to its source layout
  // and break under bundling. The lockfile lives at the web-e2e package root,
  // which is two directories up from `src/integration/`.
  const dir = path.resolve(__dirname, '..', '..');
  return path.join(dir, ACTIVE_RUN_LOCK_FILENAME);
}

export function isActiveRunLockFresh(
  now: number = Date.now(),
  lockPath: string = resolveActiveRunLockPath(),
): boolean {
  try {
    const stat = fs.statSync(lockPath);
    return now - stat.mtimeMs < ACTIVE_RUN_LOCK_STALE_MS;
  } catch {
    return false;
  }
}

export function writeActiveRunLock(
  lockPath: string = resolveActiveRunLockPath(),
): void {
  try {
    fs.writeFileSync(lockPath, String(Date.now()), 'utf-8');
  } catch {
    // Lockfile is best-effort: a write failure (e.g. read-only FS in CI) is
    // strictly less dangerous than blocking the sweep on a transient I/O
    // error, and the 4h age guard still protects in-flight leagues.
  }
}

export function clearActiveRunLock(
  lockPath: string = resolveActiveRunLockPath(),
): void {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Already gone or never written — both are fine.
  }
}
