/**
 * Premium Advanced Options — Football League Create (LS-5378)
 *
 * Covers the `create-league-football` page's premium-access journey (Epic
 * LS-5263): a premium-entitled commissioner opens the advanced/premium
 * options on the football create form, finds them enabled (not gated),
 * modifies FAAB waivers, the salary cap, a premium historical era, and the
 * Advanced Scheduling in-division game ratio, then submits and the league is
 * created with those values persisted in the mutation input.
 *
 * Complements league-creation-football.spec.ts, which proves the same
 * controls stay *gated* for free-tier users in football mode — this file is
 * the premium-bypass counterpart, mirroring the baseball coverage in
 * create-league-premium-upgrade-modal.spec.ts (LS-5370).
 *
 * Hermetic — all GraphQL is mocked via page.route; no live backend required.
 */

import { adminTest, expect } from '../fixtures/pages';
import {
  enableFootball,
  extractOperationName,
  unmockedGraphQLFallback,
  useTier,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** Mock a successful createLeagueAndTeams response and capture its input. */
async function mockCreateLeagueSuccess(
  page: import('@playwright/test').Page,
  capturedInput: { current: Record<string, unknown> | null },
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    if (extractOperationName(route).toLowerCase() === 'createleagueandteams') {
      const body = route.request().postData() ?? '';
      try {
        const parsed = JSON.parse(body) as {
          variables?: { input?: Record<string, unknown> };
        };
        capturedInput.current = parsed.variables?.input ?? null;
      } catch {
        capturedInput.current = null;
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
                id: 555,
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
        }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

adminTest.describe(
  'Create League (Football) – premium user accesses advanced options @regression',
  () => {
    adminTest.beforeEach(async ({ page }) => {
      await useTier(page, 'premium');
      await enableFootball(page);
    });

    adminTest(
      'advanced/premium options are enabled (not gated) for a premium commissioner',
      async ({ leaguePage }) => {
        await leaguePage.gotoCreate('football');
        await leaguePage.leagueNameInput.expectVisible();

        await leaguePage.expandSection('waiver-budget');
        await leaguePage.button(/FAAB/i).first().expectVisible();
        await leaguePage.expectNoUpgradeModal();
        await leaguePage.premiumGate.expectHidden();

        await leaguePage.expandSection('era-history');
        await leaguePage.button('Super Bowl Era').expectVisible();
        await leaguePage.expectNoUpgradeModal();
        await leaguePage.premiumGate.expectHidden();
      },
    );

    adminTest(
      'can select FAAB, a premium era, and enable the salary cap, then submit — advanced values persist',
      async ({ page, leaguePage }) => {
        const captured: { current: Record<string, unknown> | null } = {
          current: null,
        };
        await mockCreateLeagueSuccess(page, captured);

        await leaguePage.gotoCreate('football');
        await leaguePage.leagueNameInput.expectVisible();

        await leaguePage.expandSection('waiver-budget');
        await leaguePage.clickButton(/FAAB/i, { exact: false });
        await leaguePage.text('FAAB Budget (per manager)').expectVisible();
        // $250 is a preset FAAB_BUDGET_OPTIONS value — no need to open Custom mode.
        await leaguePage.clickButton('$250', { exact: true });

        await leaguePage.clickButton('On', { exact: true });
        await leaguePage.text('Salary Cap Limit').expectVisible();
        await leaguePage.fillSalaryCapAmount(200000000);

        await leaguePage.expandSection('era-history');
        await leaguePage.clickButton('Super Bowl Era');

        await leaguePage.expandSection('roster-schedule');
        await leaguePage.clickButton('80%', { exact: true });

        await leaguePage.expectNoUpgradeModal();

        await leaguePage.fillLeagueName('Premium Football League');
        await leaguePage.submitCreate();
        await leaguePage.continueToLeague();

        await expect(page).toHaveURL(/\/football\/league\/\d+/);

        expect(captured.current?.sport).toBe('football');
        expect(captured.current?.waiverType).toBe('faab');
        expect(captured.current?.faabBudgetDefault).toBe(250);
        expect(captured.current?.salaryCapEnabled).toBe(true);
        expect(captured.current?.salaryCap).toBe(200000000);
        expect(captured.current?.eraFilter).toBe('super_bowl');
        expect(captured.current?.schedulingStrategy).toBe('divisional');
        expect(captured.current?.schedulingDivisionalWeightPct).toBe(80);
      },
    );
  },
);
