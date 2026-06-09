import type { APIRequestContext } from '@playwright/test';
import { LOGGER } from '@legacy-sports/logging';
import { graphql } from './graphql';

/**
 * Reset the authenticated user's free-tier weekly mock-draft usage (LS-7872).
 *
 * The free tier caps mock drafts at `MOCK_DRAFT_FREE_WEEKLY_LIMIT` per rolling
 * 7-day window (`countRecentMockDrafts`, gated on
 * `owner = userId AND isMockDraft = true`). Once a per-spec commissioner exhausts
 * that cap, `MockDraftPage` renders `LimitReachedScreen` instead of the setup
 * form — and because mock-draft leagues are excluded from `userLeagues`/
 * `myLeagues`, the standard cleanup sweeps never reap them, so the count never
 * resets within the window and the spec stays red for up to a week.
 *
 * Why `deleteAllLeagues` rather than enumerate-and-delete-mock-leagues:
 *   - Mock-draft leagues are otherwise unlistable (no query returns them), so a
 *     targeted reset would require a *new* backend query. Integration specs run
 *     against the live, already-deployed backend (api.legacy-fantasy.com), so a
 *     brand-new resolver would not exist there until after this PR merges and
 *     deploys — meaning the local spec gate could never pass pre-merge.
 *   - `deleteAllLeagues` is already deployed and, for a non-admin caller, hard-
 *     deletes every league where `owner = userId` (it has no `isMockDraft`
 *     filter), which includes leftover mock leagues. Each spec authenticates as
 *     a per-spec-unique commissioner that owns only this spec's leagues, so this
 *     is equivalent to deleting this spec's own leftovers — leagues the caller is
 *     merely a member of (not owner) are untouched.
 *
 * Call this from `beforeAll` so Phase 1 always sees `remaining > 0`. Failures are
 * surfaced (they point the failure at the reset rather than a downstream
 * "button not found" timeout).
 */
export async function resetMockDraftUsage(
  api: APIRequestContext,
): Promise<void> {
  const result = await graphql<{ deleteAllLeagues: string | null }>(
    api,
    'mutation { deleteAllLeagues }',
  );

  if (result.errors?.length) {
    throw new Error(
      `[resetMockDraftUsage] deleteAllLeagues failed: ${result.errors
        .map((e) => e.message)
        .join('; ')}`,
    );
  }

  LOGGER.info(
    `[resetMockDraftUsage] ${result.data?.deleteAllLeagues ?? 'reset complete'}`,
  );
}
