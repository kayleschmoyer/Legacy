import { expect, test } from '../fixtures/auth-enhanced';
import { SnapshotUtils } from '../support/snapshot-utils';

test.describe('Sports App Snapshots @visual', () => {
  test('should capture complete sports application snapshots', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await SnapshotUtils.waitForImages(page);

    // Full page snapshot
    await SnapshotUtils.takeFullPageScreenshot(page, 'sports-app-homepage.png');

    // Responsive snapshots
    await SnapshotUtils.captureResponsiveSnapshots(
      page,
      'sports-app-responsive',
    );
  });

  test('should capture sports-specific components', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sports list component
    const sportsListSelector = '[data-testid="sports-list"]';
    if (await page.locator(sportsListSelector).isVisible()) {
      await SnapshotUtils.captureComponentStates(
        page,
        sportsListSelector,
        'sports-list',
      );
      await SnapshotUtils.takeHtmlSnapshot(
        page,
        sportsListSelector,
        'sports-list.html',
      );
    }

    // Game card components
    const gameCardSelector = '[data-testid="game-card"]';
    if (await page.locator(gameCardSelector).isVisible()) {
      await SnapshotUtils.captureComponentStates(
        page,
        gameCardSelector,
        'game-card',
      );
      await SnapshotUtils.takeHtmlSnapshot(
        page,
        gameCardSelector,
        'game-card.html',
      );
    }

    // Team selector
    const teamSelectorSelector = '[data-testid="team-selector"]';
    if (await page.locator(teamSelectorSelector).isVisible()) {
      await SnapshotUtils.captureComponentStates(
        page,
        teamSelectorSelector,
        'team-selector',
      );
    }

    // Score display
    const scoreDisplaySelector = '[data-testid="score-display"]';
    if (await page.locator(scoreDisplaySelector).isVisible()) {
      await SnapshotUtils.takeComponentScreenshot(
        page,
        scoreDisplaySelector,
        'score-display.png',
      );
    }
  });

  test('should capture UI component library', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Capture all common UI components
    await SnapshotUtils.captureUIComponents(page);
  });

  test('should capture navigation states', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Main navigation
    const navSelector = 'nav, header, [role="navigation"]';
    if (await page.locator(navSelector).isVisible()) {
      // Default navigation state
      await SnapshotUtils.takeComponentScreenshot(
        page,
        navSelector,
        'navigation-default.png',
      );

      // Mobile navigation (if exists)
      const mobileMenuToggle = page.locator('[data-testid="mobile-menu"]');
      if (await mobileMenuToggle.isVisible()) {
        await mobileMenuToggle.click();
        await page.waitForTimeout(300); // Wait for animation
        await SnapshotUtils.takeComponentScreenshot(
          page,
          navSelector,
          'navigation-mobile-open.png',
        );
      }
    }
  });

  test('should capture form interactions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for forms
    const forms = page.locator('form');
    const formCount = await forms.count();

    for (let i = 0; i < formCount; i++) {
      const form = forms.nth(i);
      if (await form.isVisible()) {
        // Empty form
        await SnapshotUtils.takeComponentScreenshot(
          page,
          `form:nth-child(${i + 1})`,
          `form-${i + 1}-empty.png`,
        );

        // Fill form with sample data
        const inputs = form.locator('input, select, textarea');
        const inputCount = await inputs.count();

        for (let j = 0; j < inputCount; j++) {
          const input = inputs.nth(j);
          const inputType = (await input.getAttribute('type')) || 'text';

          try {
            switch (inputType) {
              case 'email':
                await input.fill('test@example.com');
                break;
              case 'password':
                await input.fill('password123');
                break;
              case 'number':
                await input.fill('123');
                break;
              case 'text':
              default:
                await input.fill('Sample text');
                break;
            }
          } catch {
            // Input might not be fillable, skip
          }
        }

        // Filled form
        await SnapshotUtils.takeComponentScreenshot(
          page,
          `form:nth-child(${i + 1})`,
          `form-${i + 1}-filled.png`,
        );
        await SnapshotUtils.takeHtmlSnapshot(
          page,
          `form:nth-child(${i + 1})`,
          `form-${i + 1}.html`,
        );
      }
    }
  });

  test('should capture loading and error states', async ({ page }) => {
    // Mock slow API to capture loading state
    await page.route('**/api/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('/');

    // Capture loading state immediately
    await SnapshotUtils.takeFullPageScreenshot(page, 'loading-state.png');

    // Wait for load complete
    await page.waitForLoadState('networkidle');
    await SnapshotUtils.takeFullPageScreenshot(page, 'loaded-state.png');
  });

  test('should capture theme variations', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Light theme (default)
    await SnapshotUtils.takeFullPageScreenshot(
      page,
      `theme-light-${browserName}.png`,
    );

    // Try to find and activate dark mode
    const darkModeToggle = page.locator(
      '[data-testid="dark-mode"], [data-testid="theme-toggle"]',
    );
    if (await darkModeToggle.isVisible()) {
      await darkModeToggle.click();
      await page.waitForTimeout(500); // Wait for theme transition
      await SnapshotUtils.takeFullPageScreenshot(
        page,
        `theme-dark-${browserName}.png`,
      );
    } else {
      // Force dark mode with CSS
      await page.addStyleTag({
        content: `
          * {
            filter: invert(1) hue-rotate(180deg) !important;
          }
          img, video, iframe {
            filter: invert(1) hue-rotate(180deg) !important;
          }
        `,
      });
      await SnapshotUtils.takeFullPageScreenshot(
        page,
        `theme-dark-forced-${browserName}.png`,
      );
    }
  });
});
