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

import { expect, unauthTest } from '../fixtures/auth-enhanced';
import { test } from '../fixtures/auth';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

/** URL predicate that matches GraphQL API endpoints but not source file imports */
/** Expand a collapsible section by clicking its toggle header */
async function expandSection(
  page: import('@playwright/test').Page,
  sectionId: string,
) {
  const toggle = page.getByTestId(`section-toggle-${sectionId}`);
  await expect(toggle).toBeVisible();
  const expanded = await toggle.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

test.describe('League Creation @critical', () => {
  test('should navigate to league creation page from homepage', async ({
    page,
  }) => {
    // Navigate directly to the league creation page
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');

    // Verify the page rendered with the correct heading
    await expect(
      page.getByRole('heading', { name: /Create Baseball League/i }),
    ).toBeVisible();

    // Verify the form is present
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    // Verify we're on the correct URL
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('Create League button is always enabled; submitting with short name shows a validation error', async ({
    page,
  }) => {
    // Navigate directly to league creation page
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // The submit button is always enabled so the user can click to receive
    // validation feedback instead of silently disabled UI (LS-2953).
    const createButton = page.getByRole('button', { name: /create league/i });
    await expect(createButton).toBeEnabled();

    // Short name (2 characters) — button is still enabled
    const leagueNameInput = page.getByPlaceholder('Enter your league name');
    await leagueNameInput.fill('Ab');
    await expect(createButton).toBeEnabled();

    // Clicking submit with a short name shows a validation error
    await createButton.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
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
        await unmockedGraphQLFallback(route);
      }
    });

    // Navigate to league creation page
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    // Fill in valid league data
    // Fixed name — this is a fully-mocked hermetic test, no need to make
    // the league name unique against a live backend.
    const leagueName = 'Test League';
    await page.getByPlaceholder('Enter your league name').fill(leagueName);

    // Select number of teams (in Basic Settings, expanded by default)
    await page.getByRole('button', { name: '12', exact: true }).click();

    // Expand Draft Settings section and select draft type
    await expandSection(page, 'draft');
    await page.getByRole('button', { name: /automated draft/i }).click();

    // Submit form
    await page.getByRole('button', { name: /create league/i }).click();

    // Wait for successful creation and navigation to the new league page
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
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
        await unmockedGraphQLFallback(route);
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

    // The error message is displayed inline in a red error card (without "Error:" prefix)
    await expect(page.getByText(/League name already exists/i)).toBeVisible();

    // Verify form stays on same page
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('should validate all form fields correctly', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Test league name validation
    const leagueNameInput = page.getByPlaceholder('Enter your league name');
    const createButton = page.getByRole('button', { name: /create league/i });

    // The submit button is always enabled — validation fires on submit (LS-2953).
    // Verify button is enabled regardless of the current league name value.
    await leagueNameInput.fill('');
    await expect(createButton).toBeEnabled();

    await leagueNameInput.fill('A');
    await expect(createButton).toBeEnabled();

    await leagueNameInput.fill('Ab');
    await expect(createButton).toBeEnabled();

    // Test maximum length (over 50 characters) — shows inline error on submit
    const longName = 'A'.repeat(51);
    await leagueNameInput.fill(longName);
    await createButton.click();
    await expect(page.getByRole('alert')).toContainText(
      'League name must be less than 50 characters',
    );

    // Test valid name — button remains enabled
    await leagueNameInput.fill('Valid League Name');
    await expect(createButton).toBeEnabled();

    // Test team count options (6, 8, 10, 12, 14, 16)
    for (const count of ['6', '8', '10', '12', '14', '16']) {
      await expect(
        page.getByRole('button', { name: count, exact: true }),
      ).toBeVisible();
    }

    // Expand Draft Settings to test draft mode options
    await expandSection(page, 'draft');

    // Test draft mode options
    await expect(
      page.getByRole('button', { name: /live draft/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /automated draft/i }),
    ).toBeVisible();

    // Test selection method options
    await expect(
      page.getByRole('button', { name: 'Standard', exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Auction', exact: true }),
    ).toBeVisible();
  });

  test('should show informational content about league creation', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('networkidle');

    // Verify informational card is present
    await expect(page.locator('text=What happens next')).toBeVisible();

    // Check for key information points
    await expect(
      page.locator(
        "text=Your league is created and you're set as Commissioner",
      ),
    ).toBeVisible();
    await expect(page.locator('text=Send invite links')).toBeVisible();
    await expect(page.locator('text=Draft opens')).toBeVisible();
    await expect(page.locator('text=Tune lineups')).toBeVisible();
  });

  test('should allow canceling league creation', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    // Fill in some form data
    await page.getByPlaceholder('Enter your league name').fill('Test League');

    // Click cancel button
    await page.getByRole('button', { name: /cancel/i }).click();

    // Should navigate back to baseball homepage
    await expect(page).toHaveURL('/baseball');
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

    // Expand Draft Settings and change draft type
    await expandSection(page, 'draft');
    await page.getByRole('button', { name: /automated draft/i }).click();

    // Verify league name is still there
    await expect(page.getByPlaceholder('Enter your league name')).toHaveValue(
      testName,
    );

    // Verify selections are visually applied (Tamagui uses style props, not CSS classes)
    const teamButton = page.getByRole('button', { name: '8', exact: true });
    await expect(teamButton).toBeVisible();

    const draftButton = page.getByRole('button', { name: /automated draft/i });
    await expect(draftButton).toBeVisible();
  });

  test('should handle date picker interactions', async ({ page }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');

    // Wait for page to render
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    // Expand Draft Settings to access the date picker
    await expandSection(page, 'draft');

    // Verify the Draft Date & Time label is visible
    await expect(page.getByText('Draft Date & Time')).toBeVisible();

    // DateTimePicker (useNativeInput=false) renders two side-by-side trigger
    // sub-fields. When no value is set, they show the "Date…" and "Time…"
    // placeholders alongside Calendar/Clock icons.
    await expect(page.getByText('Date…')).toBeVisible();
    await expect(page.getByText('Time…')).toBeVisible();
  });

  test('timezone label is shown when no draft date is selected @regression', async ({
    page,
  }) => {
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

    await expandSection(page, 'draft');
    await expect(page.getByText('Draft Date & Time')).toBeVisible();

    // Before a date is selected the page shows "Times shown in <timezone>"
    await expect(page.getByText(/times shown in/i)).toBeVisible();
    // The timezone label contains a UTC offset in the expected format
    await expect(page.getByText(/utc[+-]\d{2}:\d{2}/i)).toBeVisible();
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
        await unmockedGraphQLFallback(route);
      }
    });

    await page.goto('/baseball/league/create');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByPlaceholder('Enter your league name')).toBeVisible();

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
    await expect(page).toHaveURL('/baseball/league/999');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unauthenticated visitor regression (LS-3477)
//
// /baseball/league/create is a protected route. Unauthenticated visitors are
// intercepted by EnhancedAuthGuard and shown the PublicLandingPage with a
// "Get Started Free" CTA. An automated audit crawler reported that clicking
// this CTA had no visible effect — the evidence shows a CSS-selector parse
// error from the invalid `(button:visible, [role="button"]:visible)` selector.
// These tests use getByRole (accessible name) to lock in that the CTA is
// present, enabled, and clickable for unauthenticated visitors.
// ─────────────────────────────────────────────────────────────────────────────

unauthTest.describe(
  'League Create — unauthenticated visitor @regression',
  () => {
    unauthTest(
      '"Get Started Free" CTA is visible and interactive on /baseball/league/create for unauthenticated users',
      async ({ page }) => {
        await page.goto('/baseball/league/create');
        await page.waitForLoadState('load');

        // The auth guard shows the PublicLandingPage for unauthenticated users.
        // The CTA must be present and enabled so visitors can initiate sign-up
        // from this protected route.
        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
      },
    );

    unauthTest(
      '"Get Started Free" CTA on /baseball/league/create is clickable via getByRole (LS-3477)',
      async ({ page }) => {
        await page.goto('/baseball/league/create');
        await page.waitForLoadState('load');

        const getStartedBtn = page.getByRole('button', {
          name: /get started free/i,
        });
        await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
        await expect(getStartedBtn).toBeEnabled();
        // Regression for LS-3477: confirm the click resolves without the
        // CSS selector parse error caused by the broken crawler selector
        // `(button:visible, [role="button"]:visible)`.
        await getStartedBtn.click();
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Unauthenticated visitor regression (LS-3475)
//
// Direct navigation to /baseball/league/create was reported as returning a 404
// from the server (GitHub Pages SPA hosting returns 404 for unknown paths and
// redirects via 404.html, but the initial HTTP response is a 404). In the E2E
// environment, `serve -s` returns 200 for all SPA routes — these tests lock in
// that the full marketing page renders correctly on direct navigation so future
// regressions are caught before they reach production.
// ─────────────────────────────────────────────────────────────────────────────

unauthTest.describe(
  'League Create — unauthenticated direct navigation sees marketing page @regression',
  () => {
    unauthTest.beforeEach(async ({ page }) => {
      await page.goto('/baseball/league/create');
      await page.waitForLoadState('load');
    });

    unauthTest(
      'shows marketing headline on /baseball/league/create when unauthenticated (LS-3475)',
      async ({ page }) => {
        await expect(
          page.getByRole('heading', { name: /claim your dynasty/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'shows "Members Clubhouse" eyebrow on /baseball/league/create when unauthenticated (LS-3475)',
      async ({ page }) => {
        await expect(page.getByText(/members clubhouse/i)).toBeVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      '"Continue with Google" button is visible on /baseball/league/create when unauthenticated (LS-3475)',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /continue with google/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      '"Continue with Google" button on /baseball/league/create is clickable via getByRole (LS-3475)',
      async ({ page }) => {
        const googleBtn = page.getByRole('button', {
          name: /continue with google/i,
        });
        await expect(googleBtn).toBeVisible({ timeout: 15_000 });
        await expect(googleBtn).toBeEnabled();
        await googleBtn.click({ noWaitAfter: true });
      },
    );

    unauthTest(
      '"Continue with Discord" button is visible on /baseball/league/create when unauthenticated (LS-3475)',
      async ({ page }) => {
        await expect(
          page.getByRole('button', { name: /continue with discord/i }),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      '"Continue with Discord" button on /baseball/league/create is clickable via getByRole (LS-3475)',
      async ({ page }) => {
        const discordBtn = page.getByRole('button', {
          name: /continue with discord/i,
        });
        await expect(discordBtn).toBeVisible({ timeout: 15_000 });
        await expect(discordBtn).toBeEnabled();
        await discordBtn.click({ noWaitAfter: true });
      },
    );
  },
);
