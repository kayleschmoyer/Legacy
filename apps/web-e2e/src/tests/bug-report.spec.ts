/**
 * E2E tests for the Bug Report button and feedback submission flow.
 *
 * The BugReportButton renders in the app header when VITE_JIRA_PROXY_URL is
 * configured. It opens a Dialog with a description textarea, a technical-details
 * toggle, and a Submit Report button. On success it shows a confirmation state.
 *
 * All tests navigate to /about — a page that loads without GraphQL — so the
 * header (and bug report button) is always reliably present.
 */

import { expect, test } from '../fixtures/auth-enhanced';

/** Intercept bug submission requests on the injected Jira proxy URL. */
const JIRA_BUG_URL = '**/__jira-proxy/bug';

/**
 * In CI the production build has VITE_JIRA_PROXY_URL="" (not set at build
 * time), so BugReportButton returns null.  Inject a runtime override via
 * window.__e2eJiraProxyUrl — same pattern as the WebSocket URL override.
 * environment.ts reads this under navigator.webdriver before falling back
 * to import.meta.env.
 */
const E2E_JIRA_PROXY_URL = 'http://localhost:4280/__jira-proxy';

async function injectJiraProxyUrl(page: import('@playwright/test').Page) {
  await page.addInitScript((url: string) => {
    window.__e2eJiraProxyUrl = url;
  }, E2E_JIRA_PROXY_URL);
}

/** Opens the Help & support dropdown then clicks "Report a bug" to open the dialog. */
async function openBugReportViaHelpMenu(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /help & support/i }).click();
  await page.getByRole('menuitem', { name: /report a bug/i }).click();
}

test.describe('Bug Report Button @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await injectJiraProxyUrl(page);
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('bug report option is accessible via the Help & support menu', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /help & support/i }).click();
    const bugItem = page.getByRole('menuitem', { name: /report a bug/i });
    await expect(bugItem).toBeVisible();
  });

  test('clicking Report a bug opens the Report a Bug dialog', async ({
    page,
  }) => {
    await openBugReportViaHelpMenu(page);

    await expect(
      page.getByRole('dialog').getByText('Report a Bug'),
    ).toBeVisible();

    await expect(page.getByText(/describe what happened/i)).toBeVisible();
  });

  test('dialog contains the description textarea and action buttons', async ({
    page,
  }) => {
    await openBugReportViaHelpMenu(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(
      dialog.getByRole('textbox', { name: /bug description/i }),
    ).toBeVisible();

    await expect(
      dialog.getByRole('button', { name: /submit report/i }),
    ).toBeVisible();
    // Cancel is inside Dialog.Close asChild — use text-based locator
    await expect(
      dialog
        .locator('button, [role="button"]')
        .filter({ hasText: /^Cancel$/i }),
    ).toBeVisible();
  });
});

test.describe('Bug Report Button – Mobile @regression', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('bug report button is accessible via mobile nav menu', async ({
    page,
  }) => {
    await injectJiraProxyUrl(page);
    await page.goto('/about');
    await page.waitForLoadState('load');

    // The desktop bug-report button is hidden on narrow viewports
    const hamburger = page.getByRole('button', { name: /open menu/i });
    await hamburger.click();

    // The BugReportButton (🐛) should now appear inside the mobile nav panel
    const bugButton = page.getByRole('button', { name: /report a bug/i });
    await expect(bugButton).toBeVisible();
  });

  test('bug report dialog opens from mobile nav', async ({ page }) => {
    await injectJiraProxyUrl(page);
    await page.goto('/about');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /open menu/i }).click();
    await page.getByRole('button', { name: /report a bug/i }).click();

    await expect(
      page.getByRole('dialog').getByText('Report a Bug'),
    ).toBeVisible();
  });

  test('dialog stays open and accepts input after opening from mobile nav', async ({
    page,
  }) => {
    await injectJiraProxyUrl(page);
    await page.goto('/about');
    await page.waitForLoadState('load');

    await page.getByRole('button', { name: /open menu/i }).click();
    await page.getByRole('button', { name: /report a bug/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Report a Bug')).toBeVisible();

    // Filling the description field triggers a mousedown inside Dialog.Portal,
    // which renders outside mobileRef.  Without the bugDialogOpen guard in
    // Navigation's outside-click handler this would collapse the mobile nav
    // panel and unmount the dialog trigger, closing the dialog prematurely.
    const descriptionField = dialog.getByRole('textbox', {
      name: /bug description/i,
    });
    await descriptionField.fill(
      'Mobile nav regression test: dialog should remain open after typing.',
    );

    await expect(descriptionField).toHaveValue(
      'Mobile nav regression test: dialog should remain open after typing.',
    );
    // Dialog must still be visible after interacting with it
    await expect(dialog).toBeVisible();
  });
});

test.describe('Bug Report Dialog Interactions @regression', () => {
  test.beforeEach(async ({ page }) => {
    await injectJiraProxyUrl(page);
    await page.goto('/about');
    await page.waitForLoadState('load');
    await openBugReportViaHelpMenu(page);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('Submit button is disabled when description is empty', async ({
    page,
  }) => {
    const submitButton = page.getByRole('button', { name: /submit report/i });
    await expect(submitButton).toBeDisabled();
  });

  test('Submit button enables after typing a description', async ({ page }) => {
    const textarea = page.getByRole('textbox', { name: /bug description/i });
    const submitButton = page.getByRole('button', { name: /submit report/i });

    await textarea.fill('The dashboard crashes when clicking the roster tab.');
    await expect(submitButton).toBeEnabled();
  });

  test('character counter updates as user types', async ({ page }) => {
    const textarea = page.getByRole('textbox', { name: /bug description/i });
    const text = 'Reproducible crash on roster tab.';

    await textarea.fill(text);

    await expect(page.getByText(`${text.length}/1000`)).toBeVisible();
  });

  test('technical details toggle expands and collapses the details section', async ({
    page,
  }) => {
    const toggle = page.getByRole('button', {
      name: /technical details/i,
    });
    await expect(toggle).toBeVisible();

    // Details should be hidden initially
    await expect(page.getByText(/User:/i)).not.toBeVisible();

    // Expand
    await toggle.click();
    await expect(page.getByText(/User:/i)).toBeVisible();

    // Collapse
    await toggle.click();
    await expect(page.getByText(/User:/i)).not.toBeVisible();
  });

  test('Cancel button closes the dialog without submitting', async ({
    page,
  }) => {
    let postCalled = false;
    await page.route(JIRA_BUG_URL, () => {
      postCalled = true;
    });

    // The Cancel button is wrapped in Dialog.Close asChild which may alter
    // the element role in Tamagui's web rendering.  Use a text-based locator
    // scoped to the dialog instead of getByRole.
    const cancelBtn = page
      .getByRole('dialog')
      .locator('button, [role="button"]')
      .filter({ hasText: /^Cancel$/i });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(postCalled).toBe(false);
  });

  test('Close (✕) button closes the dialog', async ({ page }) => {
    await page.getByRole('button', { name: /close/i }).first().click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('form resets to blank after closing and reopening the dialog', async ({
    page,
  }) => {
    const textarea = page.getByRole('textbox', { name: /bug description/i });
    await textarea.fill('Some text I typed.');

    // Close via Cancel (Dialog.Close asChild may alter the element role)
    const cancelBtn = page
      .getByRole('dialog')
      .locator('button, [role="button"]')
      .filter({ hasText: /^Cancel$/i });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Reopen via Help menu
    await openBugReportViaHelpMenu(page);
    await expect(page.getByRole('dialog')).toBeVisible();

    // Textarea should be empty again
    await expect(
      page.getByRole('textbox', { name: /bug description/i }),
    ).toHaveValue('');
  });
});

test.describe('Bug Report Submission @regression', () => {
  test.beforeEach(async ({ page }) => {
    await injectJiraProxyUrl(page);
    await page.goto('/about');
    await page.waitForLoadState('load');
    await openBugReportViaHelpMenu(page);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('successful submission shows confirmation with the created issue key', async ({
    page,
  }) => {
    await page.route(JIRA_BUG_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issueKey: 'LS-999' }),
      });
    });

    const textarea = page.getByRole('textbox', { name: /bug description/i });
    await textarea.fill(
      'Navigating to /baseball/league/999 returns a 404 page.',
    );

    await page.getByRole('button', { name: /submit report/i }).click();

    // Show loading text briefly, then success
    await expect(page.getByText('Thanks! Created LS-999.')).toBeVisible();

    // Success checkmark should be visible
    await expect(page.getByRole('img', { name: /success/i })).toBeVisible();
  });

  test('successful submission without issue key shows generic thanks message', async ({
    page,
  }) => {
    await page.route(JIRA_BUG_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    const textarea = page.getByRole('textbox', { name: /bug description/i });
    await textarea.fill('Login button disappears after OAuth redirect.');

    await page.getByRole('button', { name: /submit report/i }).click();

    await expect(page.getByText('Thanks for the report!')).toBeVisible();
  });

  test('submission shows loading state while waiting for response', async ({
    page,
  }) => {
    let resolveRoute: () => void = () => undefined;
    const routePromise = new Promise<void>((resolve) => {
      resolveRoute = resolve;
    });

    await page.route(JIRA_BUG_URL, async (route) => {
      await routePromise;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ issueKey: 'LS-100' }),
      });
    });

    const textarea = page.getByRole('textbox', { name: /bug description/i });
    await textarea.fill('Stats page times out for players with >10 seasons.');

    await page.getByRole('button', { name: /submit report/i }).click();

    // During loading the button label changes
    await expect(page.getByText('Submitting...')).toBeVisible();

    // Unblock the route
    resolveRoute();

    await expect(page.getByText(/Thanks/)).toBeVisible();
  });

  test('server error shows an error message inside the dialog', async ({
    page,
  }) => {
    await page.route(JIRA_BUG_URL, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    const textarea = page.getByRole('textbox', { name: /bug description/i });
    await textarea.fill(
      'Draft board does not load for leagues with >12 teams.',
    );

    await page.getByRole('button', { name: /submit report/i }).click();

    await expect(page.getByText(/internal server error/i)).toBeVisible();

    // Dialog should remain open so the user can retry or copy their text
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('network failure shows a generic error message', async ({ page }) => {
    await page.route(JIRA_BUG_URL, async (route) => {
      await route.abort('failed');
    });

    const textarea = page.getByRole('textbox', { name: /bug description/i });
    await textarea.fill('Crash when trying to trade a player mid-draft.');

    await page.getByRole('button', { name: /submit report/i }).click();

    // route.abort('failed') throws a TypeError("Failed to fetch") in
    // Chromium.  The component's catch block renders err.message directly
    // since it is an Error instance, so the toast shows "Failed to fetch"
    // rather than the generic "Something went wrong" fallback.
    await expect(
      page.getByText(/something went wrong|failed to fetch/i),
    ).toBeVisible();

    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
