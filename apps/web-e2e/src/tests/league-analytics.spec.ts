/**
 * Premium league analytics page — hermetic E2E coverage (LS-8459).
 *
 * The analytics dashboard at `/leagues/:leagueId/analytics` (shared
 * `AnalyticsScreen`, `GetLeagueAnalytics` query) sits behind the route-level
 * `PremiumGuard`, which redirects free users to `/pricing`. This suite covers:
 *   • free user → redirected to /pricing (the gate)                    [AC1]
 *   • premium user → dashboard renders with mocked data + headline
 *     sections across all three tabs                                   [AC2]
 *   • loading and GraphQL-error states                                 [AC3]
 *
 * Entitlement is driven by the `useTier` fixtures — premium is the baseline
 * default, `free` is a one-line switch (AC4). All backend responses are mocked
 * (`route.fulfill`), so no live backend is required.
 */

import { expect, test } from '../fixtures/pages';
import { leagueAnalyticsResponse } from '../mocks/graphql';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { useTier } from '../fixtures/shared-mocks';

const LEAGUE_ID = 1;

// ---------------------------------------------------------------------------
// AC1 — free user is gated: PremiumGuard redirects to /pricing
// ---------------------------------------------------------------------------

test.describe('League analytics – premium gate @regression', () => {
  test('free user is redirected to /pricing', async ({
    page,
    analyticsPage,
  }) => {
    // A free user never reaches the analytics screen — PremiumGuard sees a
    // non-premium GetUserById and redirects before AnalyticsScreen mounts, so
    // the GetLeagueAnalytics query never fires and needs no mock.
    await useTier(page, 'free');

    await analyticsPage.goto(LEAGUE_ID);

    await expect(page).toHaveURL(/\/pricing/);
    // The analytics dashboard never mounted.
    await analyticsPage.header.expectNotAttached();
  });
});

// ---------------------------------------------------------------------------
// AC2 — premium user sees the dashboard with mocked data + headline sections
// ---------------------------------------------------------------------------

test.describe('League analytics – premium render @regression', () => {
  test('premium user sees analytics with all headline sections', async ({
    page,
    analyticsPage,
  }) => {
    // Premium is the baseline entitlement (no useTier opt-in needed); mock only
    // the analytics query — everything else cascades to the shared baseline.
    await createGraphQLRouter(page, {
      getleagueanalytics: (route) =>
        fulfillJson(
          route,
          leagueAnalyticsResponse({ leagueName: 'Test League' }),
        ),
    });

    await analyticsPage.goto(LEAGUE_ID);

    // Header + Overview headline sections render from the mocked data.
    await analyticsPage.expectLoaded();
    await analyticsPage.headerFor('Test League').expectVisible();
    // Subtitle reflects the mocked currentWeek (10) and totalTeams (2).
    await analyticsPage.subtitle.expectContainsText('Week 10');
    await analyticsPage.subtitle.expectContainsText('2 Teams');

    // Power Rankings tab renders its headline section.
    await analyticsPage.selectPowerRankingsTab();
    await analyticsPage.expectPowerRankingsVisible();

    // Playoff Projections tab renders its headline section.
    await analyticsPage.selectPlayoffProjectionsTab();
    await analyticsPage.expectPlayoffProjectionsVisible();
  });
});

// ---------------------------------------------------------------------------
// AC3 — loading and GraphQL-error states
// ---------------------------------------------------------------------------

test.describe('League analytics – loading & error states @regression', () => {
  test('shows the loading state until analytics data resolves', async ({
    page,
    analyticsPage,
  }) => {
    // Hold the analytics response open so the `loading && !data` branch stays
    // rendered; release it deterministically (no timeout) and assert the
    // dashboard then loads.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await createGraphQLRouter(page, {
      getleagueanalytics: async (route) => {
        await gate;
        await fulfillJson(route, leagueAnalyticsResponse());
      },
    });

    await analyticsPage.goto(LEAGUE_ID);

    await analyticsPage.expectLoading();

    release();

    await analyticsPage.expectLoaded();
  });

  test('shows the error state when the analytics query fails', async ({
    page,
    analyticsPage,
  }) => {
    await createGraphQLRouter(page, {
      getleagueanalytics: (route) =>
        fulfillJson(route, {
          data: { getLeagueAnalytics: null },
          errors: [{ message: 'Analytics temporarily unavailable' }],
        }),
    });

    await analyticsPage.goto(LEAGUE_ID);

    await analyticsPage.expectErrorState(/Analytics temporarily unavailable/);
  });
});
