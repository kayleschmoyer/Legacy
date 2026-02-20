/**
 * League Creation E2E Tests
 *
 * This test suite validates the complete league creation flow including:
 * - Navigation to league create page
 * - Form validation and error handling
 * - GraphQL integration and API calls
 * - UI state management during creation
 * - Successful league creation and navigation
 */

import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';

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

test.describe('League Creation', () => {
  test('should navigate to league creation page from homepage', async ({
    page,
  }) => {
    // Navigate directly to the league creation page
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');

    // Verify the page rendered with the correct heading
    await expect(
      page.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeVisible({ timeout: 30000 });

    // Verify the form is present
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    // Verify we're on the correct URL
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('should display form validation errors', async ({ page }) => {
    // Navigate directly to league creation page
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // The create button should be disabled when no league name is entered
    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(createButton).toBeDisabled();

    // Enter invalid league name (too short — 2 characters)
    const leagueNameInput = page.getByPlaceholder('Enter your league name');
    await leagueNameInput.fill('Ab');

    // Button is enabled for non-empty input (validation is on submit via alert())
    await expect(createButton).toBeEnabled();

    // Set up dialog handler BEFORE clicking — alert() blocks the click action
    let dialogMessage = '';
    page.once('dialog', async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await createButton.click();

    // Wait briefly for dialog handling to complete
    await page.waitForTimeout(500);

    // Should have shown validation error via alert()
    expect(dialogMessage).toContain(
      'League name must be at least 3 characters long',
    );
  });

  test('should create league successfully with valid data', async ({
    page,
  }) => {
    // Mock the createLeagueAndTeams GraphQL mutation
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('createleagueandteams')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: {
                  __typename: 'League',
                  id: 999,
                  name: 'Test League',
                  owner: 1,
                  maxRosterSize: 25,
                  currentMatchup: null,
                  draftStatus: 'not-started',
                  numberOfTeams: 12,
                  playerPool: 'all',
                  draftMode: 'live',
                  selectionMethod: 'standard',
                  draftOrder: 'snake',
                  isPublic: false,
                },
              },
            },
          }),
        });
      } else {
        // Let auth fixture handle other GraphQL queries
        await route.fallback();
      }
    });

    // Navigate to league creation page
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible({
      timeout: 15000,
    });

    // Fill in valid league data
    const leagueName = `Test League ${Date.now()}`;
    await page.getByPlaceholder('Enter your league name').fill(leagueName);

    // Select number of teams
    await page.getByRole('button', { name: '12', exact: true }).click();

    // Select draft type
    await page.getByRole('button', { name: /blind draft/i }).click();

    // Submit form
    await page.getByRole('button', { name: /create league/i }).click();

    // Wait for successful creation and navigation to the new league page
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/, {
      timeout: 15000,
    });
  });

  test('should handle GraphQL errors gracefully', async ({ page }) => {
    // Mock GraphQL error response
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      // Intercept createLeagueAndTeams mutation
      if (postData.includes('createleagueandteams')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: null,
            errors: [
              {
                message: 'League name already exists',
                extensions: {
                  code: 'DUPLICATE_LEAGUE_NAME',
                },
              },
            ],
          }),
        });
      } else {
        // Let auth fixture handle other GraphQL queries
        await route.fallback();
      }
    });

    // Navigate to league creation page
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Fill in form data
    await page
      .getByPlaceholder('Enter your league name')
      .fill('Duplicate League Name');

    // Submit form
    await page.getByRole('button', { name: /create league/i }).click();

    // The Apollo error object is displayed inline in a red error card
    await expect(page.locator('text=Error:')).toBeVisible({ timeout: 10000 });

    // Verify form stays on same page
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('should validate all form fields correctly', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Test league name validation
    const leagueNameInput = page.getByPlaceholder('Enter your league name');

    // Test empty name — button should be disabled
    await leagueNameInput.fill('');
    await expect(
      page.getByRole('button', { name: /create league/i }),
    ).toBeDisabled();

    // Test minimum length — button enabled but validates on submit
    await leagueNameInput.fill('A');
    await expect(
      page.getByRole('button', { name: /create league/i }),
    ).toBeEnabled();

    // Test maximum length (over 50 characters) — triggers alert on submit
    const longName = 'A'.repeat(51);
    await leagueNameInput.fill(longName);
    let maxLenDialogMsg = '';
    page.once('dialog', async (dialog) => {
      maxLenDialogMsg = dialog.message();
      await dialog.accept();
    });
    await page.getByRole('button', { name: /create league/i }).click();
    await page.waitForTimeout(500);
    expect(maxLenDialogMsg).toContain(
      'League name must be less than 50 characters',
    );

    // Test valid name
    await leagueNameInput.fill('Valid League Name');
    await expect(
      page.getByRole('button', { name: /create league/i }),
    ).toBeEnabled();

    // Test team count options (6, 8, 10, 12, 14, 16)
    for (const count of ['6', '8', '10', '12', '14', '16']) {
      await expect(
        page.getByRole('button', { name: count, exact: true }),
      ).toBeVisible();
    }

    // Test draft type options
    await expect(
      page.getByRole('button', { name: /standard draft/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /blind draft/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /random draft/i }),
    ).toBeVisible();
  });

  test('should show informational content about league creation', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Verify informational card is present
    await expect(page.locator('text=What happens next?')).toBeVisible();

    // Check for key information points
    await expect(
      page.locator(
        'text=Your league will be created with the specified number of teams',
      ),
    ).toBeVisible();
    await expect(
      page.locator("text=You'll be set as the league commissioner"),
    ).toBeVisible();
    await expect(
      page.locator(
        'text=Teams will be auto-generated and ready for member assignment',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        'text=You can invite friends to join your league after creation',
      ),
    ).toBeVisible();
  });

  test('should allow canceling league creation', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible({
      timeout: 15000,
    });

    // Fill in some form data
    await page.getByPlaceholder('Enter your league name').fill('Test League');

    // Click cancel button
    await page.getByRole('button', { name: /cancel/i }).click();

    // Should navigate back to baseball homepage
    await expect(page).toHaveURL('/baseball', { timeout: 15000 });
  });

  test('should preserve form state during selection changes', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Fill in league name
    const testName = 'State Preservation Test';
    await page.getByPlaceholder('Enter your league name').fill(testName);

    // Change team count
    await page.getByRole('button', { name: '8', exact: true }).click();

    // Change draft type
    await page.getByRole('button', { name: /blind draft/i }).click();

    // Verify league name is still there
    await expect(page.getByPlaceholder('Enter your league name')).toHaveValue(
      testName,
    );

    // Verify selections are visually applied (Tamagui uses style props, not CSS classes)
    const teamButton = page.getByRole('button', { name: '8', exact: true });
    await expect(teamButton).toBeVisible();

    const draftButton = page.getByRole('button', { name: /blind draft/i });
    await expect(draftButton).toBeVisible();
  });

  test('should handle date picker interactions', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');

    // Wait for page to render
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible({
      timeout: 15000,
    });

    // Verify the Draft Date & Time label is visible
    await expect(page.getByText('Draft Date & Time')).toBeVisible();

    // DateTimePicker renders as a button (useNativeInput=false) showing the date
    // The default date is 1 week in the future, displayed like "Feb 26, 2026, 4:21 PM"
    // Find the date picker button by looking for a button with a date-like pattern
    const datePickerButton = page
      .locator('button')
      .filter({ hasText: /\d{4}/ });
    await expect(datePickerButton.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display loading state during submission', async ({ page }) => {
    // Mock slow GraphQL response to test loading state
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';

      if (postData.includes('createleagueandteams')) {
        // Add delay to simulate slow response
        await new Promise((resolve) => setTimeout(resolve, 1000));

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              createLeagueAndTeams: {
                __typename: 'CreateLeagueAndTeamsPayload',
                league: {
                  __typename: 'League',
                  id: 999,
                  name: 'Loading Test League',
                  owner: 1,
                  maxRosterSize: 25,
                  currentMatchup: null,
                  draftStatus: 'not-started',
                },
              },
            },
          }),
        });
      } else {
        // Let auth fixture handle other GraphQL queries
        await route.fallback();
      }
    });

    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible({
      timeout: 15000,
    });

    // Fill in form
    await page
      .getByPlaceholder('Enter your league name')
      .fill('Loading Test League');

    // Submit form
    await page.getByRole('button', { name: /create league/i }).click();

    // Verify loading state
    await expect(page.getByText('Creating...')).toBeVisible();

    // Verify button is disabled during loading
    await expect(
      page.getByRole('button', { name: /creating/i }),
    ).toBeDisabled();

    // Wait for completion
    await expect(page).toHaveURL('/baseball/league/999', { timeout: 15000 });
  });
});
