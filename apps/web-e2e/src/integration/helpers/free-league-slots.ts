import { LOGGER } from '@legacy-sports/logging';
import { gqlFetch } from './gql-fetch';

/**
 * Delete every non-mock league the given user belongs to, freeing slots
 * against the free-tier 3-league limit before a spec creates its own league.
 *
 * Why this exists (LS-7704): integration specs authenticate as a *per-spec*
 * commissioner persona (`commissioner-<hash>@test.legacysports.dev`, LS-4940).
 * The `global-setup.ts` pre-run sweep only enumerates the *base* commissioner,
 * so leagues leaked by earlier runs of the same spec — most commonly the
 * renewed season-2 league created by `season-renewal-migration-ui`, which was
 * historically never cleaned — accumulate under that per-spec identity until
 * `createLeague` fails with "You have reached the 3-league limit for your
 * current plan." Specs whose own commissioner can hit the cap call this in
 * Phase 1 before creating their league.
 *
 * Safe for per-spec identities: the suite runs serially (`workers: 1`,
 * `fullyParallel: false`) and each spec owns its persona, so every league
 * returned here is a leftover from a *previous* run of the same spec — never a
 * league in active use by a concurrent test.
 *
 * Best-effort: never throws. A cleanup failure (auth, network, a frozen league
 * that refuses deletion) must not mask the real test outcome; the global
 * teardown / next-run sweep remain the backstop.
 */
export async function freeCommissionerLeagueSlots(jwt: string): Promise<void> {
  // Up to 3 passes. `deleteLeague` does not cascade the self-referential
  // `previousLeagueId` lineage FK, so a renewed season-2 league must be deleted
  // before its frozen season-1 parent (deleting the parent first fails with an
  // FK violation → "Internal server error"). Deleting newest-first (descending
  // id — a renewed league is always created after its parent) clears children
  // before parents, and re-listing each pass lets a parent freed by an
  // earlier-pass child deletion go on the next pass. Stops early when the user
  // has no leagues left or a pass makes no progress (LS-7704).
  for (let pass = 0; pass < 3; pass++) {
    let leagues: Array<{ id: number; name: string }> = [];
    try {
      const data = await gqlFetch<{
        userLeagues: Array<{ id: number; name: string }>;
      }>(jwt, 'query { userLeagues { id name } }');
      leagues = data.userLeagues ?? [];
    } catch (err) {
      LOGGER.info(
        `[freeCommissionerLeagueSlots] could not list leagues: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    if (leagues.length === 0) return;

    // Newest-first so lineage children are removed before their parents.
    leagues.sort((a, b) => b.id - a.id);

    let deletedAny = false;
    for (const league of leagues) {
      try {
        await gqlFetch<{ deleteLeague: string | null }>(
          jwt,
          'mutation($leagueId: Int!) { deleteLeague(leagueId: $leagueId) }',
          { leagueId: league.id },
        );
        deletedAny = true;
        LOGGER.info(
          `[freeCommissionerLeagueSlots] deleted leftover league ${league.id} (${league.name})`,
        );
      } catch (err) {
        LOGGER.info(
          `[freeCommissionerLeagueSlots] failed to delete league ${league.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // No deletions succeeded this pass — the remainder are undeletable; another
    // pass would not help.
    if (!deletedAny) return;
  }
}
