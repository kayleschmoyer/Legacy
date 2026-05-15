/**
 * Shared helpers for integration test league cleanup. Used by both
 * `global-setup.ts` and `global-teardown.ts` to identify which leagues are
 * test-created and safe to delete.
 */

/**
 * Well-known name patterns produced by integration tests. Any league whose
 * name matches one of these is eligible for cleanup.
 */
const TEST_LEAGUE_PATTERNS = [
  'Test League',
  'Integration Season Test League',
  // All UI integration tests use "<Label> E2E <timestamp>" naming
  /\bE2E\b/,
];

export function isTestLeague(name: string): boolean {
  return TEST_LEAGUE_PATTERNS.some((pattern) =>
    typeof pattern === 'string' ? name.startsWith(pattern) : pattern.test(name),
  );
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
