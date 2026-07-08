/**
 * Custom Era eligible-player-count preview — Baseball League Create (LS-6089)
 *
 * A premium user can pick a narrow custom era (e.g. 1942-1944, wartime
 * baseball) that yields too few eligible players to fill every roster, with
 * no pre-creation warning. This covers the live "X eligible players" preview
 * and shortfall warning rendered under the Custom Era inputs.
 *
 * All GraphQL responses are mocked (hermetic) — no live backend required.
 */

import { adminTest, expect } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** Mock previewEligiblePlayerCount to return a fixed count. */
async function mockEligibleCount(
  page: import('@playwright/test').Page,
  count: number,
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    if (
      extractOperationName(route).toLowerCase() === 'previeweligibleplayercount'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { previewEligiblePlayerCount: count },
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

adminTest.describe(
  'Create League (Baseball) — custom era eligible-player preview (LS-6089) @regression',
  () => {
    adminTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'premium');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
      await leaguePage.expandSection('era-history');
      await leaguePage.clickButton('Custom Era');
    });

    adminTest(
      'shows a shortfall warning for a narrow wartime range (1942-1944)',
      async ({ page, leaguePage }) => {
        await mockEligibleCount(page, 37);

        await leaguePage.testId('create-league-era-start-input').fill('1942');
        await leaguePage.testId('create-league-era-end-input').fill('1944');

        const countEl = leaguePage.testId('custom-era-eligible-count');
        await countEl.expectVisible();
        await countEl.byText('37 eligible players').expectVisible();
        await leaguePage.testId('custom-era-shortfall-warning').expectVisible();
      },
    );

    adminTest(
      'does not show a warning for a wide range (1920-1960) with a healthy pool',
      async ({ page, leaguePage }) => {
        await mockEligibleCount(page, 5000);

        await leaguePage.testId('create-league-era-start-input').fill('1920');
        await leaguePage.testId('create-league-era-end-input').fill('1960');

        const countEl = leaguePage.testId('custom-era-eligible-count');
        await countEl.expectVisible();
        await countEl.byText('5000 eligible players').expectVisible();
        await leaguePage.testId('custom-era-shortfall-warning').expectHidden();
      },
    );
  },
);
