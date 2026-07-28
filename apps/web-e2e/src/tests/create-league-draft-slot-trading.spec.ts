/**
 * Draft Slot Trading toggle — Baseball League Create (LS-8675)
 *
 * Covers the premium-gated "Draft Slot Trading" toggle in the Draft Settings
 * section: a free user tapping it gets the `UpgradeModal` (locked-tap
 * pattern) and the toggle stays off; a premium user can enable it and the
 * `createLeagueAndTeams` input carries `allowDraftSlotTrading: true`; the
 * toggle is hidden for auction leagues (no slots to trade) and a previously
 * enabled value is not submitted after switching to auction.
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

const freeUserTest = customAuthTest('freeuser-ls8675@test.com', 'none');

interface CapturedCreateLeagueInput {
  allowDraftSlotTrading?: boolean;
  selectionMethod?: string;
}

/**
 * Mock a successful createLeagueAndTeams response, capturing each call's
 * `input` variables so specs can assert what the form actually submitted.
 */
async function mockCreateLeagueSuccess(
  page: import('@playwright/test').Page,
  captured: CapturedCreateLeagueInput[],
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() === 'createleagueandteams') {
      const postData = route.request().postDataJSON() as {
        variables?: { input?: CapturedCreateLeagueInput };
      };
      captured.push(postData.variables?.input ?? {});
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
  'Create League (Baseball) – Draft Slot Trading gate for free users @regression',
  () => {
    freeUserTest.beforeEach(async ({ page, leaguePage }) => {
      await useTier(page, 'free');
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
      await leaguePage.expandSection('draft');
      await leaguePage.draftSlotTradingToggle.expectVisible();
    });

    freeUserTest(
      'tapping the toggle opens the upgrade modal and does not enable slot trading',
      async ({ leaguePage }) => {
        await leaguePage.clickButton('On', { exact: true });

        await leaguePage.expectUpgradeModalVisible('Draft Slot Trading');
        await leaguePage.closeUpgradeModal();

        // The toggle must not have flipped — tapping "On" again re-opens the
        // upgrade modal instead of toggling off an already-enabled setting.
        await leaguePage.clickButton('On', { exact: true });
        await leaguePage.expectUpgradeModalVisible('Draft Slot Trading');
      },
    );
  },
);

adminTest.describe(
  'Create League (Baseball) – Draft Slot Trading for premium users @regression',
  () => {
    const captured: CapturedCreateLeagueInput[] = [];

    adminTest.beforeEach(async ({ page, leaguePage }) => {
      captured.length = 0;
      await useTier(page, 'premium');
      await mockCreateLeagueSuccess(page, captured);
      await leaguePage.gotoCreate();
      await leaguePage.leagueNameInput.expectVisible();
      await leaguePage.expandSection('draft');
      await leaguePage.draftSlotTradingToggle.expectVisible();
    });

    adminTest(
      'can enable slot trading without an upgrade modal and submits allowDraftSlotTrading: true',
      async ({ page, leaguePage }) => {
        await leaguePage.clickButton('On', { exact: true });
        await leaguePage.expectNoUpgradeModal();

        await leaguePage.fillLeagueName('Slot Trading League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);

        expect(captured).toHaveLength(1);
        expect(captured[0].allowDraftSlotTrading).toBe(true);
      },
    );

    adminTest(
      'the toggle is hidden for auction leagues and a previously enabled value is not submitted',
      async ({ page, leaguePage }) => {
        // Enable slot trading first, then switch to an auction draft — the
        // toggle disappears (no slots to trade) and the coerced-off value
        // must not reach the server.
        await leaguePage.clickButton('On', { exact: true });
        await leaguePage.clickButton('Auction', { exact: true });
        await leaguePage.draftSlotTradingToggle.expectHidden();

        await leaguePage.fillLeagueName('Auction League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();
        await expect(page).toHaveURL(/\/baseball\/league\/\d+/);

        expect(captured).toHaveLength(1);
        expect(captured[0].selectionMethod).toBe('auction');
        expect(captured[0].allowDraftSlotTrading).toBeUndefined();
      },
    );

    adminTest(
      'switching back from auction shows the toggle off again',
      async ({ leaguePage }) => {
        await leaguePage.clickButton('On', { exact: true });
        await leaguePage.clickButton('Auction', { exact: true });
        await leaguePage.draftSlotTradingToggle.expectHidden();

        await leaguePage.clickButton('Standard', { exact: true });
        await leaguePage.draftSlotTradingToggle.expectVisible();

        // The coercion reset the value — enabling again must work without a
        // stale-on state (clicking "On" flips it from off).
        await leaguePage.clickButton('On', { exact: true });
        await leaguePage.expectNoUpgradeModal();
      },
    );
  },
);
