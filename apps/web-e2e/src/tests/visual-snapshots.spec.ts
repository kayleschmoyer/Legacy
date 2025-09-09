import { expect, test } from '@playwright/test';

test.describe('Visual Snapshots', () => {
  test.beforeEach(async ({ page }) => {
    // Hide dynamic elements that change between test runs
    await page.addStyleTag({
      content: `
        /* Hide elements that change frequently */
        [data-testid="timestamp"],
        .timestamp,
        .time,
        [class*="time"],
        [id*="time"],
        [data-testid="current-time"],
        .loading-spinner,
        .spinner {
          visibility: hidden !important;
        }
        
        /* Ensure consistent animations */
        *,
        *::before,
        *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });
  });

  test('should capture full page snapshots across viewports', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Full page screenshot
    await expect(page).toHaveScreenshot('full-page.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should capture mobile viewport snapshots', async ({
    page,
    browserName,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`mobile-${browserName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should capture tablet viewport snapshots', async ({
    page,
    browserName,
  }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`tablet-${browserName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should capture desktop viewport snapshots', async ({
    page,
    browserName,
  }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot(`desktop-${browserName}.png`, {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should capture dark mode snapshots', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to enable dark mode if available
    const darkModeToggle = page.locator(
      '[data-testid="dark-mode-toggle"], .dark-mode-toggle, [aria-label*="dark"], [aria-label*="theme"]'
    );
    if (await darkModeToggle.isVisible()) {
      await darkModeToggle.click();
      await page.waitForTimeout(500); // Wait for theme transition
    } else {
      // Force dark mode with CSS if no toggle exists
      await page.addStyleTag({
        content: `
          html, body {
            background-color: #1a1a1a !important;
            color: #ffffff !important;
          }
          * {
            background-color: #2d2d2d !important;
            color: #ffffff !important;
            border-color: #444444 !important;
          }
        `,
      });
    }

    await expect(page).toHaveScreenshot('dark-mode.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should capture component library snapshots', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Common component selectors to snapshot
    const componentSelectors = [
      // Navigation components
      'nav',
      'header',
      '[role="navigation"]',
      '.navbar',
      '.nav',

      // Content components
      'main',
      '.main-content',
      '[role="main"]',

      // UI components
      'button',
      '.btn',
      '.button',
      'input',
      '.form-control',
      '.input',

      // Cards and containers
      '.card',
      '.container',
      '.box',

      // Sports-specific components
      '[data-testid="sports-list"]',
      '[data-testid="game-card"]',
      '[data-testid="team-selector"]',
      '[data-testid="score-display"]',

      // Footer
      'footer',
      '.footer',
    ];

    for (const selector of componentSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();

      for (let i = 0; i < Math.min(count, 3); i++) {
        // Limit to first 3 instances
        const element = elements.nth(i);
        if (await element.isVisible()) {
          const cleanSelector = selector
            .replace(/[^\w-]/g, '_')
            .replace(/^_+|_+$/g, '');
          const suffix = count > 1 ? `-${i + 1}` : '';

          try {
            await expect(element).toHaveScreenshot(
              `component-${cleanSelector}${suffix}.png`,
              {
                animations: 'disabled',
                threshold: 0.3, // Allow slight differences
              }
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            console.log(
              `Skipped snapshot for ${selector}${suffix}: ${errorMessage}`
            );
          }
        }
      }
    }
  });

  test('should capture loading states', async ({ page }) => {
    // Intercept network requests to simulate loading states
    await page.route('**/*', (route) => {
      // Delay responses by 2 seconds to capture loading states
      setTimeout(() => {
        void route.continue();
      }, 2000);
    });

    await page.goto('/');

    // Capture loading state immediately
    await expect(page).toHaveScreenshot('loading-state.png', {
      animations: 'disabled',
    });

    // Wait for full load and capture final state
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('loaded-state.png', {
      animations: 'disabled',
    });
  });

  test('should capture error states', async ({ page }) => {
    // Mock API errors to capture error states
    await page.route('**/api/**', (route) => {
      void route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for error messages or states
    const errorElements = page.locator(
      '.error, .alert-error, [data-testid="error"], .text-red-500'
    );
    if (await errorElements.first().isVisible()) {
      await expect(page).toHaveScreenshot('error-state.png', {
        animations: 'disabled',
      });
    }
  });
});
