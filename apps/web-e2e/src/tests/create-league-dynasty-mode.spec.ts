/**
 * Dynasty (Roster Continuity) — Baseball League Create (LS-8386)
 *
 * Covers the `create-league-baseball` page's Roster Continuity control in
 * Draft Settings for the Dynasty mode added by LS-8386: a free user is
 * blocked by the same premium gate that guards Keeper; a premium user can
 * select Dynasty and submit, and the mutation payload carries
 * rosterContinuity: 'dynasty' with NO keeperSettings (the server rejects
 * keeper settings sent alongside dynasty — validateKeeperConfig, LS-8671).
 *
 * Also covers the two behaviours that distinguish Dynasty from Keeper in the
 * shared control: selecting Dynasty hides the keeper configuration entirely,
 * and Dynasty stays selectable under a 'random' selection method (it has no
 * cost model, so the Keeper constraint does not apply).
 *
 * All GraphQL responses are mocked (hermetic) — no live backend required.
 */

import { adminTest, customAuthTest, expect } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

const freeUserTest = customAuthTest('freeuser-ls8386@test.com', 'none');

/** The `input` variable of the most recent captured createLeagueAndTeams call. */
let lastCreateLeagueInput: Record<string, unknown> | undefined;

/** Mock a successful createLeagueAndTeams response, capturing the request input. */
async function mockCreateLeagueSuccess(page: import('@playwright/test').Page) {
  lastCreateLeagueInput = undefined;
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() === 'createleagueandteams') {
      try {
        const body = JSON.parse(route.request().postData() ?? '') as {
          variables?: { input?: Record<string, unknown> };
        };
        lastCreateLeagueInput = body.variables?.input;
      } catch {
        lastCreateLeagueInput = undefined;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            createLeagueAndTeams: {
              __typename: 'CreateLeagueAndTeamsPayload',
              league: {
                __typename: 'League',
                id: 99,
                name: 'Test League',
                owner: 1,
                maxRosterSize: 25,
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
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

freeUserTest.describe(
  'Create League (Baseball) – Dynasty mode premium gate for free users @regression',
  () => {
    freeUserTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    freeUserTest(
      'Dynasty sits behind the same Roster Continuity premium gate as Keeper',
      async ({ leaguePage }) => {
        await leaguePage.expandSection('draft');

        await leaguePage.premiumGate.expectVisible();
        await leaguePage.clickPremiumGateUpgrade();

        await leaguePage.expectUpgradeModalVisible('Roster Continuity');
      },
    );
  },
);

adminTest.describe(
  'Create League (Baseball) – premium user selects Dynasty mode @regression',
  () => {
    adminTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'premium');
      await mockCreateLeagueSuccess(page);
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    adminTest(
      'selects Dynasty and submits with rosterContinuity dynasty and no keeper settings',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('draft');

        await leaguePage.clickButton('Dynasty', { exact: true });
        await leaguePage.expectNoUpgradeModal();

        await leaguePage.fillLeagueName('Dynasty League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);

        expect(lastCreateLeagueInput?.rosterContinuity).toBe('dynasty');
        // Dynasty persists every player at no cost, so there is nothing to
        // configure — and the server rejects keeperSettings sent with it.
        expect(lastCreateLeagueInput?.keeperSettings).toBeUndefined();
      },
    );

    adminTest(
      'selecting Dynasty clears keeper configuration entered beforehand',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('draft');

        // Configure Keeper first, then switch to Dynasty — the keeper fields
        // must not ride along into the submission.
        await leaguePage.clickButton('Keeper', { exact: true });
        await leaguePage.fillKeeperCount(4);
        await leaguePage.clickButton('Dynasty', { exact: true });

        await leaguePage.fillLeagueName('Switched To Dynasty');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);

        expect(lastCreateLeagueInput?.rosterContinuity).toBe('dynasty');
        expect(lastCreateLeagueInput?.keeperSettings).toBeUndefined();
      },
    );

    adminTest(
      'turning Dynasty back off omits rosterContinuity from the submission',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('draft');

        await leaguePage.clickButton('Dynasty', { exact: true });
        await leaguePage.clickButton('Redraft', { exact: true });

        await leaguePage.fillLeagueName('Redraft League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);

        expect(lastCreateLeagueInput?.rosterContinuity).toBeUndefined();
        expect(lastCreateLeagueInput?.keeperSettings).toBeUndefined();
      },
    );
  },
);
