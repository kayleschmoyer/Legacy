/**
 * Football League Card Navigation — E2E Test (LS-5414)
 *
 * Feature: League Detail Navigation — tapping a league card on the Football
 * Home page (/football) navigates to /football/league/[leagueId]. GraphQL
 * responses are mocked hermetically via route.fulfill() so no live backend
 * is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { enableFootball } from '../fixtures/shared-mocks';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { mockLeague } from '../mocks/graphql/league.mocks';

const FOOTBALL_LEAGUE = mockLeague({
  id: 501,
  name: 'Gridiron Dynasty',
  draftStatus: 'completed',
  currentWeekNumber: 4,
});

test.describe('Football League Card Navigation (LS-5414) @regression', () => {
  test.beforeEach(async ({ page }) => {
    // /football/league/:id is behind the football_enabled GrowthBook gate
    // (FootballGate in app.tsx), which is unconfigured in CI — seed it so
    // the post-click navigation isn't bounced back to home.
    await enableFootball(page);

    await createGraphQLRouter(page, {
      getuserleagues: (route) =>
        fulfillJson(route, {
          data: { userLeagues: [FOOTBALL_LEAGUE], userLeagueCount: 1 },
        }),
    });
  });

  test('tapping a league card navigates to /football/league/[leagueId]', async ({
    page,
  }) => {
    await page.goto('/football');
    await page.waitForLoadState('load');

    const leagueRow = page.getByTestId(
      `football-league-row-${FOOTBALL_LEAGUE.id}`,
    );
    await expect(leagueRow).toBeVisible();
    await leagueRow.click();

    await expect(page).toHaveURL(
      new RegExp(`/football/league/${FOOTBALL_LEAGUE.id}$`),
    );
  });

  test('league card exposes an accessible "View {league name}" link', async ({
    page,
  }) => {
    await page.goto('/football');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('link', { name: `View ${FOOTBALL_LEAGUE.name}` }),
    ).toBeVisible();
  });
});
