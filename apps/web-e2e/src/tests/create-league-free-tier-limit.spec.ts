/**
 * Create League (Football) — Free-Tier League Limit Gating (LS-5376)
 *
 * `LeagueCreatePage` (apps/web/src/pages/baseball/LeagueCreatePage.tsx — the
 * shared, sport-aware Create League page also mounted at
 * `/football/league/create`) proactively gates free-tier users who are
 * already a member of `FREE_LEAGUE_LIMIT` leagues (across every sport):
 *
 *   - A `league-limit-banner` alert renders on the form.
 *   - Submitting opens the `UpgradeModal` instead of calling the
 *     `createLeagueAndTeams` mutation — no league is created while at the cap.
 *
 * Premium users are never capped, regardless of league count.
 *
 * Hermetic — all GraphQL is mocked via page.route(); no live backend
 * required. `userLeagueCount` (LS-9101) drives the gate, not the length of
 * the mocked `userLeagues` array.
 */

import { customAuthTest, expect, leagueTest as test } from '../fixtures/pages';
import { useTier } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

/** Free-tier identity, with page objects injected. */
const freeUserTest = customAuthTest('freeuser@test.com', 'none');

/** Override `GetUserLeagues` so `userLeagueCount` drives the free-tier gate. */
async function mockLeagueCount(
  page: import('@playwright/test').Page,
  count: number,
) {
  await createGraphQLRouter(page, {
    getuserleagues: (route) =>
      fulfillJson(route, { data: { userLeagues: [], userLeagueCount: count } }),
  });
}

/**
 * Mocks the createLeagueAndTeams mutation (fulfilling with a valid league so
 * the "not blocked" tests can complete the create flow) and records whether
 * it was called, so the blocked-submit test can assert no league was ever
 * created.
 */
async function mockCreateLeague(
  page: import('@playwright/test').Page,
  called: { current: boolean },
) {
  await createGraphQLRouter(page, {
    createleagueandteams: (route) => {
      called.current = true;
      return fulfillJson(route, {
        data: {
          createLeagueAndTeams: {
            __typename: 'CreateLeagueAndTeamsPayload',
            league: {
              __typename: 'League',
              id: 888,
              name: 'Test League',
              owner: 1,
              maxRosterSize: 16,
              currentMatchup: null,
              draftStatus: 'not-started',
              numberOfTeams: 12,
              playerPool: 'all',
              draftMode: 'live',
              selectionMethod: 'standard',
              draftOrder: 'snake',
              isPublic: false,
            },
          },
        },
      });
    },
  });
}

test.describe('Create League (Football) — Free-Tier League Limit Gating @regression', () => {
  freeUserTest(
    'free user at the league cap sees the league-limit banner',
    async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await mockLeagueCount(page, 3);
      await leaguePage.gotoCreate('football');

      await leaguePage.leagueLimitBanner.expectVisible();
      await leaguePage.text(/League limit reached/i).expectVisible();
    },
  );

  freeUserTest(
    'free user at the league cap: submitting opens the upgrade modal and never creates a league',
    async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await mockLeagueCount(page, 3);
      const created = { current: false };
      await mockCreateLeague(page, created);

      await leaguePage.gotoCreate('football');
      await leaguePage.leagueLimitBanner.expectVisible();

      await leaguePage.submitCreate();

      await leaguePage.expectUpgradeModalVisible('Unlimited League Creation');
      expect(created.current).toBe(false);
    },
  );

  freeUserTest(
    'free user below the league cap sees no banner and can create normally',
    async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await mockLeagueCount(page, 2);
      await mockCreateLeague(page, { current: false });
      await leaguePage.gotoCreate('football');

      await leaguePage.leagueLimitBanner.expectHidden();

      await leaguePage.fillLeagueName('Under The Cap FC');
      await leaguePage.submitCreate();
      await leaguePage.continueToLeague();

      await expect(page).toHaveURL(/\/football\/league\/\d+/);
    },
  );

  test('premium user at/above the same league count sees no banner and can create normally', async ({
    page,
    leaguePage,
  }) => {
    // Baseline getuserbyid/myentitlements resolve to the premium tier by
    // default (LS-8056) — no useTier() call needed.
    await mockLeagueCount(page, 5);
    await mockCreateLeague(page, { current: false });
    await leaguePage.gotoCreate('football');

    await leaguePage.leagueLimitBanner.expectHidden();

    await leaguePage.fillLeagueName('Premium Unlimited FC');
    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();

    await expect(page).toHaveURL(/\/football\/league\/\d+/);
  });
});
