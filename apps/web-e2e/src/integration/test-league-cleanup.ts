/**
 * Shared helpers for integration test league cleanup. Used by both
 * `global-setup.ts` and `global-teardown.ts` to identify which leagues are
 * test-created and safe to delete.
 */
import fs from 'fs';
import path from 'path';

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
  // All UI integration tests use "<Label> E2E <timestamp>" naming
  /\bE2E\b/,
];

export function isTestLeague(name: string): boolean {
  return TEST_LEAGUE_PATTERNS.some((pattern) =>
    typeof pattern === 'string' ? name.startsWith(pattern) : pattern.test(name),
  );
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
