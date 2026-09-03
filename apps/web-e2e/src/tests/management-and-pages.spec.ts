/**
 * Management Page UI Tests
 *
 * Covers the League Management page (/management).
 * Includes static UI, confirmation dialog flows, and mocked delete mutation.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { userLeaguesResponse } from '../mocks/graphql';
import { createGraphQLRouter, fulfillJson } from '../mocks/graphql/router';
import { DESKTOP_VIEWPORT } from '../utils/viewport';

/** URL predicate for the GraphQL API endpoint */

test.describe('Management Page — static elements @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/management');
    await page.waitForLoadState('load');
    // Wait for page to fully render with auth — H3 heading confirms React has hydrated
    await expect(
      page.getByRole('heading', { name: /league management/i }),
    ).toBeVisible();
  });

  test('loads the management page without errors', async ({ page }) => {
    await expect(page).toHaveURL('/management');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows League Management heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /league management/i }),
    ).toBeVisible();
  });

  test('shows Danger Zone section', async ({ page }) => {
    // Tamagui H4 inside Card renders as <p>, not <h4> — use getByText
    await expect(page.getByText('Danger Zone', { exact: true })).toBeVisible();
  });

  test('shows Delete Selected button, disabled until a league is checked', async ({
    page,
  }) => {
    const deleteButton = page.getByRole('button', {
      name: /delete selected/i,
    });
    await expect(deleteButton).toBeVisible();
    await expect(deleteButton).toBeDisabled();
  });

  test('shows Information card explaining what gets deleted', async ({
    page,
  }) => {
    // Tamagui H4 inside Card renders as <p>, not <h4> — use getByText (same as
    // LS-1174 fix for preferences/profile-settings)
    await expect(page.getByText('Information', { exact: true })).toBeVisible();
    await expect(page.getByText(/what gets deleted/i)).toBeVisible();
  });

  test('shows the ownership warning for the admin fixture user', async ({
    page,
  }) => {
    // The default auth fixture (fixtures/auth.ts) authenticates as an admin
    // (accessLevel: 'admin'), so the admin copy is what renders — a non-admin
    // sees "You can only select and delete leagues you own." instead.
    await expect(
      page.getByText(/as an admin, you can select any league to delete/i),
    ).toBeVisible();
  });
});

test.describe('Management Page — selection delete dialogs @regression', () => {
  test.beforeEach(async ({ page }) => {
    // auth-enhanced's own baseline returns an empty userLeagues list (there's
    // nothing to select then), so override it with one league to exercise
    // the selection UI — matching what fixtures/auth.ts (used by other
    // management specs) does for the authenticated case.
    await createGraphQLRouter(page, {
      getuserleagues: (route) => fulfillJson(route, userLeaguesResponse()),
    });

    await page.goto('/management');
    await page.waitForLoadState('load');
    // Select the fixture's one league so Delete Selected is enabled — every
    // test below opens the confirmation flow from that selected state.
    const leagueCheckbox = page.getByRole('checkbox', {
      name: /select test league for deletion/i,
    });
    await expect(leagueCheckbox).toBeVisible();
    await leagueCheckbox.click();
    await expect(
      page.getByRole('button', { name: /delete selected/i }),
    ).toBeEnabled();
  });

  test('clicking Delete Selected opens the first confirmation dialog', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete selected/i }).click();

    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText(/are you sure\?/i)).toBeVisible();
  });

  test('first confirmation dialog names the selected league', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete selected/i }).click();

    const dialog = page.locator('div[role="alertdialog"]');
    await expect(dialog).toBeVisible();

    // Dialog body quotes the actual selected league name, not blanket copy
    await expect(dialog.getByText('Test League')).toBeVisible();
    // First dialog confirms it's step 1 of 2
    await expect(dialog.getByText(/first of two confirmations/i)).toBeVisible();
  });

  test('canceling from the first dialog closes it', async ({ page }) => {
    await page.getByRole('button', { name: /delete selected/i }).click();

    const dialog = page.locator('div[role="alertdialog"]');
    await expect(dialog).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('clicking Continue opens the final confirmation dialog', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete selected/i }).click();

    const firstDialog = page.locator('div[role="alertdialog"]');
    await expect(firstDialog).toBeVisible();

    await firstDialog.getByRole('button', { name: /continue/i }).click();

    // Final confirmation dialog should now be visible
    await expect(page.locator('div[role="alertdialog"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /this cannot be undone/i }),
    ).toBeVisible();
    await expect(page.getByText(/permanently removed/i)).toBeVisible();
  });

  test('canceling from the final confirmation dialog closes it', async ({
    page,
  }) => {
    // Open first dialog
    await page.getByRole('button', { name: /delete selected/i }).click();
    const firstDialog = page.locator('div[role="alertdialog"]');
    await expect(firstDialog).toBeVisible();

    // Advance to second dialog
    await firstDialog.getByRole('button', { name: /continue/i }).click();
    await expect(
      page.getByRole('heading', { name: /this cannot be undone/i }),
    ).toBeVisible();

    const finalDialog = page.locator('div[role="alertdialog"]');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(finalDialog).not.toBeVisible();
  });

  test('completing both dialogs calls the deleteLeague mutation for the selected league only', async ({
    page,
  }) => {
    let mutationCalled = false;
    let calledWithLeagueId: number | undefined;

    // Exact operationName match (not a substring check) so this can't
    // false-positive on an unrelated operation whose body happens to
    // contain "deleteleague" — e.g. a `deleteAllLeagues` payload. Unhandled
    // operations (getuserleagues included) fall through to the beforeEach's
    // router.
    await createGraphQLRouter(page, {
      deleteleague: (route, { variables }) => {
        mutationCalled = true;
        calledWithLeagueId = variables.leagueId as number | undefined;
        return fulfillJson(route, {
          data: { deleteLeague: 'League deleted successfully' },
        });
      },
    });

    // Step 1: click delete button (league already selected in beforeEach)
    await page.getByRole('button', { name: /delete selected/i }).click();

    // Step 2: confirm in first dialog
    const firstDialog = page.locator('div[role="alertdialog"]');
    await expect(firstDialog).toBeVisible();
    await firstDialog.getByRole('button', { name: /continue/i }).click();

    // Step 3: confirm in final dialog
    await expect(
      page.getByRole('heading', { name: /this cannot be undone/i }),
    ).toBeVisible();

    const finalDialog = page.locator('div[role="alertdialog"]');
    await finalDialog
      .getByRole('button', { name: /yes, delete selected/i })
      .click();

    // Mutation should have been called for exactly the selected league (id 1
    // from the default fixture), not a blanket deleteAllLeagues call
    await expect.poll(() => mutationCalled).toBe(true);
    expect(calledWithLeagueId).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Players Page (/players)
// ---------------------------------------------------------------------------

test.describe('Players Landing Page @smoke', () => {
  test('loads the players page', async ({ page }) => {
    await page.goto('/players');
    await page.waitForLoadState('load');

    await expect(page).toHaveURL('/players');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ---------------------------------------------------------------------------
// Player Comparison Page (/players/compare)
// ---------------------------------------------------------------------------

test.describe('Player Comparison Page @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/players/compare');
    await page.waitForLoadState('load');
  });

  test('loads the player comparison page', async ({ page }) => {
    await expect(page).toHaveURL('/players/compare');
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('shows a player search input', async ({ page }) => {
    await expect(
      page.getByRole('combobox', { name: /search players/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Player Stats Page (/players/stats)
// ---------------------------------------------------------------------------

/**
 * Addressed at the desktop data grid — the "MLB Player Statistics" title, the
 * `Search player name · min 2 chars` input, and the Share/Export actions.
 * LS-9075 replaced that grid with `PlayersCardFeed` below `media.sm`, which
 * renders a fixed "Players" heading, its own search field and a chip rail, and
 * has no Share/Export equivalent — so there is no locator that resolves both.
 * Pinned rather than skipped: the assertions still run under the mobile
 * projects, just at the width they were written for (LS-9712).
 */
test.describe('Player Stats Page — static elements @smoke', () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/players/stats');
    await page.waitForLoadState('load');
  });

  test('shows the MLB Player Statistics heading', async ({ page }) => {
    // Title is rendered as a styled <Text> (not a semantic heading element)
    await expect(page.getByText(/player statistics/i)).toBeVisible();
  });

  test('shows the player search input', async ({ page, isMobile }) => {
    await expect(
      page.getByPlaceholder('Search player name · min 2 chars'),
    ).toBeVisible();
  });

  test('shows Share and Export action buttons', async ({ page, isMobile }) => {
    await expect(
      page.getByRole('button', { name: /share/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /export/i }).first(),
    ).toBeVisible();
  });

  test('search input accepts text', async ({ page, isMobile }) => {
    const input = page.getByPlaceholder('Search player name · min 2 chars');
    await expect(input).toBeVisible();
    await input.fill('Trout');
    await expect(input).toHaveValue('Trout');
  });

  test('search input can be cleared', async ({ page, isMobile }) => {
    const input = page.getByPlaceholder('Search player name · min 2 chars');
    await expect(input).toBeVisible();
    await input.fill('Aaron');
    await input.clear();
    await expect(input).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// 404 / Not Found — unknown routes
// ---------------------------------------------------------------------------

test.describe('Unknown Routes @regression', () => {
  test('navigating to an unknown route does not crash the app', async ({
    page,
  }) => {
    await page.goto('/this-route-does-not-exist');
    await page.waitForLoadState('load');

    // The app should still render its shell (header etc.) without a JS crash.
    // Both assertions are deliberately viewport-agnostic so this keeps running
    // at phone width: the `banner` landmark and the Help & support control are
    // rendered by the desktop `NavContent` and the mobile header alike. The
    // previous `header-logo` check was desktop-only chrome and could never pass
    // at 375px, which is why this test had been skipped there (LS-9712).
    const banner = page.getByRole('banner');
    await expect(banner).toBeVisible();
    await expect(
      banner.getByRole('button', { name: /help & support/i }),
    ).toBeVisible();
  });
});
