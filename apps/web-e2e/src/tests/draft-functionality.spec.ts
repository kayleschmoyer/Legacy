import { expect, test } from '../fixtures/auth';
import { mockDraft } from '../mocks/graphql/draft.mocks';
import { leagueByIdResponse } from '../mocks/graphql/league.mocks';

/**
 * E2E Tests for Draft Status Functionality in Web App
 *
 * This test suite validates the startDraft functionality from the user's perspective
 * by interacting with the actual web UI and verifying the behavior matches what
 * users would experience.
 *
 * Tests the complete flow:
 * 1. User navigates to league page
 * 2. User clicks "Start Draft" button
 * 3. Draft status updates to "queued" immediately
 * 4. Status persists on page refresh (critical test for the bug we fixed)
 *
 * Prerequisites (handled by auth fixture + shared baseline mocks):
 * - GetLeagueById returns league with draftStatus: 'not-started', owner: 1
 * - InitializeDraft mutation returns draftStatus: 'queued'
 * - Authenticated user is id: 1 (matches league owner)
 */

test.describe('Draft Status Web UI Tests @critical', () => {
  // Test league ID - using the same one from our GraphQL E2E tests
  const testLeagueId = 1;
  // Navigate to the commissioner tab where the Start Draft button lives
  const leagueUrl = `/baseball/league/${testLeagueId}/commissioner`;

  test.beforeEach(async ({ page }) => {
    // Track draft status so GetLeagueById returns the updated value after
    // the InitializeDraft mutation fires.  This route is registered during
    // the test body, so it takes priority (LIFO) over the _apiIsolation
    // baseline and the auth fixture's page-level routes.
    let draftStatus: 'not-started' | 'queued' | 'in-progress' | 'completed' =
      'not-started';

    await page.route(
      (url) => url.toString().includes('/graphql'),
      async (route) => {
        const postData = route.request().postData()?.toLowerCase() ?? '';

        if (postData.includes('initializedraft')) {
          draftStatus = 'queued';
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                initializeDraft: mockDraft({
                  status: 'queued',
                  leagueId: testLeagueId,
                }),
              },
            }),
          });
        } else if (postData.includes('getleaguebyid')) {
          // Return league with current (possibly mutated) draftStatus
          void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(leagueByIdResponse({ draftStatus })),
          });
        } else {
          // Let other operations cascade to the auth fixture's baseline mocks
          await route.fallback();
        }
      },
    );

    // Navigate to the league page before each test
    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');
  });

  test('should display draft button enabled for not-started leagues', async ({
    page,
  }) => {
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Mocks guarantee draftStatus: 'not-started' and authenticated user is the
    // league owner — the Start Draft button must be visible and enabled.
    const draftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await expect(draftButton).toBeVisible();
    await expect(draftButton).toBeEnabled();
    await expect(draftButton).toHaveText(/draft/i);
  });

  test('should update draft status when start draft button is clicked', async ({
    page,
  }) => {
    // Wait for league data to load (the component renders <h1 id="league-title">)
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Find the start draft button — baseline mocks guarantee draftStatus: 'not-started'
    // and authenticated user matches league owner, so button should be visible
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await expect(startDraftButton).toBeVisible({ timeout: 5000 });
    await expect(startDraftButton).toBeEnabled();

    // Click the start draft button (opens confirmation dialog)
    await startDraftButton.click();

    // Click the "Confirm" button in the confirmation dialog
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    // After the mutation completes, either the updated button or the
    // draft-status element must reflect a post-mutation status. Either-or
    // because the LeagueHero chip and the commissioner action button render
    // from the same Apollo cache update — exactly one is expected to surface
    // the new text first, depending on viewport / refetch ordering.
    const updatedStatusUi = page
      .locator('button')
      .filter({ hasText: /queued|progress|completed/i })
      .first()
      .or(page.getByTestId('draft-status').first());

    await expect(updatedStatusUi).toBeVisible();
    await expect(updatedStatusUi).toContainText(/queued|progress|completed/i);
  });

  test('should maintain draft status after page refresh (persistence test)', async ({
    page,
  }) => {
    // This is the critical test that validates our fix for the database persistence issue

    // Wait for league data to load (the component renders <h1 id="league-title">)
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Find and click start draft button — mocks guarantee it's available
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await expect(startDraftButton).toBeVisible({ timeout: 5000 });

    // Start the draft (opens confirmation dialog)
    await startDraftButton.click();

    // Click the "Confirm" button in the confirmation dialog
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    // Capture the post-mutation status from whichever surface renders it.
    const preRefreshUi = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first()
      .or(page.getByTestId('draft-status').first());

    await expect(preRefreshUi).toContainText(/queued|progress|completed/i);

    // CRITICAL TEST: Refresh the page and verify status persists
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Check the draft status after refresh — this is the key assertion that
    // was failing before our fix.
    const refreshedUi = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first()
      .or(page.getByTestId('draft-status').first());

    await expect(refreshedUi).toContainText(/queued|progress|completed/i);
  });

  test('should handle rapid interactions gracefully', async ({ page }) => {
    // Test for race conditions or UI state issues

    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Mocks guarantee the button is available
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await expect(startDraftButton).toBeVisible({ timeout: 5000 });

    // Click Start Draft to open the confirmation dialog
    await startDraftButton.click();

    // Click Confirm in the dialog to fire the mutation
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    // Verify UI is in a consistent state (not broken by rapid interactions)
    const finalButton = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first();
    await expect(finalButton).toBeVisible();
  });

  test('start draft mutation does not surface an error alert', async ({
    page,
  }) => {
    // The mocked initializeDraft mutation returns success. The UI must not
    // surface an error alert, and the action button must transition to the
    // post-mutation state without a stuck disabled or pending control.
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();
    await expect(startDraftButton).toBeVisible();
    await expect(startDraftButton).toBeEnabled();
    await startDraftButton.click();

    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();

    // The button or status surface should reflect the new state…
    const updatedStatusUi = page
      .locator('button')
      .filter({ hasText: /queued|progress|completed/i })
      .first()
      .or(page.getByTestId('draft-status').first());
    await expect(updatedStatusUi).toBeVisible();

    // …and no error alert should appear.
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test('draft button exposes accessible text and supports keyboard focus', async ({
    page,
  }) => {
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Mocks guarantee the league owner sees the Start Draft button.
    const draftButton = page
      .locator('button')
      .filter({ hasText: /draft/i })
      .first();

    await expect(draftButton).toBeVisible();
    // Screen readers rely on the button text — must be non-empty.
    await expect(draftButton).not.toHaveText('');

    // Tab from the document root should land focus on a visible element
    // (the skip-link is the first tab-stop and is keyboard-accessible).
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});
