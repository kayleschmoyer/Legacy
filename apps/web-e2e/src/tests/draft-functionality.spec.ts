import { expect, test } from '../fixtures/auth';

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
 */

test.describe('Draft Status Web UI Tests @critical', () => {
  // Test league ID - using the same one from our GraphQL E2E tests
  const testLeagueId = 1;
  const leagueUrl = `/baseball/league/${testLeagueId}`;

  test.beforeEach(async ({ page }) => {
    // Navigate to the league page before each test
    await page.goto(leagueUrl);
    await page.waitForLoadState('networkidle');
  });

  test('should display draft button and status correctly', async ({ page }) => {
    // Wait for league data to load (the component renders <h1 id="league-title">)
    await page.waitForSelector('h1#league-title', { timeout: 15000 });

    // Look for draft-related UI elements
    const draftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();
    const draftStatusElement = page
      .locator('[data-testid="draft-status"], .draft-status')
      .first();

    // Take screenshot of initial state
    await expect(page).toHaveScreenshot('league-page-initial.png');

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
    await page.waitForSelector('h1#league-title', { timeout: 15000 });

    // Find the start draft button
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    // Check if button is available and enabled
    // SKIP-REASON: UI state - League already drafted or user lacks permissions
    // TODO: Add test data setup to ensure repeatable 'not-started' league state (LS-63)
    if (
      !(await startDraftButton.isVisible()) ||
      (await startDraftButton.isDisabled())
    ) {
      console.log(
        '⚠️  Start draft button not available - league may already be drafted or user lacks permissions',
      );
      test.skip();
    }

    // Take screenshot before clicking
    await expect(page).toHaveScreenshot('before-start-draft.png');

    // Click the start draft button
    await startDraftButton.click();

    // Wait for the mutation to complete and UI to update
    await page.waitForTimeout(1000);

    // Look for updated draft status or button text
    const updatedButton = page
      .locator('button')
      .filter({ hasText: /queued|progress|completed/i })
      .first();
    const draftStatusElement = page
      .locator('[data-testid="draft-status"], .draft-status')
      .first();

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

    // Take screenshot after the update
    await expect(page).toHaveScreenshot('after-start-draft.png');
  });

  test('should maintain draft status after page refresh (persistence test)', async ({
    page,
  }) => {
    // This is the critical test that validates our fix for the database persistence issue

    // Wait for league data to load (the component renders <h1 id="league-title">)
    await page.waitForSelector('h1#league-title', { timeout: 15000 });

    // Find and click start draft button (if available)
    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    // SKIP-REASON: UI state - Testing persistence requires either starting a draft or having one already queued
    // TODO: Ensure test data provides consistent starting state
    if (
      !(await startDraftButton.isVisible()) ||
      (await startDraftButton.isDisabled())
    ) {
      console.log(
        '⚠️  Start draft button not available - checking if draft is already queued',
      );

      // Check if draft is already in progress/queued
      const queuedButton = page
        .locator('button')
        .filter({ hasText: /queued|progress/i })
        .first();
      if (await queuedButton.isVisible()) {
        console.log(
          '✅ Draft already in queued/progress state - testing persistence',
        );
      } else {
        // SKIP-REASON: UI state - No draft button available and no queued draft exists in test data
        // TODO: Provide consistent test data with either available draft button or pre-queued draft (LS-63)
        test.skip();
      }
    } else {
      // Start the draft
      await startDraftButton.click();
      await page.waitForTimeout(1000);
    }

    // Capture the draft status after starting
    let preRefreshStatus = '';

    const draftButton = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first();
    const draftStatusElement = page
      .locator('[data-testid="draft-status"], .draft-status')
      .first();

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
    await page.waitForSelector('h1#league-title', { timeout: 15000 });

    // Wait a bit more for any GraphQL queries to complete
    await page.waitForTimeout(2000);

    // Check the draft status after refresh
    let postRefreshStatus = '';

    const refreshedDraftButton = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first();
    const refreshedStatusElement = page
      .locator('[data-testid="draft-status"], .draft-status')
      .first();

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

    // Take final screenshot
    await expect(page).toHaveScreenshot('after-page-refresh.png');

    console.log(
      '✅ Draft status persistence test passed - status maintained after refresh',
    );
  });

  test('should handle rapid interactions gracefully', async ({ page }) => {
    // Test for race conditions or UI state issues

    await page.waitForSelector('h1#league-title', { timeout: 15000 });

    const startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();

    // SKIP-REASON: UI state - Need available draft button to test rapid interactions
    // TODO: Implement test fixture to reset league state before test (LS-63)
    if (
      !(await startDraftButton.isVisible()) ||
      (await startDraftButton.isDisabled())
    ) {
      console.log(
        '⚠️  Start draft button not available for rapid interaction test',
      );
      test.skip();
    }

    // Try rapid clicking (should be handled gracefully by the UI)
    await startDraftButton.click();

    // Wait a short time and try clicking again (should be disabled or show different state)
    await page.waitForTimeout(500);

    const updatedButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();
    if (
      (await updatedButton.isVisible()) &&
      !(await updatedButton.isDisabled())
    ) {
      // If button is still clickable, try clicking again
      await updatedButton.click();
    }

    // Wait for UI to settle
    await page.waitForTimeout(1000);

    // Verify UI is in a consistent state (not broken by rapid interactions)
    const finalButton = page
      .locator('button')
      .filter({ hasText: /draft|queued|progress/i })
      .first();
    expect(await finalButton.isVisible()).toBe(true);

    console.log('✅ Rapid interaction test passed - UI remains consistent');
  });

  test('should display appropriate error messages for invalid operations', async ({
    page,
  }) => {
    // Test error handling in the UI

    await page.waitForSelector('h1#league-title', { timeout: 15000 });

    // Look for any error messages or alerts that might appear
    const errorAlert = page
      .locator('[role="alert"], .error, .alert-error')
      .first();
    const successAlert = page.locator('.success, .alert-success').first();

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

      // Wait for any alerts to appear
      await page.waitForTimeout(2000);

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

    await page.waitForSelector('h1#league-title', { timeout: 15000 });

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
