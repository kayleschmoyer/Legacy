/**
 * Premium Upgrade Modal — Baseball League Create (LS-5370)
 *
 * Covers the `create-league-baseball` page's premium-gating journey:
 * a free user is blocked with an `UpgradeModal` when they try to select
 * FAAB waivers, enable a salary cap, pick a non-free historical era, or
 * customize the Advanced Scheduling in-division game ratio (LS-6106).
 * A premium user hits none of these gates and can submit the form with
 * all settings enabled.
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

const freeUserTest = customAuthTest('freeuser-ls5370@test.com', 'none');

/** Mock a successful createLeagueAndTeams response. */
async function mockCreateLeagueSuccess(page: import('@playwright/test').Page) {
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() === 'createleagueandteams') {
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
  'Create League (Baseball) – Premium Upgrade Modal for free users @regression',
  () => {
    freeUserTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    freeUserTest(
      'clicking the FAAB waiver option opens the upgrade modal (does not select FAAB)',
      async ({ leaguePage }) => {
        await leaguePage.expandSection('waiver-budget');

        await leaguePage.button(/FAAB/i).first().tap();

        await leaguePage.expectUpgradeModalVisible('FAAB Waiver Settings');

        // The waiver type must not have actually switched to FAAB — the
        // FAAB budget field (only rendered when waiverType === 'faab')
        // stays hidden once the modal is dismissed.
        await leaguePage.closeUpgradeModal();
        await leaguePage.text('FAAB Budget (per manager)').expectHidden();
      },
    );

    freeUserTest(
      'clicking a locked historical era opens the upgrade modal (does not select the era)',
      async ({ leaguePage }) => {
        await leaguePage.expandSection('era-history');

        // "Golden Age" is a premium-only era for baseball.
        await leaguePage.button('Golden Age').tap();

        await leaguePage.expectUpgradeModalVisible('Historical Era Selection');
      },
    );

    freeUserTest(
      'clicking the locked Custom Era tile opens an upgrade modal that mentions Custom Era (LS-6081)',
      async ({ leaguePage }) => {
        await leaguePage.expandSection('era-history');

        // Custom Era is premium-gated, same as the preset historical eras —
        // the modal copy must not read as if only bundled eras unlock.
        await leaguePage.button('Custom Era').tap();

        await leaguePage.expectUpgradeModalVisible('Historical Era Selection');
        await leaguePage.text(/custom year range/i).expectVisible();
      },
    );

    freeUserTest(
      'Salary Cap field is behind a premium gate; upgrading opens the upgrade modal',
      async ({ leaguePage }) => {
        await leaguePage.expandSection('waiver-budget');

        await leaguePage.premiumGate.expectVisible();
        await leaguePage.clickPremiumGateUpgrade();

        await leaguePage.expectUpgradeModalVisible('Salary Cap');
      },
    );

    freeUserTest(
      'the era banner "View pricing" link deep-links straight to /pricing (LS-6086)',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('era-history');

        await leaguePage.testId('era-banner-view-pricing-link').tap();

        await expect(page).toHaveURL(/\/pricing/);
      },
    );

    freeUserTest(
      'Advanced Scheduling field is behind a premium gate for the default Divisional strategy; upgrading opens the upgrade modal (LS-6106)',
      async ({ leaguePage }) => {
        // Divisional is the default schedulingStrategy, so the "roster-schedule"
        // section already shows the gated control once expanded.
        await leaguePage.expandSection('roster-schedule');

        await leaguePage.premiumGate.expectVisible();
        await leaguePage.clickPremiumGateUpgrade();

        await leaguePage.expectUpgradeModalVisible('Advanced Scheduling');
      },
    );
  },
);

adminTest.describe(
  'Create League (Baseball) – premium user bypasses the upgrade modal @regression',
  () => {
    adminTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'premium');
      await mockCreateLeagueSuccess(page);
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
    });

    adminTest(
      'can select FAAB, a premium era, and enable the salary cap, then submit without seeing an upgrade modal',
      async ({ page, leaguePage }) => {
        await leaguePage.expandSection('waiver-budget');
        await leaguePage.clickButton(/FAAB/i, { exact: false });
        await leaguePage.text('FAAB Budget (per manager)').expectVisible();

        await leaguePage.clickButton('On', { exact: true });
        await leaguePage.text('Salary Cap Limit').expectVisible();
        await leaguePage.fillSalaryCapAmount(50000000);

        await leaguePage.expandSection('era-history');
        await leaguePage.clickButton('Golden Age');

        await leaguePage.expandSection('roster-schedule');
        await leaguePage.clickButton('80%', { exact: true });

        await leaguePage.expectNoUpgradeModal();

        await leaguePage.fillLeagueName('Premium League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
      },
    );
  },
);
