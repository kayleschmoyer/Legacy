/**
 * League Creation — Football Draft Type & Settings E2E Tests (LS-5375)
 *
 * QA coverage for the "Draft Type & Settings" feature of the Create League
 * (Football) page (epic LS-5263). Verifies the football create-league form's
 * Draft Settings section: choosing each draft type (Selection Method +
 * Draft Order), the dependent controls that appear per choice (auction
 * budget/min-bid, pick timer), and that the chosen values persist into the
 * CreateLeagueAndTeams mutation input on submit.
 *
 * Hermetic — all GraphQL is mocked via page.route.
 *
 * Complements:
 *  - league-creation-football.spec.ts (sport-aware routing + `sport` persistence)
 *  - league-creation-advanced.spec.ts (baseball draft settings equivalent, LS-5367)
 */

import { expect, leagueTest as test } from '../fixtures/pages';
import {
  enableFootball,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/**
 * Mocks the createLeagueAndTeams mutation and resolves with the captured
 * variables so tests can assert on the submitted draft-settings input.
 */
async function mockCreateLeague(
  page: import('@playwright/test').Page,
  capturedInput: { current: Record<string, unknown> | null },
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const body = route.request().postData() ?? '';
    if (body.toLowerCase().includes('createleagueandteams')) {
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
                id: 888,
                name: 'Test Football League',
                owner: 1,
                maxRosterSize: 16,
                currentMatchup: null,
                draftStatus: 'not-started',
                numberOfTeams: 10,
                playerPool: 'all',
                draftMode: capturedInput.current?.draftMode ?? 'live',
                selectionMethod:
                  capturedInput.current?.selectionMethod ?? 'auction',
                draftOrder: capturedInput.current?.draftOrder ?? 'linear',
                pickTimeLimitSeconds:
                  capturedInput.current?.pickTimeLimitSeconds ?? null,
                isPublic: false,
                sport: 'football',
              },
            },
          },
        }),
      });
      return;
    }
    await unmockedGraphQLFallback(route);
  });
}

test.describe('League Creation — Football Draft Type & Settings @regression', () => {
  test.beforeEach(async ({ page }) => {
    await enableFootball(page);
  });

  // ─── Draft type selectors are present ──────────────────────────────────

  test('displays Selection Method and Draft Order options in the Draft Settings section', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('draft');

    await leaguePage.button('Standard').first().expectVisible();
    await leaguePage.button('Auction').expectVisible();
    await leaguePage.button('Snake', { exact: true }).expectVisible();
    await leaguePage.button('Linear', { exact: true }).expectVisible();
  });

  // ─── Choosing each draft type surfaces the right dependent controls ───

  test('selecting Auction reveals the auction budget and minimum bid inputs', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Auction');

    await leaguePage.text('Auction Budget per Team').expectVisible();
    await leaguePage.text('Minimum Bid').expectVisible();
    await leaguePage.placeholder('200').expectVisible();
    await leaguePage.placeholder('1').expectVisible();
  });

  test('selecting Standard hides the auction budget and minimum bid inputs', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Auction');
    await leaguePage.text('Auction Budget per Team').expectVisible();

    await leaguePage.clickButton('Standard', { exact: true });
    await leaguePage.text('Auction Budget per Team').expectHidden();
  });

  test('a live draft shows the pick timer control, defaulted to a selectable value', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Live Draft');

    // Pick timer only renders for live drafts.
    await leaguePage.button('2 min').expectVisible();
    await leaguePage.clickButton('2 min');
  });

  test('switching to Automated Draft hides the pick timer control', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Live Draft');
    await leaguePage.button('2 min').expectVisible();

    await leaguePage.clickButton('Automated Draft');
    await leaguePage.button('2 min').expectHidden();
  });

  // ─── Chosen draft type + settings persist through submission ──────────

  test('submitting with Auction + Snake persists selection method, draft order, and pick timer in the mutation input', async ({
    page,
    leaguePage,
  }) => {
    const captured: { current: Record<string, unknown> | null } = {
      current: null,
    };
    await mockCreateLeague(page, captured);

    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('Hermetic Football Draft League');

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Live Draft');
    await leaguePage.clickButton('Auction');
    await leaguePage.clickButton('Snake', { exact: true });
    await leaguePage.clickButton('2 min');
    await leaguePage.placeholder('200').fill('300');
    await leaguePage.placeholder('1').fill('5');

    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();

    await expect(page).toHaveURL(/\/football\/league\/\d+/);
    expect(captured.current?.sport).toBe('football');
    expect(captured.current?.selectionMethod).toBe('auction');
    expect(captured.current?.draftOrder).toBe('snake');
    expect(captured.current?.draftMode).toBe('live');
    expect(captured.current?.pickTimeLimitSeconds).toBe(120);
    expect(captured.current?.auctionBudget).toBe(300);
    expect(captured.current?.auctionMinBid).toBe(5);
  });

  test('submitting with Automated Draft persists Random selection method and no pick timer', async ({
    page,
    leaguePage,
  }) => {
    const captured: { current: Record<string, unknown> | null } = {
      current: null,
    };
    await mockCreateLeague(page, captured);

    await leaguePage.gotoCreate('football');
    await leaguePage.leagueNameInput.expectVisible();
    await leaguePage.fillLeagueName('Hermetic Automated Football League');

    await leaguePage.expandSection('draft');
    await leaguePage.clickButton('Automated Draft');
    await leaguePage.clickButton('Linear', { exact: true });

    await leaguePage.submitCreate();
    await leaguePage.continueToLeague();

    await expect(page).toHaveURL(/\/football\/league\/\d+/);
    expect(captured.current?.draftMode).toBe('automated');
    expect(captured.current?.selectionMethod).toBe('random');
    expect(captured.current?.draftOrder).toBe('linear');
  });
});
