/**
 * League Branding E2E Tests (LS-617)
 *
 * Covers the commissioner "League Branding" section in the league detail page:
 * - Section is visible to commissioner in the Commissioner tab
 * - League logo picker is rendered
 * - Brand color inputs accept valid hex values and enable Save Colors
 * - Invalid hex values show an inline error and keep Save disabled
 * - Reset button restores previous color values
 * - Successful branding mutation shows a success message
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { LeaguePage } from '../pages/league.page';
import { updateLeagueBrandingResponse } from '../mocks/graphql/league.mocks';

/** URL predicate that matches GraphQL API endpoints but not source file imports */
function isGraphQLEndpoint(url: URL): boolean {
  const urlString = url.toString();
  return (
    urlString.includes('/graphql') &&
    !urlString.includes('/@fs/') &&
    !urlString.includes('.ts') &&
    !urlString.includes('.js')
  );
}

test.describe('League Branding @critical', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the commissioner tab on the league detail page
    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    // Expand the League Branding accordion section if collapsed
    const brandingHeader = page.getByRole('button', {
      name: /League Branding/i,
    });
    if (await brandingHeader.isVisible()) {
      await brandingHeader.click();
      await page.waitForTimeout(300);
    }
  });

  test('should render the League Branding section in the Commissioner tab', async ({
    page,
  }) => {
    const leaguePage = new LeaguePage(page);

    await expect(leaguePage.brandingHeading).toBeVisible();
    await expect(
      page.getByText(
        /Customise your league.*logo.*header banner.*brand colors/i,
      ),
    ).toBeVisible();
  });

  test('should display the league logo picker', async ({ page }) => {
    await expect(page.getByText('League Logo', { exact: true })).toBeVisible();

    // The AvatarPicker renders a pressable avatar area
    await expect(page.getByText(/League Logo/i).first()).toBeVisible();
  });

  test('should display the header banner picker', async ({ page }) => {
    await expect(
      page.getByText('Header Banner', { exact: true }),
    ).toBeVisible();
  });

  test('should display the brand color inputs with placeholders', async ({
    page,
  }) => {
    const leaguePage = new LeaguePage(page);

    // Both color inputs are present
    await expect(leaguePage.primaryColorInput).toBeVisible();
    await expect(leaguePage.secondaryColorInput).toBeVisible();

    // Placeholders match the expected format
    await expect(leaguePage.primaryColorInput).toHaveAttribute(
      'placeholder',
      '#1A2B3C',
    );
    await expect(leaguePage.secondaryColorInput).toHaveAttribute(
      'placeholder',
      '#FFFFFF',
    );
  });

  test('Save Colors button is disabled when no changes are made', async ({
    page,
  }) => {
    const leaguePage = new LeaguePage(page);

    await expect(leaguePage.primaryColorInput).toBeVisible();
    // With no input changes, Save Colors should be disabled
    await expect(leaguePage.saveColorsButton).toBeDisabled();
  });

  test('entering a valid hex enables the Save Colors button', async ({
    page,
  }) => {
    const leaguePage = new LeaguePage(page);

    await expect(leaguePage.primaryColorInput).toBeVisible();
    await leaguePage.primaryColorInput.fill('#1A2B3C');

    await expect(leaguePage.saveColorsButton).toBeEnabled();
  });

  test('entering an invalid hex shows a validation error and keeps Save disabled', async ({
    page,
  }) => {
    const leaguePage = new LeaguePage(page);

    await expect(leaguePage.primaryColorInput).toBeVisible();

    // Type an invalid hex value
    await leaguePage.primaryColorInput.fill('#ZZZZZZ');

    // Inline validation message appears
    await expect(
      page.getByText(/must be a hex color like #1A2B3C/i),
    ).toBeVisible();

    // Save Colors remains disabled
    await expect(leaguePage.saveColorsButton).toBeDisabled();
  });

  test('Reset button restores colors to their initial values', async ({
    page,
  }) => {
    const leaguePage = new LeaguePage(page);

    await expect(leaguePage.primaryColorInput).toBeVisible();

    // Change the primary color
    await leaguePage.primaryColorInput.fill('#AABBCC');
    await expect(leaguePage.saveColorsButton).toBeEnabled();

    // Reset clears back to empty (initial value is null → '' in state)
    await leaguePage.resetColorsButton.click();
    await expect(leaguePage.primaryColorInput).toHaveValue('');
    await expect(leaguePage.saveColorsButton).toBeDisabled();
  });

  test('saving valid colors calls the mutation and shows success message', async ({
    page,
  }) => {
    // Override the GraphQL handler so updateleaguebranding returns a success
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('updateleaguebranding')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            updateLeagueBrandingResponse({
              primaryColor: '#1A2B3C',
              secondaryColor: '#FFFFFF',
            }),
          ),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/1/commissioner');
    await page.waitForLoadState('networkidle');

    // Expand the branding section
    const brandingHeader = page.getByRole('button', {
      name: /League Branding/i,
    });
    if (await brandingHeader.isVisible()) {
      await brandingHeader.click();
      await page.waitForTimeout(300);
    }

    const leaguePage = new LeaguePage(page);
    await expect(leaguePage.primaryColorInput).toBeVisible();

    await leaguePage.primaryColorInput.fill('#1A2B3C');
    await leaguePage.secondaryColorInput.fill('#FFFFFF');
    await expect(leaguePage.saveColorsButton).toBeEnabled();
    await leaguePage.saveColorsButton.click();

    // Success banner appears
    await expect(page.getByText(/Branding saved!/i)).toBeVisible();
  });
});

test.describe('League Branding — non-commissioner @regression', () => {
  test('Commissioner tab is hidden for regular members', async ({ page }) => {
    // The fixture sets owner=1 but the auth token user is id=1 (owner), so to
    // simulate a non-commissioner we serve a league where the owner is someone else.
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (postData.includes('getleaguebyid')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              league: {
                __typename: 'League',
                id: 1,
                name: 'Test League',
                description: 'A test league',
                owner: 99, // different owner — signed-in user is NOT commissioner
                maxRosterSize: 25,
                draftStatus: 'not-started',
                currentMatchup: null,
                numberOfTeams: 10,
                playerPool: 'all',
                draftMode: 'live',
                selectionMethod: 'standard',
                draftOrder: 'snake',
                isPublic: false,
                maxBatters: 14,
                maxPitchers: 9,
                tradingEnabled: true,
                waiverEnabled: true,
                startDate: null,
                logoUrl: null,
                bannerUrl: null,
                primaryColor: null,
                secondaryColor: null,
              },
            },
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/1');
    await page.waitForLoadState('networkidle');

    // The Commissioner tab should not be visible for non-commissioners
    await expect(
      page.getByRole('tab', { name: /Commissioner/i }),
    ).not.toBeVisible();
  });
});
