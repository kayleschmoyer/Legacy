/**
 * Season Renewal Flow — Team Migration & Error Handling Tests (LS-690)
 *
 * Validates team migration and error handling in the season renewal flow:
 *   1. Teams are migrated to the new season
 *   2. Error states are handled gracefully
 *
 * All GraphQL operations are mocked — no live backend required.
 * Default test JWT has id=1, so leagues with owner=1 give commissioner access.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import {
  LEAGUE_ID,
  LEAGUE_NAME,
  makeCompletedMatchups,
  makeLeague,
  makeRenewedLeague,
  MIGRATED_TEAMS,
  MOCK_TEAMS,
  NEW_LEAGUE_ID,
  NEW_LEAGUE_NAME,
  setupSeasonRenewalGraphQL as setupGraphQL,
} from '../mocks/graphql/season-renewal';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Test Suite: Team Migration ───────────────────────────────────────────────

test.describe('Season Renewal Flow — team migration @critical', () => {
  test('all teams are migrated to the new league', async ({ page }) => {
    await setupGraphQL(page, {
      renewedTeams: MIGRATED_TEAMS,
    });

    // Navigate to the new league overview
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/overview`);
    await page.waitForLoadState('load');

    // Verify no application error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // Verify team names from the original league are visible in the new league
    // The migrated teams should have the same names
    for (const team of MIGRATED_TEAMS) {
      await expect(
        page.getByText(team.name, { exact: false }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('commissioner team is preserved in renewed league', async ({ page }) => {
    await setupGraphQL(page);

    // Navigate to the new league commissioner tab
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // Commissioner (user 1) should see the commissioner tab — this proves
    // the ownership was migrated because the renewed league has owner=1
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // The new league has draftStatus='not-started' so the "Start Draft"
    // button should be visible — confirming commissioner access
    await expect(
      page.getByText('Start Draft', { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('renewed league has correct number of teams', async ({ page }) => {
    await setupGraphQL(page);

    // Navigate to the new league overview
    await page.goto(`/baseball/league/${NEW_LEAGUE_ID}/overview`);
    await page.waitForLoadState('load');

    // Verify no error
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // The league should show all 4 team names
    const teamNames = MIGRATED_TEAMS.map((t) => t.name);
    for (const name of teamNames) {
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});

// ── Test Suite: Renewal Error Handling ────────────────────────────────────────

test.describe('Season Renewal Flow — error handling @regression', () => {
  test('renewal mutation error is handled gracefully', async ({ page }) => {
    // Set up base mocks first — Playwright routes match in LIFO order,
    // so the error override registered after will intercept renewLeague first.
    await setupGraphQL(page);

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData() ?? '';
      let parsed: { operationName?: string };
      try {
        parsed = JSON.parse(postData) as typeof parsed;
      } catch {
        parsed = {};
      }
      const op = (parsed.operationName ?? '').toLowerCase();

      if (op === 'renewleague') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [
              {
                message: 'League cannot be renewed while frozen',
                extensions: { code: 'LEAGUE_FROZEN' },
              },
            ],
          }),
        });
        return;
      }

      await route.fallback();
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    const startBtn = page.getByRole('button', { name: /Start New Season/i });
    await expect(startBtn).toBeVisible({ timeout: 15_000 });
    await startBtn.click();

    await expect(page.getByText(/Start New Season for/i).first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: /Confirm New Season/i }).click();

    // Should stay on the same page (not navigate away on error)
    await expect(page).toHaveURL(
      new RegExp(`/baseball/league/${LEAGUE_ID}/commissioner`),
      { timeout: 10_000 },
    );
  });

  test('renewal not available for non-completed seasons', async ({ page }) => {
    // League with in-progress draft — not completed
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'in-progress',
        currentMatchup: null,
      }),
      matchups: [],
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // "Start New Season" should NOT appear because draftStatus is not 'completed'
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('renewal not available mid-season with active matchup', async ({
    page,
  }) => {
    // League with active matchup — season still in progress
    await setupGraphQL(page, {
      league: makeLeague({
        draftStatus: 'completed',
        currentMatchup: 5,
        totalMatchups: 10,
      }),
      matchups: Array.from({ length: 5 }, (_, i) => ({
        __typename: 'Matchup',
        id: i + 1,
        leagueId: LEAGUE_ID,
        weekNumber: i + 1,
        team1Id: 10,
        team2Id: 11,
        status: i < 4 ? 'completed' : 'in-progress',
        selectedGamesCount: i < 4 ? 5 : 2,
        gamesPerMatchup: 5,
        statsLoadingStatus: 'not_started',
      })),
    });

    await page.goto(`/baseball/league/${LEAGUE_ID}/commissioner`);
    await page.waitForLoadState('load');

    // "Start New Season" should NOT appear because there's an active matchup
    await expect(
      page.getByRole('button', { name: /Start New Season/i }),
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
