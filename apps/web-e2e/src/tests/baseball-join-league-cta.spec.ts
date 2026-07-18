/**
 * E2E tests for the Join Baseball League CTA feature (LS-5338).
 *
 * Covers the "Join League" call-to-action on /baseball:
 *   - CTA is visible in both the with-leagues and empty-state hub layouts
 *   - Clicking the CTA navigates to the join-by-code page (/baseball/league/join)
 *   - The join-by-code page accepts an invite code and a team name
 *
 * All GraphQL responses are mocked via route.fulfill — no live backend required.
 *
 * Deep-link pre-fill, code validation states, error handling, and the full
 * submission flow are covered by join-league.spec.ts; this file focuses solely
 * on the CTA surface on the baseball home page.
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

async function mockBaseballHub(
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
              name: 'Sluggers United',
              draftStatus: 'completed',
            }),
            mockLeague({
              id: 2,
              name: 'Diamond Rivals',
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

test.describe('Join Baseball League CTA — hub with active leagues @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseballHub(page, { withLeagues: true });
    await page.goto('/baseball');
    await page.waitForLoadState('load');
  });

  test('Join League CTA is visible when user has active leagues', async ({
    page,
  }) => {
    // Active-leagues layout renders a compact "Join" button (not "Join League")
    // identified by its accessibilityLabel.
    const joinBtn = page.getByRole('button', {
      name: /join an existing baseball league/i,
    });
    await expect(joinBtn).toBeVisible();
  });

  test('Join League CTA is enabled when user has active leagues', async ({
    page,
  }) => {
    const joinBtn = page.getByRole('button', {
      name: /join an existing baseball league/i,
    });
    await expect(joinBtn).toBeVisible();
    await expect(joinBtn).toBeEnabled();
  });

  test('clicking Join League CTA navigates to /baseball/league/join', async ({
    page,
  }) => {
    const joinBtn = page.getByRole('button', {
      name: /join an existing baseball league/i,
    });

    await expect(joinBtn).toBeVisible();
    await joinBtn.click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/join');
  });
});

// ---------------------------------------------------------------------------
// CTA visibility — authenticated user with no leagues (empty state)
// ---------------------------------------------------------------------------

test.describe('Join Baseball League CTA — hub empty state @critical', () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseballHub(page, { withLeagues: false });
    await page.goto('/baseball');
    await page.waitForLoadState('load');
  });

  test('Join League CTA is visible in the empty-state layout', async ({
    page,
  }) => {
    await expect(page.getByText('Join League').first()).toBeVisible();
  });

  test('clicking Join League CTA in empty state navigates to /baseball/league/join', async ({
    page,
  }) => {
    const joinBtn = page.getByRole('button', { name: /join league/i }).first();
    const joinText = page.getByText('Join League').first();
    const cta = joinBtn.or(joinText).first();

    await expect(cta).toBeVisible();
    await cta.click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/join');
  });
});

// ---------------------------------------------------------------------------
// Join form — accepts invite code and team name (AC3)
// ---------------------------------------------------------------------------

test.describe('Join Baseball League CTA — join form accepts invite code input @critical', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball/league/join');
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
// End-to-end CTA flow: /baseball → join form → successful join
// ---------------------------------------------------------------------------

test.describe('Join Baseball League CTA — end-to-end flow @regression', () => {
  test('navigates from /baseball to join form and completes join', async ({
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
            leagueName: 'Alpha League',
            totalSpots: 12,
            availableSpots: 5,
          }),
        );
        return;
      }
      if (op === 'joinleaguebycode') {
        await fulfillJson(route, joinLeagueByCodeResponse(101));
        return;
      }

      await route.fallback();
    });

    // 1. Start on the baseball hub
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    // 2. Click the Join League CTA (active-leagues layout renders "Join" button)
    await page
      .getByRole('button', { name: /join an existing baseball league/i })
      .click();

    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/join');

    // 3. Fill invite code (triggers validation query automatically at 8 chars)
    const codeInput = page
      .locator('#invite-code')
      .or(page.getByPlaceholder(/invite code|enter.*code/i).first());
    await codeInput.fill('ALPHA001');

    // 4. Fill team name
    const teamInput = page.getByPlaceholder(/team name/i).first();
    await teamInput.fill('My Baseball Team');

    // 5. Wait for validation to resolve and join button to become enabled
    const joinButton = page.getByRole('button', { name: /join league/i });
    await expect(joinButton).toBeEnabled({ timeout: 10_000 });

    // 6. Submit
    await joinButton.click();

    // 7. Assert redirect to the joined league's detail page
    await expect(page).toHaveURL(/\/baseball\/league\/101/, {
      timeout: 15_000,
    });
  });
});
