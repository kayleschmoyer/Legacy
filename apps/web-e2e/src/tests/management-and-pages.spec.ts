/**
 * Management Page UI Tests
 *
 * Covers the League Management page (/management).
 * Includes static UI, confirmation dialog flows, and mocked delete mutation.
 */

import { expect, test } from '../fixtures/auth-enhanced';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';

/** URL predicate for the GraphQL API endpoint */
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

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

  test('shows Delete All Leagues button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /delete all leagues/i }),
    ).toBeVisible();
  });

  test('shows Information card with ownership note', async ({ page }) => {
    // Tamagui H4 inside Card renders as <p>, not <h4> — use getByText (same as
    // LS-1174 fix for preferences/profile-settings)
    await expect(page.getByText('Information', { exact: true })).toBeVisible();
    // Text varies by access level: admin sees "member of", non-admin sees "own"
    await expect(
      page.getByText(/leagues? (you own|you are a member of) will be deleted/i),
    ).toBeVisible();
  });
});

test.describe('Management Page — delete all leagues dialogs @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/management');
    await page.waitForLoadState('load');
    // Wait for the button to be ready
    await expect(
      page.getByRole('button', { name: /delete all leagues/i }),
    ).toBeVisible();
  });

  test('clicking Delete All Leagues opens the first confirmation dialog', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete all leagues/i }).click();

    await expect(page.getByRole('alertdialog')).toBeVisible();
    // The dialog text varies by access level:
    // - admin: "Are you sure you want to delete ALL leagues you are a member of?"
    // - non-admin: "Are you sure you want to delete ALL leagues you own?"
    await expect(
      page.getByText(/are you sure you want to delete all.*leagues/i),
    ).toBeVisible();
  });

  test('first confirmation dialog lists affected data', async ({ page }) => {
    await page.getByRole('button', { name: /delete all leagues/i }).click();

    const dialog = page.locator('div[role="alertdialog"]');
    await expect(dialog).toBeVisible();

    // Key data items listed in the dialog (text varies by access level)
    await expect(
      dialog
        .getByText(/all leagues you own|all leagues you are a member of/i)
        .first(),
    ).toBeVisible();
    await expect(dialog.getByText(/all teams in those leagues/i)).toBeVisible();
    await expect(dialog.getByText(/all roster data/i)).toBeVisible();
  });

  test('canceling from the first dialog closes it', async ({ page }) => {
    await page.getByRole('button', { name: /delete all leagues/i }).click();

    const dialog = page.locator('div[role="alertdialog"]');
    await expect(dialog).toBeVisible();

    await page.getByRole('button', { name: 'Dialog Close' }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('clicking Continue opens the final confirmation dialog', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /delete all leagues/i }).click();

    const firstDialog = page.locator('div[role="alertdialog"]');
    await expect(firstDialog).toBeVisible();

    await firstDialog.getByRole('button', { name: /continue/i }).click();

    // Final confirmation dialog should now be visible
    await expect(page.locator('div[role="alertdialog"]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /final confirmation/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/this is your last chance to cancel/i),
    ).toBeVisible();
  });

  test('canceling from the final confirmation dialog closes it', async ({
    page,
  }) => {
    // Open first dialog
    await page.getByRole('button', { name: /delete all leagues/i }).click();
    const firstDialog = page.locator('div[role="alertdialog"]');
    await expect(firstDialog).toBeVisible();

    // Advance to second dialog
    await firstDialog.getByRole('button', { name: /continue/i }).click();
    await expect(
      page.getByRole('heading', { name: /final confirmation/i }),
    ).toBeVisible();

    const finalDialog = page.locator('div[role="alertdialog"]');
    await page.getByRole('button', { name: 'Dialog Close' }).click();
    await expect(finalDialog).not.toBeVisible();
  });

  test('completing both dialogs calls the deleteAllLeagues mutation', async ({
    page,
  }) => {
    let mutationCalled = false;

    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('deleteallleagues')) {
        mutationCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { deleteAllLeagues: 'All leagues deleted successfully' },
          }),
        });
      } else {
        await unmockedGraphQLFallback(route);
      }
    });

    // Step 1: click delete button
    await page.getByRole('button', { name: /delete all leagues/i }).click();

    // Step 2: confirm in first dialog
    const firstDialog = page.locator('div[role="alertdialog"]');
    await expect(firstDialog).toBeVisible();
    await firstDialog.getByRole('button', { name: /continue/i }).click();

    // Step 3: confirm in final dialog
    await expect(
      page.getByRole('heading', { name: /final confirmation/i }),
    ).toBeVisible();

    // Handle the success alert that follows
    page.once('dialog', (dialog) => void dialog.accept());

    const finalDialog = page.locator('div[role="alertdialog"]');
    await finalDialog
      .getByRole('button', { name: /yes, delete everything/i })
      .click();

    // Mutation should have been called
    await expect.poll(() => mutationCalled).toBe(true);
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
      page.getByRole('textbox', { name: /search players/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Player Stats Page (/players/stats)
// ---------------------------------------------------------------------------

test.describe('Player Stats Page — static elements @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/players/stats');
    await page.waitForLoadState('load');
  });

  test('shows the MLB Player Statistics heading', async ({ page }) => {
    // Title is rendered as a styled <Text> (not a semantic heading element)
    await expect(page.getByText(/player statistics/i).first()).toBeVisible();
  });

  test('shows the player search input', async ({ page }) => {
    await expect(
      page.getByPlaceholder('Search player name · min 2 chars'),
    ).toBeVisible();
  });

  test('shows Share and Export action buttons', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /share/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /export/i }).first(),
    ).toBeVisible();
  });

  test('search input accepts text', async ({ page }) => {
    const input = page.getByPlaceholder('Search player name · min 2 chars');
    await expect(input).toBeVisible();
    await input.fill('Trout');
    await expect(input).toHaveValue('Trout');
  });

  test('search input can be cleared', async ({ page }) => {
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

    // The app should still render its shell (header etc.) without a JS crash
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByTestId('header-logo')).toBeVisible();
  });
});
