import type { APIRequestContext } from '@playwright/test';
import { LOGGER } from '@legacy-sports/logging';
import { graphql } from './graphql';

/**
 * Reset the authenticated user's free-tier weekly mock-draft usage (LS-7872).
 *
 * The free tier caps mock drafts at `MOCK_DRAFT_FREE_WEEKLY_LIMIT` per rolling
 * 7-day window (`countRecentMockDrafts`, gated on
 * `owner = userId AND isMockDraft = true`). Once a commissioner exhausts that
 * cap, `MockDraftPage` renders `LimitReachedScreen` instead of the setup form —
 * and because mock-draft leagues are excluded from `userLeagues`/`myLeagues`,
 * the standard cleanup sweeps never reap them, so the count never resets within
 * the window and the spec stays red for up to a week.
 *
 * Uses the `deleteMyMockDraftLeagues` mutation (LS-8238), which deletes ONLY the
 * caller's own mock leagues (`owner = caller AND is_mock_draft = true`).
 *
 * It deliberately does NOT use `deleteAllLeagues`. The integration specs all run
 * as the same shared commissioner test user, which is provisioned
 * `access_level = 'admin'`; for an admin caller `deleteAllLeagues` deletes every
 * league that user is a *member of* system-wide (no age guard, no scoping). With
 * the suite sharded across parallel jobs against one shared dev backend, that
 * reset was deleting the in-flight leagues of every other concurrently-running
 * spec mid-test — the root cause of the persistent nightly integration cluster
 * (LS-8238). The scoped mutation can never touch a real league or another spec's
 * league, even when the caller is an admin.
 *
 * Call this from `beforeAll` so Phase 1 always sees `remaining > 0`. Real
 * failures are surfaced (they point the failure at the reset rather than a
 * downstream "button not found" timeout). The one tolerated case is the
 * deploy-lag window: integration specs run against the already-deployed backend,
 * so on the PR that introduces the mutation the field is not yet live — an
 * "unknown field" error is logged and swallowed (the nightly, which runs against
 * deployed `main`, exercises the real reset).
 */
export async function resetMockDraftUsage(
  api: APIRequestContext,
): Promise<void> {
  const result = await graphql<{ deleteMyMockDraftLeagues: number | null }>(
    api,
    'mutation { deleteMyMockDraftLeagues }',
  );

  if (result.errors?.length) {
    const message = result.errors.map((e) => e.message).join('; ');
    // Deploy-lag tolerance: the mutation does not exist on the deployed backend
    // until this change merges and the db Lambda deploys. A GraphQL validation
    // error for the unknown field is expected on the introducing PR's run and
    // must not fail the spec; any other error is a real failure.
    if (
      /deleteMyMockDraftLeagues/.test(message) &&
      /field|Cannot query|Unknown/i.test(message)
    ) {
      LOGGER.warn(
        `[resetMockDraftUsage] deleteMyMockDraftLeagues not yet deployed; ` +
          `skipping reset (expected only on the introducing PR): ${message}`,
      );
      return;
    }
    throw new Error(
      `[resetMockDraftUsage] deleteMyMockDraftLeagues failed: ${message}`,
    );
  }

  LOGGER.info(
    `[resetMockDraftUsage] deleted ${result.data?.deleteMyMockDraftLeagues ?? 0} mock-draft league(s)`,
  );
}
