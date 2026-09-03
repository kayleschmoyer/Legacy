/**
 * E2E tests for the Join Football League CTA feature (LS-5413).
 *
 * Covers the "Join League" call-to-action on /football:
 *   - CTA is visible in both the with-leagues and empty-state hub layouts
 *   - Clicking the CTA navigates to the join-by-code page (/football/league/join)
 *   - The join-by-code page accepts an invite code and a team name
 *
 * All GraphQL responses are mocked via route.fulfill — no live backend required.
 *
 * Mirrors baseball-join-league-cta.spec.ts (LS-5338); NFLHome renders a single
 * "Join League" hero button in both the with-leagues and empty-state layouts
 * (unlike MLBHome's separate compact "Join" button), so this file has one
 * fewer CTA-label variant to cover than its baseball counterpart.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { myLeaguesResponse } from '../mocks/graphql';
import {
  joinLeagueByCodeResponse,
  mockLeague,
  validateInviteCodeResponse,
} from '../mocks/graphql/league.mocks';
import {
  fulfillJson,
  isGraphQLEndpoint,
  parseGraphQLRequest,
} from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockFootballHub(
  page: import('@playwright/test').Page,
  options: { withLeagues?: boolean } = {},
) {
  await page.route(isGraphQLEndpoint, async (route) => {
    const { op } = parseGraphQLRequest(route);

    if (op === 'getmyleagues') {
      const leagues = options.withLeagues
        ? [
            mockLeague({
              id: 1,
              name: 'Gridiron Giants',
              sport: 'football',
              draftStatus: 'completed',
            }),
            mockLeague({
              id: 2,
              name: 'End Zone Elite',
              sport: 'football',
              draftStatus: 'not-started',
            }),
          ]
        : [];
      await fulfillJson(route, myLeaguesResponse(leagues));
      return;
    }

    await route.fallback();
  });
}

// ---------------------------------------------------------------------------
// CTA visibility — authenticated user with leagues
// ---------------------------------------------------------------------------

test.describe('Join Football League CTA — hub with active leagues @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballHub(page, { withLeagues: true });
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('Join League CTA is visible when user has active leagues', async ({
    page,
  }) => {
    const joinBtn = page.getByRole('button', {
      name: /join a football league/i,
    });
    await expect(joinBtn).toBeVisible();
  });

  test('Join League CTA is enabled when user has active leagues', async ({
    page,
  }) => {
    const joinBtn = page.getByRole('button', {
      name: /join a football league/i,
    });
    await expect(joinBtn).toBeVisible();
    await expect(joinBtn).toBeEnabled();
  });

  test('clicking Join League CTA navigates to /football/league/join', async ({
    page,
  }) => {
    const joinBtn = page.getByRole('button', {
      name: /join a football league/i,
    });

    await expect(joinBtn).toBeVisible();
    await joinBtn.click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football/league/join');
  });
});

// ---------------------------------------------------------------------------
// CTA visibility — authenticated user with no leagues (empty state)
// ---------------------------------------------------------------------------

test.describe('Join Football League CTA — hub empty state @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockFootballHub(page, { withLeagues: false });
    await page.goto('/football');
    await page.waitForLoadState('load');
  });

  test('Join League CTA is visible in the empty-state layout', async ({
    page,
  }) => {
    await expect(
      page.getByRole('button', { name: /join a football league/i }),
    ).toBeVisible();
  });

  test('clicking Join League CTA in empty state navigates to /football/league/join', async ({
    page,
  }) => {
    const joinBtn = page.getByTestId('join-league-button');

    await expect(joinBtn).toBeVisible();
    await joinBtn.click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football/league/join');
  });
});

// ---------------------------------------------------------------------------
// Join form — accepts invite code and team name (AC3)
// ---------------------------------------------------------------------------

test.describe('Join Football League CTA — join form accepts invite code input @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/football/league/join');
    await page.waitForLoadState('load');
  });

  test('join form shows invite code input', async ({ page }) => {
    await expect(
      page
        .locator('#invite-code')
        .or(page.getByPlaceholder(/invite code|enter.*code/i).first()),
    ).toBeVisible();
  });

  test('join form shows team name input', async ({ page }) => {
    await expect(page.getByPlaceholder(/team name/i).first()).toBeVisible();
  });

  test('invite code input accepts and uppercases text', async ({ page }) => {
    const codeInput = page
      .locator('#invite-code')
      .or(page.getByPlaceholder(/invite code|enter.*code/i).first());
    await expect(codeInput).toBeVisible();

    await codeInput.fill('abcd1234');
    await expect(codeInput).toHaveValue('ABCD1234');
  });

  test('join button is disabled until both fields are filled', async ({
    page,
  }) => {
    const joinButton = page.getByRole('button', { name: /join league/i });
    await expect(joinButton).toBeVisible();
    await expect(joinButton).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// End-to-end CTA flow: /football → join form → successful join
// ---------------------------------------------------------------------------

test.describe('Join Football League CTA — end-to-end flow @regression', () => {
  test('navigates from /football to join form and completes join', async ({
    page,
  }) => {
    // Mock all GraphQL needed for this flow
    await page.route(isGraphQLEndpoint, async (route) => {
      const { op } = parseGraphQLRequest(route);

      if (op === 'getmyleagues') {
        await fulfillJson(route, myLeaguesResponse());
        return;
      }
      if (op === 'validateinvitecode') {
        await fulfillJson(
          route,
          validateInviteCodeResponse({
            leagueName: 'Alpha Gridiron League',
            totalSpots: 12,
            availableSpots: 5,
          }),
        );
        return;
      }
      if (op === 'joinleaguebycode') {
        await fulfillJson(route, joinLeagueByCodeResponse(202));
        return;
      }

      await route.fallback();
    });

    // 1. Start on the football hub
    await page.goto('/football');
    await page.waitForLoadState('load');

    // 2. Click the Join League CTA
    await page.getByRole('button', { name: /join a football league/i }).click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/football/league/join');

    // 3. Fill invite code (triggers validation query automatically at 8 chars)
    const codeInput = page
      .locator('#invite-code')
      .or(page.getByPlaceholder(/invite code|enter.*code/i).first());
    await codeInput.fill('GRID2001');

    // 4. Fill team name
    const teamInput = page.getByPlaceholder(/team name/i).first();
    await teamInput.fill('My Football Team');

    // 5. Wait for validation to resolve and join button to become enabled
    const joinButton = page.getByRole('button', { name: /join league/i });
    await expect(joinButton).toBeEnabled({ timeout: 10_000 });

    // 6. Submit
    await joinButton.click();

    // 7. Assert redirect to the joined league's detail page, under /football
    await expect(page).toHaveURL(/\/football\/league\/202/, {
      timeout: 15_000,
    });
  });
});
