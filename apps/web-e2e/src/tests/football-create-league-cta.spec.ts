/**
 * E2E tests for the Create Football League CTA feature (LS-5408).
 *
 * Covers the "Create League" call-to-action on /football:
 *   - CTA is visible and enabled in both the with-leagues and empty-state
 *     hub layouts
 *   - Clicking the CTA navigates to the league creation flow
 *     (/football/league/create)
 *
 * All GraphQL responses are mocked via route.fulfill — no live backend required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { mockLeague } from '../mocks/graphql/league.mocks';
import {
  fulfillJson,
  isGraphQLEndpoint,
  parseGraphQLRequest,
} from '../mocks/graphql/router';

const FOOTBALL_CREATE_URL = '/football/league/create';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockFootballHub(
  page: import('@playwright/test').Page,
  options: { withLeagues?: boolean } = {},
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const { op } = parseGraphQLRequest(route);

    if (op === 'getuserleagues') {
      const leagues = options.withLeagues
        ? [
            mockLeague({
              id: 1,
              name: 'Gridiron Legends',
              draftStatus: 'completed',
            }),
            mockLeague({
              id: 2,
              name: 'Turf Wars',
              draftStatus: 'not-started',
            }),
          ]
        : [];
      await fulfillJson(route, {
        data: { userLeagues: leagues, userLeagueCount: leagues.length },
      });
      return;
    }

    await route.fallback();
  });
}

// ---------------------------------------------------------------------------
// CTA visibility and navigation — authenticated user with active leagues
// ---------------------------------------------------------------------------

test.describe('Create Football League CTA — hub with active leagues @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballHub(page, { withLeagues: true });
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('Create League CTA is visible when user has active leagues', async ({
    page,
  }) => {
    const createBtn = page.getByRole('button', {
      name: /create a new football league/i,
    });
    await expect(createBtn).toBeVisible();
  });

  test('Create League CTA is enabled when user has active leagues', async ({
    page,
  }) => {
    const createBtn = page.getByRole('button', {
      name: /create a new football league/i,
    });
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toBeEnabled();
  });

  test('clicking Create League CTA navigates to /football/league/create', async ({
    page,
  }) => {
    const createBtn = page.getByRole('button', {
      name: /create a new football league/i,
    });

    await expect(createBtn).toBeVisible();
    await createBtn.click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL(FOOTBALL_CREATE_URL);
  });
});

// ---------------------------------------------------------------------------
// CTA visibility and navigation — authenticated user with no leagues (empty state)
// ---------------------------------------------------------------------------

test.describe('Create Football League CTA — hub empty state @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballHub(page, { withLeagues: false });
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('Create League CTA is visible in the empty-state layout', async ({
    page,
  }) => {
    const createBtn = page.getByRole('button', {
      name: /create your first football league/i,
    });
    await expect(createBtn).toBeVisible();
  });

  test('clicking Create League CTA in empty state navigates to /football/league/create', async ({
    page,
  }) => {
    const createBtn = page.getByRole('button', {
      name: /create your first football league/i,
    });

    await expect(createBtn).toBeVisible();
    await createBtn.click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL(FOOTBALL_CREATE_URL);
  });
});
