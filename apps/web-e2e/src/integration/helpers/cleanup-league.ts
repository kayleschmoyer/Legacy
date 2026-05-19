import type { APIRequestContext } from '@playwright/test';
import { LOGGER } from '@legacy-sports/logging';
import { graphql } from './graphql';

/**
 * Layer-2 per-test league cleanup (LS-4539).
 *
 * Designed to be called from `test.afterAll` in serial integration specs that
 * share a single `state.leagueId`. Swallows every failure mode (auth, network,
 * GraphQL, already-deleted) because cleanup must never mask the real test
 * outcome. Anything that survives this call is reaped by:
 *   - Layer 3: `global-teardown.ts` end-of-run sweep
 *   - Layer 1: next run's `global-setup.ts` pre-run sweep (age >= 4h)
 *   - Layer 4: LS-4391 nightly cron
 *
 * No-ops when `leagueId` is falsy so specs that fail in Phase 1 (before the
 * league is created) can call this unconditionally.
 */
export async function cleanupLeague(
  api: APIRequestContext,
  leagueId: number | undefined,
): Promise<void> {
  if (!leagueId) return;
  try {
    const result = await graphql<{ deleteLeague: string | null }>(
      api,
      'mutation($leagueId: Int!) { deleteLeague(leagueId: $leagueId) }',
      { leagueId },
    );
    if (result.errors?.length) {
      LOGGER.info(
        `[cleanupLeague] leagueId=${leagueId} deleteLeague returned errors: ${result.errors
          .map((e) => e.message)
          .join('; ')} (will fall through to global teardown)`,
      );
      return;
    }
    if (!result.data?.deleteLeague) {
      LOGGER.info(
        `[cleanupLeague] leagueId=${leagueId} deleteLeague returned no payload (already deleted?)`,
      );
      return;
    }
    LOGGER.info(`[cleanupLeague] leagueId=${leagueId} deleted`);
  } catch (err) {
    LOGGER.info(
      `[cleanupLeague] leagueId=${leagueId} swallowed error: ${
        err instanceof Error ? err.message : String(err)
      } (will fall through to global teardown)`,
    );
  }
}
