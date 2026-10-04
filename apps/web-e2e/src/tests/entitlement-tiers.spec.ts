/**
 * Entitlement-tier fixtures — E2E coverage (LS-8056)
 *
 * Validates the tiered entitlement fixture API in `fixtures/shared-mocks.ts`:
 *   - PREMIUM is the default — a spec gets a premium user with no opt-in.
 *   - `useTier(page, 'free')`  → free user, hits the premium gate.
 *   - `useTier(page, 'admin')` → admin role, treated as premium AND can reach
 *                                the /admin console.
 *
 * Each tier switch is a single line before `page.goto()`. All entitlement state
 * is reflected in the mocked `GetUserById` GraphQL response (the same source the
 * app reads via `useIsPremium()` / AdminPage), so no live backend is required.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { extractOperationName, useTier } from '../fixtures/shared-mocks';
import { leagueByIdResponse } from '../mocks/graphql/league.mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ---------------------------------------------------------------------------
// PREMIUM by default — no useTier() call needed
// ---------------------------------------------------------------------------

test.describe('Entitlement tiers – premium is the default @regression', () => {
  test('a spec with no tier opt-in sees ungated premium content', async ({
    page,
  }) => {
    await page.goto('/baseball/league/1');
    await page.waitForLoadState('load');

    // Premium user → the league detail screen renders without the gate overlay.
    await expect(page.getByTestId('premium-feature-gate')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// FREE — one-line switch via useTier(page, 'free')
// ---------------------------------------------------------------------------

test.describe('Entitlement tiers – free via useTier @regression', () => {
  test('useTier("free") surfaces the premium gate', async ({ page }) => {
    // A league's creator keeps access after downgrading (LS-10427), so the
    // page-level gate only applies to non-creator members. The default mocked
    // league is owned by the signed-in user (id 1) — make someone else own it.
    await page.route(isGraphQLEndpoint, async (route) => {
      if (extractOperationName(route) === 'GetLeagueById') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(leagueByIdResponse({ owner: 2 })),
        });
        return;
      }
      await route.fallback();
    });
    await useTier(page, 'free');
    await page.goto('/baseball/league/1');
    await page.waitForLoadState('load');

    await expect(page.getByText(/premium feature/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ADMIN — one-line switch via useTier(page, 'admin')
// ---------------------------------------------------------------------------

test.describe('Entitlement tiers – admin via useTier @regression', () => {
  test('useTier("admin") is treated as premium on gated screens', async ({
    page,
  }) => {
    await useTier(page, 'admin');
    await page.goto('/baseball/league/1');
    await page.waitForLoadState('load');

    // Admins are always treated as premium (useIsPremium.ts), so the gate is
    // absent just like for a premium user.
    await expect(page.getByTestId('premium-feature-gate')).not.toBeVisible();
  });

  test('useTier("admin") unlocks the /admin console', async ({ page }) => {
    // AdminPage gates the console on the server-trusted GetUserById.accessLevel,
    // and (when the JWT identity is admin) fires the user-count / recent-users
    // queries — mock those so the hermetic API-isolation fixture stays happy.
    await page.route(isGraphQLEndpoint, async (route) => {
      const op = extractOperationName(route).toLowerCase();
      if (op === 'getuserscount') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { usersCount: 0 } }),
        });
        return;
      }
      if (op === 'getallusers') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { users: [] } }),
        });
        return;
      }
      await route.fallback();
    });
    await useTier(page, 'admin');
    await page.goto('/admin');
    await page.waitForLoadState('load');

    await expect(
      page.getByRole('heading', { name: /admin console/i }),
    ).toBeVisible();
  });
});
