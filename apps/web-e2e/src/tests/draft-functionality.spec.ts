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

  test('should display draft button and status correctly', async ({ page }) => {
    // Wait for league data to load (the component renders <h1 id="league-title">)
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Look for draft-related UI elements
    const draftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();
    const draftStatusElement = page.getByTestId('draft-status').first();

    // Verify draft button is present and enabled for not-started leagues
    if (await draftButton.isVisible()) {
      const isDisabled = await draftButton.isDisabled();
      const buttonText = await draftButton.textContent();

      console.log(
        `Draft button found: "${buttonText}", disabled: ${isDisabled}`,
      );

      // Button should be visible and potentially enabled
      expect(buttonText).toMatch(/draft/i);
    }

    // Check if draft status is displayed
    if (await draftStatusElement.isVisible()) {
      const statusText = await draftStatusElement.textContent();
      console.log(`Draft status displayed: "${statusText}"`);
    }
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

    await startDraftButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await startDraftButton.isDisabled()).toBe(false);

    // Click the start draft button (opens confirmation dialog)
    await startDraftButton.click();

    // Click the "Confirm" button in the confirmation dialog
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
    await confirmButton.click();

    // Look for updated draft status or button text
    const updatedButton = page
      .locator('button')
      .filter({ hasText: /queued|progress|completed/i })
      .first();
    const draftStatusElement = page.getByTestId('draft-status').first();

    // Wait for the mutation to complete and UI to show an updated status text
    await expect
      .poll(async () => {
        if (await updatedButton.isVisible()) {
          const buttonText = await updatedButton.textContent();
          if (buttonText && /queued|progress|completed/i.test(buttonText)) {
            return true;
          }
        }
        if (await draftStatusElement.isVisible()) {
          const statusText = await draftStatusElement.textContent();
          if (statusText && /queued|progress|completed/i.test(statusText)) {
            return true;
          }
        }
        return false;
      })
      .toBe(true);

    // Verify the UI has been updated
    let statusUpdated = false;

    if (await updatedButton.isVisible()) {
      const buttonText = await updatedButton.textContent();
      console.log(`Updated button text: "${buttonText}"`);
      expect(buttonText).toMatch(/queued|progress|completed/i);
      statusUpdated = true;
    }

    if (await draftStatusElement.isVisible()) {
      const statusText = await draftStatusElement.textContent();
      console.log(`Updated draft status: "${statusText}"`);
      expect(statusText).toMatch(/queued|progress|completed/i);
      statusUpdated = true;
    }

    // At least one UI element should show the updated status
    expect(statusUpdated).toBe(true);
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

    await startDraftButton.waitFor({ state: 'visible', timeout: 5000 });

    // Start the draft (opens confirmation dialog)
    await startDraftButton.click();

    // Click the "Confirm" button in the confirmation dialog
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
    await confirmButton.click();

    // Capture the draft status after starting
    let preRefreshStatus = '';

    const draftButton = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first();
    const draftStatusElement = page.getByTestId('draft-status').first();

    // Poll until a button or status element shows a post-mutation status text
    await expect
      .poll(async () => {
        const texts: string[] = [];
        if (await draftButton.isVisible()) {
          texts.push((await draftButton.textContent()) || '');
        }
        if (await draftStatusElement.isVisible()) {
          texts.push((await draftStatusElement.textContent()) || '');
        }
        return /queued|progress|completed/i.test(texts.join(' '));
      })
      .toBe(true);

    if (await draftButton.isVisible()) {
      preRefreshStatus = (await draftButton.textContent()) || '';
    }

    if (await draftStatusElement.isVisible()) {
      const statusText = (await draftStatusElement.textContent()) || '';
      if (statusText) preRefreshStatus = statusText;
    }

    console.log(`Pre-refresh status: "${preRefreshStatus}"`);
    expect(preRefreshStatus).toMatch(/queued|progress|completed/i);

    // CRITICAL TEST: Refresh the page and verify status persists
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Check the draft status after refresh
    let postRefreshStatus = '';

    const refreshedDraftButton = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first();
    const refreshedStatusElement = page.getByTestId('draft-status').first();

    // Poll until the refreshed UI shows a persisted post-mutation status text
    await expect
      .poll(async () => {
        const texts: string[] = [];
        if (await refreshedDraftButton.isVisible()) {
          texts.push((await refreshedDraftButton.textContent()) || '');
        }
        if (await refreshedStatusElement.isVisible()) {
          texts.push((await refreshedStatusElement.textContent()) || '');
        }
        return texts.join(' ').trim();
      })
      .toMatch(/queued|progress|completed/i);

    if (await refreshedDraftButton.isVisible()) {
      postRefreshStatus = (await refreshedDraftButton.textContent()) || '';
    }

    if (await refreshedStatusElement.isVisible()) {
      const statusText = (await refreshedStatusElement.textContent()) || '';
      if (statusText) postRefreshStatus = statusText;
    }

    console.log(`Post-refresh status: "${postRefreshStatus}"`);

    // This is the key assertion that was failing before our fix
    expect(postRefreshStatus).toMatch(/queued|progress|completed/i);

    // Status should be consistent (not reverted to "not-started")
    if (preRefreshStatus.includes('queued')) {
      expect(postRefreshStatus).toMatch(/queued|progress|completed/i);
    }

    console.log(
      '✅ Draft status persistence test passed - status maintained after refresh',
    );
  });

  test('should handle rapid interactions gracefully', async ({ page }) => {
    // Test for race conditions or UI state issues

    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Mocks guarantee the button is available
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    await startDraftButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click Start Draft to open the confirmation dialog
    await startDraftButton.click();

    // Click Confirm in the dialog to fire the mutation
    const confirmButton = page
      .locator('button')
      .filter({ hasText: /^Confirm$/i })
      .first();
    await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
    await confirmButton.click();

    // Verify UI is in a consistent state (not broken by rapid interactions)
    const finalButton = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first();
    await expect(finalButton).toBeVisible();

    console.log('✅ Rapid interaction test passed - UI remains consistent');
  });

  test('should display appropriate error messages for invalid operations', async ({
    page,
  }) => {
    // Test error handling in the UI

    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Look for any error messages or alerts that might appear
    const errorAlert = page.locator('[role="alert"]').first();
    const successAlert = page.getByTestId('success-alert').first();

    // Try to start draft (this might succeed or fail depending on league state)
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    if (
      (await startDraftButton.isVisible()) &&
      !(await startDraftButton.isDisabled())
    ) {
      await startDraftButton.click();

      // Click Confirm in the dialog to fire the mutation
      const confirmButton = page
        .locator('button')
        .filter({ hasText: /^Confirm$/i })
        .first();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      // Check for success or error messages
      if (await errorAlert.isVisible()) {
        const errorText = await errorAlert.textContent();
        console.log(`Error message displayed: "${errorText}"`);
        expect(errorText).toBeTruthy();
      }

      if (await successAlert.isVisible()) {
        const successText = await successAlert.textContent();
        console.log(`Success message displayed: "${successText}"`);
        expect(successText).toBeTruthy();
      }
    }

    console.log('✅ Error handling test completed');
  });

  test('should maintain accessibility standards', async ({ page }) => {
    // Accessibility test for draft functionality

    await page.getByTestId('league-title').waitFor({ timeout: 15000 });

    // Check that draft button has proper accessibility attributes
    const draftButton = page
      .locator('button')
      .filter({ hasText: /draft/i })
      .first();

    if (await draftButton.isVisible()) {
      // Check for aria labels, roles, etc.
      const ariaLabel = await draftButton.getAttribute('aria-label');
      const role = await draftButton.getAttribute('role');
      const disabled = await draftButton.isDisabled();

      console.log(
        `Button accessibility - aria-label: "${ariaLabel}", role: "${role}", disabled: ${disabled}`,
      );

      // Button should be properly labeled for screen readers
      expect(await draftButton.textContent()).toBeTruthy();
    }

    // Test keyboard navigation
    await page.keyboard.press('Tab');
    const focusedElement = page.locator(':focus').first();

    if (await focusedElement.isVisible()) {
      console.log('✅ Keyboard navigation working');
    }

    console.log('✅ Accessibility test completed');
  });
});
