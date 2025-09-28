import { expect, test } from '@playwright/test';

test.describe('Web Application', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that the page has loaded
    expect(await page.title()).toBeTruthy();

    // Visual snapshot of the homepage
    await expect(page).toHaveScreenshot('homepage.png');
  });

  test('should navigate to different sections', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Test navigation - this will depend on your actual app structure
    // Add specific navigation tests based on your web app's UI

    // Take a snapshot of the main navigation area
    const navigation = page.locator('nav, header, [role="navigation"]').first();
    if (await navigation.isVisible()) {
      await expect(navigation).toHaveScreenshot('navigation.png');
    }
  });

  test('should handle authentication flow', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Test authentication - this will use MSW mocks
    // Add specific authentication tests based on your app's auth flow

    // Take snapshot of initial auth state
    await expect(page).toHaveScreenshot('auth-initial.png');
  });

  test('should match HTML snapshot of homepage', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Remove dynamic content that changes on each run
    await page.addStyleTag({
      content: `
        [data-testid="timestamp"],
        .timestamp,
        .time,
        [class*="time"],
        [id*="time"] {
          visibility: hidden !important;
        }
      `,
    });

    // HTML snapshot (structure and content)
    const bodyContent = await page.locator('body').innerHTML();
    expect(bodyContent).toMatchSnapshot('homepage.html');
  });

  test('should capture component snapshots', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Capture snapshots of specific components if they exist
    const components = [
      'header',
      'main',
      'footer',
      '[data-testid="sports-list"]',
      '[data-testid="game-selection"]',
      '.card',
      '.button',
    ];

    for (const selector of components) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        // Clean selector name for filename
        const cleanSelector = selector.replace(/[^\w-]/g, '_');
        await expect(element).toHaveScreenshot(
          `component-${cleanSelector}.png`,
        );
      }
    }
  });
});
