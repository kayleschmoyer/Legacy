/**
 * Keeper (Roster Continuity) — Baseball League Create (LS-8672)
 *
 * Covers the `create-league-baseball` page's Roster Continuity control in
 * Draft Settings: a free user is blocked by a premium gate; a premium user
 * can select Keeper, configure keeperCount/costModel/maxConsecutiveKeeps/
 * rookieExempt, and submit — the mutation payload carries rosterContinuity
 * and keeperSettings. Also covers the costModel-follows-selectionMethod
 * constraint (AC3): switching selectionMethod re-derives the keeper cost
 * model (round-penalty for Standard, auction-budget for Auction).
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

const freeUserTest = customAuthTest('freeuser-ls8672@test.com', 'none');

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
  'Create League (Baseball) – Keeper mode premium gate for free users @regression',
  () => {
    freeUserTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    freeUserTest(
      'Roster Continuity field is behind a premium gate; upgrading opens the upgrade modal',
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
  'Create League (Baseball) – premium user configures Keeper mode @regression',
  () => {
    adminTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'premium');
      await mockCreateLeagueSuccess(page);
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    adminTest(
      'selects Keeper, configures keeper settings, and submits without seeing an upgrade modal',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('draft');

        await leaguePage.clickButton('Keeper', { exact: true });
        await leaguePage.fillKeeperCount(4);
        // selectionMethod defaults to Standard — Round Penalty is the only
        // valid keeper cost model for it (AC3).
        await leaguePage.clickButton('Round Penalty');
        await leaguePage.clickButton('Yes', { exact: true }); // Rookie Exempt

        await leaguePage.expectNoUpgradeModal();

        await leaguePage.fillLeagueName('Keeper League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);

        expect(lastCreateLeagueInput?.rosterContinuity).toBe('keeper');
        expect(lastCreateLeagueInput?.keeperSettings).toMatchObject({
          keeperCount: 4,
          costModel: 'round-penalty',
          rookieExempt: true,
        });
      },
    );

    adminTest(
      'auto-corrects the keeper cost model when the selection method changes (AC3)',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('draft');

        await leaguePage.clickButton('Keeper', { exact: true });
        await leaguePage.fillKeeperCount(2);

        // Switching to Auction re-derives the cost model to Auction Budget —
        // Round Penalty is only valid for Standard drafts.
        await leaguePage.clickButton('Auction', { exact: true });

        await leaguePage.fillLeagueName('Auction Keeper League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);

        expect(lastCreateLeagueInput?.keeperSettings).toMatchObject({
          costModel: 'auction-budget',
        });
      },
    );

    adminTest(
      'turning Keeper mode back off omits rosterContinuity and keeperSettings from the submission',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('draft');

        await leaguePage.clickButton('Keeper', { exact: true });
        await leaguePage.fillKeeperCount(3);
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
