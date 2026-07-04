/**
 * Active Baseball Leagues List — E2E Tests (LS-5332)
 *
 * Covers the "Your Leagues" section on the Baseball Home page (/baseball).
 * GraphQL responses are mocked hermetically via route.fulfill() so no live
 * backend is required.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';

const MOCK_LEAGUES = [
  {
    __typename: 'League',
    id: 101,
    name: 'Pre-Draft Warriors',
    draftStatus: 'queued',
    currentWeekNumber: null,
    weekAdvanceStatus: null,
    maxRosterSize: 25,
  },
  {
    __typename: 'League',
    id: 102,
    name: 'Mid-Draft Rockets',
    draftStatus: 'in-progress',
    currentWeekNumber: null,
    weekAdvanceStatus: null,
    maxRosterSize: 23,
  },
  {
    __typename: 'League',
    id: 103,
    name: 'Active Sluggers',
    draftStatus: 'completed',
    currentWeekNumber: 7,
    weekAdvanceStatus: null,
    maxRosterSize: 26,
  },
];

async function mockUserLeagues(
  page: import('@playwright/test').Page,
  leagues: typeof MOCK_LEAGUES | [],
) {
  await createGraphQLRouter(page, {
    getmyleagues: (route) =>
      fulfillJson(route, { data: { myLeagues: leagues } }),
  });
}

test.describe('Active Baseball Leagues List (LS-5332) @regression', () => {
  test('"Your Leagues" heading is visible on the baseball home page', async ({
    page,
  }) => {
    await mockUserLeagues(page, []);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /your leagues/i }),
    ).toBeVisible();
  });

  test('league cards are rendered for each mocked user league', async ({
    page,
  }) => {
    await mockUserLeagues(page, MOCK_LEAGUES);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Pre-Draft Warriors')).toBeVisible();
    await expect(grid.getByText('Mid-Draft Rockets')).toBeVisible();
    await expect(grid.getByText('Active Sluggers')).toBeVisible();
  });

  test('"Draft Scheduled" badge appears for a pre-draft league', async ({
    page,
  }) => {
    await mockUserLeagues(page, [MOCK_LEAGUES[0]]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Draft Scheduled')).toBeVisible();
  });

  test('"Drafting" badge appears for a league in the draft phase', async ({
    page,
  }) => {
    await mockUserLeagues(page, [MOCK_LEAGUES[1]]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Drafting')).toBeVisible();
  });

  test('"Week N" badge appears for an active in-season league', async ({
    page,
  }) => {
    await mockUserLeagues(page, [MOCK_LEAGUES[2]]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Week 7')).toBeVisible();
  });

  test('search field filters the league list by name', async ({ page }) => {
    await mockUserLeagues(page, MOCK_LEAGUES);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const search = page.getByPlaceholder(/search leagues/i);
    await expect(search).toBeVisible();
    await search.fill('Sluggers');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Active Sluggers')).toBeVisible();
    await expect(grid.getByText('Pre-Draft Warriors')).not.toBeVisible();
    await expect(grid.getByText('Mid-Draft Rockets')).not.toBeVisible();
  });

  test('clicking "View" on a league card navigates to the league detail page', async ({
    page,
  }) => {
    await mockUserLeagues(page, [MOCK_LEAGUES[2]]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await page
      .getByRole('link', { name: /view active sluggers/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/baseball\/league\/103/);
  });

  test('empty state "No baseball leagues yet" is shown when the user has no leagues', async ({
    page,
  }) => {
    await mockUserLeagues(page, []);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page.getByText('No baseball leagues yet')).toBeVisible();
  });

  test('"In Season" badge appears for a completed league with no week number', async ({
    page,
  }) => {
    const league = {
      __typename: 'League',
      id: 104,
      name: 'Season League',
      draftStatus: 'completed',
      currentWeekNumber: null,
      weekAdvanceStatus: null,
      maxRosterSize: 25,
    };
    await mockUserLeagues(page, [league]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('In Season')).toBeVisible();
  });

  test('title-cased badge appears for an unknown draftStatus value', async ({
    page,
  }) => {
    const league = {
      __typename: 'League',
      id: 105,
      name: 'Mystery League',
      draftStatus: 'custom-status',
      currentWeekNumber: null,
      weekAdvanceStatus: null,
      maxRosterSize: 25,
    };
    await mockUserLeagues(page, [league]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Custom Status')).toBeVisible();
  });

  test('"Advancing" badge appears when weekAdvanceStatus is processing', async ({
    page,
  }) => {
    const league = {
      ...MOCK_LEAGUES[2],
      weekAdvanceStatus: 'processing',
    };
    await mockUserLeagues(page, [league]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Advancing')).toBeVisible();
  });

  test('"Advancing" badge appears when weekAdvanceStatus is queued', async ({
    page,
  }) => {
    const league = {
      ...MOCK_LEAGUES[2],
      weekAdvanceStatus: 'queued',
    };
    await mockUserLeagues(page, [league]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Advancing')).toBeVisible();
  });

  test('"Advance failed" badge appears when weekAdvanceStatus is failed', async ({
    page,
  }) => {
    const league = {
      ...MOCK_LEAGUES[2],
      weekAdvanceStatus: 'failed',
    };
    await mockUserLeagues(page, [league]);
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    const grid = page.getByTestId('leagues-grid');
    await expect(grid.getByText('Advance failed')).toBeVisible();
  });

  test('error notice is shown when the GraphQL query returns errors', async ({
    page,
  }) => {
    await createGraphQLRouter(page, {
      getmyleagues: (route) =>
        fulfillJson(route, {
          errors: [{ message: 'Internal server error' }],
          data: { myLeagues: null },
        }),
    });
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    await expect(page.getByText(/Could not load your leagues/i)).toBeVisible();
  });
});

unauthTest.describe(
  'Active Baseball Leagues List — unauthenticated (LS-5332)',
  () => {
    unauthTest(
      'sign-in notice is shown when the user is not authenticated',
      async ({ page }) => {
        await page.goto('/baseball');
        await page.waitForLoadState('load');

        await expect(
          page.getByText(/Sign in to manage your fantasy baseball leagues/i),
        ).toBeVisible();
      },
    );
  },
);
