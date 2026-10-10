import type { APIRequestContext } from '@playwright/test';
import { graphql } from './graphql';

/**
 * Returns `false` only when the API positively reports the league is gone
 * (`league(id)` resolves to null or errors with "not found"). Any other
 * failure (network, auth) returns `true` so callers never mask a real UI
 * failure with a speculative "league deleted" diagnosis.
 */
export async function leagueExists(
  api: APIRequestContext,
  leagueId: number,
): Promise<boolean> {
  try {
    const result = await graphql<{ league: { id: number } | null }>(
      api,
      'query LeagueExistsForTest($id: Int!) { league(id: $id) { id } }',
      { id: leagueId },
    );
    if (result.errors?.some((e) => /not found/i.test(e.message))) return false;
    if (result.errors?.length) return true;
    return result.data?.league != null;
  } catch {
    return true;
  }
}

/**
 * Run a UI assertion against a spec-owned league; if it fails and the league
 * no longer exists, rethrow with an explicit "deleted externally" diagnosis
 * instead of the raw locator error (LS-11055).
 *
 * Live-backend specs share the dev database, so an overlapping run's cleanup
 * can delete a league mid-spec (LS-11054). Without this guard the failure
 * surfaces as an unrelated-looking "element(s) not found" on whatever locator
 * the next phase waits for, which reads like an app regression.
 */
export async function withLeagueDeletionDiagnosis<T>(
  api: APIRequestContext,
  leagueId: number,
  specTag: string,
  assertion: () => Promise<T>,
): Promise<T> {
  try {
    return await assertion();
  } catch (err) {
    if (leagueId && !(await leagueExists(api, leagueId))) {
      throw new Error(
        `[${specTag}] League ${leagueId} no longer exists — deleted mid-spec by external cleanup ` +
          '(likely an overlapping live-backend run, see LS-11054). This is not an app regression. ' +
          `Original failure: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  }
}
