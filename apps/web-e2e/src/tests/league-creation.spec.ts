/**
 * League Creation E2E Tests
 *
 * This test suite validates the complete league creation flow including:
 * - Navigation to league create page
 * - Form validation and error handling
 * - GraphQL integration and API calls
 * - UI state management during creation
 * - Successful league creation and navigation
 *
 * Page-object migration (LS-8092 / ADR-0015): all locators live on
 * `leaguePage` — specs are selector-free.
 */

import { expect, leagueTest as test, unauthTest } from '../fixtures/pages';
import { unmockedGraphQLFallback } from '../fixtures/shared-mocks';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

test.describe('League Creation @critical', () => {
  test('should navigate to league creation page from homepage', async ({
    page,
    leaguePage,
  }) => {
    // Navigate directly to the league creation page
    await leaguePage.gotoCreate();

    // Verify the page rendered with the correct heading
    await leaguePage.createTitle('baseball').expectVisible();

    // Verify the form is present
    await leaguePage.leagueNameInput.expectVisible();

    // Verify we're on the correct URL
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('intro paragraph is fully visible at mobile viewport without horizontal overflow (LS-4847)', async ({
    page,
    leaguePage,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await leaguePage.gotoCreate();

    await leaguePage.createHeading.expectVisible();
    const intro = leaguePage.text(
      /Configure your league settings and draft rules\. You can adjust everything except team count after the draft\./,
    );
    await intro.expectVisible();

    // The paragraph's bounding box must fit within the viewport — otherwise
    // text overflows horizontally and wraps off-screen (LS-4847 repro).
    const box = await intro.boundingBox();
    if (!box) throw new Error('intro paragraph has no bounding box');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });

  test('Create League button is always enabled; submitting with short name shows a validation error', async ({
    leaguePage,
  }) => {
    // Navigate directly to league creation page
    await leaguePage.gotoCreate();

    // The submit button is always enabled so the user can click to receive
    // validation feedback instead of silently disabled UI (LS-2953).
    await leaguePage.createButton.expectEnabled();

    // Short name (2 characters) — button is still enabled
    await leaguePage.fillLeagueName('Ab');
    await leaguePage.createButton.expectEnabled();

    // Clicking submit with a short name shows a validation error
    await leaguePage.submitCreate();
    await leaguePage.alert.expectVisible();
    await leaguePage.expectNoAppError();
  });

  test('should create league successfully with valid data', async ({
    page,
    leaguePage,
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
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Fill in valid league data
    // Fixed name — this is a fully-mocked hermetic test, no need to make
    // the league name unique against a live backend.
    await leaguePage.fillLeagueName('Test League');

    // Select number of teams (in Basic Settings, expanded by default)
    await leaguePage.clickButton('12', { exact: true });

    // Expand Draft Settings section and select draft type
    await leaguePage.expandSection('draft');
    await leaguePage.clickButton(/automated draft/i);

    // Submit form
    await leaguePage.submitCreate();

    // Confirm the post-create "League created!" dialog (LS-6067) before the
    // page navigates to the new league.
    await leaguePage.continueToLeague();

    // Wait for successful creation and navigation to the new league page
    await expect(page).toHaveURL(/\/baseball\/league\/\d+/);
  });

  test('should handle GraphQL errors gracefully', async ({
    page,
    leaguePage,
  }) => {
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
    await leaguePage.gotoCreate();

    // Fill in form data
    await leaguePage.fillLeagueName('Duplicate League Name');

    // Submit form
    await leaguePage.submitCreate();

    // The error message is displayed inline in a red error card (without "Error:" prefix)
    await leaguePage.text(/League name already exists/i).expectVisible();

    // Verify form stays on same page
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('should validate all form fields correctly', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();

    // The submit button is always enabled — validation fires on submit (LS-2953).
    // Verify button is enabled regardless of the current league name value.
    await leaguePage.fillLeagueName('');
    await leaguePage.createButton.expectEnabled();

    await leaguePage.fillLeagueName('A');
    await leaguePage.createButton.expectEnabled();

    await leaguePage.fillLeagueName('Ab');
    await leaguePage.createButton.expectEnabled();

    // Test maximum length (over 50 characters) — shows inline error on submit
    await leaguePage.fillLeagueName('A'.repeat(51));
    await leaguePage.submitCreate();
    await leaguePage.alert.expectContainsText(
      'League name must be less than 50 characters',
    );

    // Test valid name — button remains enabled
    await leaguePage.fillLeagueName('Valid League Name');
    await leaguePage.createButton.expectEnabled();

    // Test team count options (6, 8, 10, 12, 14, 16)
    for (const count of ['6', '8', '10', '12', '14', '16']) {
      await leaguePage.button(count, { exact: true }).expectVisible();
    }

    // Expand Draft Settings to test draft mode options
    await leaguePage.expandSection('draft');

    // Test draft mode options
    await leaguePage.button(/live draft/i).expectVisible();
    await leaguePage.button(/automated draft/i).expectVisible();

    // Test selection method options
    await leaguePage
      .button('Standard', { exact: true })
      .first()
      .expectVisible();
    await leaguePage.button('Auction', { exact: true }).expectVisible();
  });

  test('should show informational content about league creation', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();

    // Verify informational card is present
    await leaguePage.text('What happens next').expectVisible();

    // Check for key information points
    await leaguePage
      .text("Your league is created and you're set as Commissioner")
      .expectVisible();
    await leaguePage.text('Send invite links').expectVisible();
    await leaguePage.text('Draft opens').expectVisible();
    await leaguePage.text('Tune lineups').expectVisible();
  });

  test('should allow canceling league creation', async ({
    page,
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Fill in some form data
    await leaguePage.fillLeagueName('Test League');

    // Click cancel button — with unsaved changes this opens a
    // "Discard this league?" confirmation dialog (LS-6109) instead of
    // navigating immediately.
    await leaguePage.cancelButton.tap();
    await leaguePage.button('Discard').tap();

    // Should navigate back to baseball homepage
    await expect(page).toHaveURL('/baseball');
  });

  test('should stay on the create form when discarding is declined', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Fill in some form data
    await leaguePage.fillLeagueName('Test League');

    // Click cancel, then decline the discard confirmation.
    await leaguePage.cancelButton.tap();
    await leaguePage.button('Keep Editing').tap();

    // Should remain on the create form with the entered data intact.
    await leaguePage.leagueNameInput.expectVisible();
    expect(await leaguePage.leagueNameInput.value()).toBe('Test League');
  });

  test('should preserve form state during selection changes', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();

    // Fill in league name
    const testName = 'State Preservation Test';
    await leaguePage.fillLeagueName(testName);

    // Change team count
    await leaguePage.clickButton('8', { exact: true });

    // Expand Draft Settings and change draft type
    await leaguePage.expandSection('draft');
    await leaguePage.clickButton(/automated draft/i);

    // Verify league name is still there
    await leaguePage.leagueNameInput.expectValue(testName);

    // Verify selections are visually applied (Tamagui uses style props, not CSS classes)
    await leaguePage.button('8', { exact: true }).expectVisible();
    await leaguePage.button(/automated draft/i).expectVisible();
  });

  test('should handle date picker interactions', async ({ leaguePage }) => {
    await leaguePage.gotoCreate();

    // Wait for page to render
    await leaguePage.leagueNameInput.expectVisible();

    // Expand Draft Settings to access the date picker
    await leaguePage.expandSection('draft');

    // Verify the Draft Date & Time label is visible
    await leaguePage.text('Draft Date & Time').expectVisible();

    // DateTimePicker (useNativeInput=false) renders two side-by-side trigger
    // sub-fields. When no value is set, they show the "Date…" and "Time…"
    // placeholders alongside Calendar/Clock icons.
    await leaguePage.text('Date…').expectVisible();
    await leaguePage.text('Time…').expectVisible();
  });

  test('timezone label is shown when no draft date is selected @regression', async ({
    leaguePage,
  }) => {
    await leaguePage.gotoCreate();

    await leaguePage.expandSection('draft');
    await leaguePage.text('Draft Date & Time').expectVisible();

    // Before a date is selected the page shows "Times shown in <timezone>"
    await leaguePage.text(/times shown in/i).expectVisible();
    // The timezone label contains a UTC offset in the expected format
    await leaguePage.text(/utc[+-]\d{2}:\d{2}/i).expectVisible();
  });

  test('should display loading state during submission', async ({
    page,
    leaguePage,
  }) => {
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

    await leaguePage.gotoCreate();
    await leaguePage.leagueNameInput.expectVisible();

    // Fill in form
    await leaguePage.fillLeagueName('Loading Test League');

    // Submit form
    await leaguePage.submitCreate();

    // Verify loading state
    await leaguePage.text('Creating...').expectVisible();

    // Verify button is disabled during loading
    await leaguePage.creatingButton.expectDisabled();

    // Confirm the post-create "League created!" dialog (LS-6067) before the
    // page navigates to the new league.
    await leaguePage.continueToLeague();

    // Wait for completion
    await expect(page).toHaveURL('/baseball/league/999');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unauthenticated visitor regression (LS-3477 → LS-7785)
//
// /baseball/league/create is a protected route. Unauthenticated visitors are
// intercepted by EnhancedAuthGuard and shown the auth-guard login card. The
// original LS-3477 tests asserted a "Get Started Free" CTA, but that ambiguous
// label (which silently selected Google — OBD-002 / LS-6915) was reworked into
// the explicit "Continue with Google" / "Continue with Discord" sign-in buttons.
// Those buttons are already covered by the LS-3475 describe below on this exact
// route, so the stale "Get Started Free" cases were removed in LS-7785 rather
// than duplicated.
// ─────────────────────────────────────────────────────────────────────────────

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
      async ({ leaguePage }) => {
        await leaguePage.heading(/claim your dynasty/i).expectVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      'shows "Members Clubhouse" eyebrow on /baseball/league/create when unauthenticated (LS-3475)',
      async ({ leaguePage }) => {
        await leaguePage.text(/members clubhouse/i).expectVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      '"Continue with Google" button is visible on /baseball/league/create when unauthenticated (LS-3475)',
      async ({ leaguePage }) => {
        await leaguePage.button(/continue with google/i).expectVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      '"Continue with Google" button on /baseball/league/create is clickable via getByRole (LS-3475)',
      async ({ leaguePage }) => {
        const googleBtn = leaguePage.button(/continue with google/i);
        await googleBtn.expectVisible({ timeout: 15_000 });
        await googleBtn.expectEnabled();
        await googleBtn.tap();
      },
    );

    unauthTest(
      '"Continue with Discord" button is visible on /baseball/league/create when unauthenticated (LS-3475)',
      async ({ leaguePage }) => {
        await leaguePage.button(/continue with discord/i).expectVisible({
          timeout: 15_000,
        });
      },
    );

    unauthTest(
      '"Continue with Discord" button on /baseball/league/create is clickable via getByRole (LS-3475)',
      async ({ leaguePage }) => {
        const discordBtn = leaguePage.button(/continue with discord/i);
        await discordBtn.expectVisible({ timeout: 15_000 });
        await discordBtn.expectEnabled();
        await discordBtn.tap();
      },
    );
  },
);
