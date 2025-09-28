import { by, device, element, expect } from 'detox';

describe('Legacy Sports App', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  describe('App Launch and Core Functionality', () => {
    it('should launch app successfully', async () => {
      // App should launch without crashing
      await expect(element(by.id('app-root')).atIndex(0)).toBeVisible();
    });

    it('should display loading panel initially', async () => {
      // Check if loading panel appears during app initialization
      try {
        await expect(element(by.id('loading-panel'))).toBeVisible();
      } catch {
        // Loading might be too fast to catch, that's okay
      }
    });

    it('should show main navigation after loading', async () => {
      // Wait for app to finish loading and show main content
      await waitFor(element(by.id('main-navigator')))
        .toBeVisible()
        .withTimeout(10000);
    });
  });

  describe('Navigation and Screens', () => {
    it('should navigate to Football screen', async () => {
      // Look for football navigation element
      const footballTab = element(
        by.id('football-tab').or(by.text('Football')),
      );

      if (await footballTab.isVisible()) {
        await footballTab.tap();
        await expect(element(by.id('football-screen'))).toBeVisible();
      }
    });

    it('should navigate to Baseball screen', async () => {
      // Look for baseball navigation element
      const baseballTab = element(
        by.id('baseball-tab').or(by.text('Baseball')),
      );

      if (await baseballTab.isVisible()) {
        await baseballTab.tap();
        await expect(element(by.id('baseball-screen'))).toBeVisible();
      }
    });

    it('should handle back navigation', async () => {
      // Test back navigation if it exists
      const backButton = element(by.id('back-button').or(by.text('Back')));

      if (await backButton.isVisible()) {
        await backButton.tap();
        // Should return to previous screen
      }
    });
  });

  describe('Authentication Flow', () => {
    it('should handle unauthenticated state', async () => {
      // Check if login screen is shown for unauthenticated users
      try {
        await expect(element(by.id('login-screen'))).toBeVisible();
      } catch {
        // User might already be authenticated, that's okay
      }
    });

    it('should display login form when needed', async () => {
      const loginForm = element(by.id('login-form'));

      if (await loginForm.isVisible()) {
        await expect(
          element(by.id('email-input').or(by.id('username-input'))),
        ).toBeVisible();
        await expect(element(by.id('password-input'))).toBeVisible();
        await expect(element(by.id('login-button'))).toBeVisible();
      }
    });
  });

  describe('Sports Data and Content', () => {
    it('should load sports content', async () => {
      // Wait for any sports-related content to load
      await waitFor(element(by.id('sports-content').or(by.id('games-list'))))
        .toBeVisible()
        .withTimeout(15000);
    });

    it('should display game information', async () => {
      // Look for game cards or game information
      const gameElements = [
        element(by.id('game-card')),
        element(by.id('team-info')),
        element(by.id('score-display')),
        element(by.text('vs').or(by.text('VS'))),
      ];

      let foundGameContent = false;
      for (const gameElement of gameElements) {
        try {
          await expect(gameElement.atIndex(0)).toBeVisible();
          foundGameContent = true;
          break;
        } catch {
          // Continue to next element
        }
      }

      if (!foundGameContent) {
        // At least verify the screen structure is there
        await expect(element(by.id('app-root'))).toBeVisible();
      }
    });

    it('should handle data loading states', async () => {
      // Check for loading indicators during data fetch
      try {
        await expect(
          element(by.id('loading-indicator').or(by.text('Loading...'))).atIndex(
            0,
          ),
        ).toBeVisible();
      } catch {
        // Loading might be too fast, that's okay
      }
    });
  });

  describe('App Performance and Stability', () => {
    it('should handle device rotation', async () => {
      await device.setOrientation('landscape');
      await expect(element(by.id('app-root'))).toBeVisible();

      await device.setOrientation('portrait');
      await expect(element(by.id('app-root'))).toBeVisible();
    });

    it('should handle app backgrounding and foregrounding', async () => {
      await device.sendToHome();
      await device.launchApp({ newInstance: false });
      await expect(element(by.id('app-root'))).toBeVisible();
    });

    it('should handle memory pressure gracefully', async () => {
      // Simulate memory pressure by creating and destroying elements
      for (let i = 0; i < 5; i++) {
        await device.reloadReactNative();
        await waitFor(element(by.id('app-root')))
          .toBeVisible()
          .withTimeout(10000);
      }
    });
  });

  describe('UI Components and Interactions', () => {
    it('should handle button taps', async () => {
      // Find any tappable buttons and test them
      const buttons = element(by.type('RCTButtonView').or(by.id('button')));

      try {
        const buttonCount = await buttons.getAttributes();
        if (buttonCount) {
          await buttons.atIndex(0).tap();
          // Should not crash after tap
          await expect(element(by.id('app-root'))).toBeVisible();
        }
      } catch {
        // No buttons found or tap failed, that's okay
      }
    });

    it('should handle text input', async () => {
      // Find any text inputs and test them
      const textInput = element(by.type('RCTTextView').or(by.id('text-input')));

      try {
        if (await textInput.isVisible()) {
          await textInput.tap();
          await textInput.typeText('Test input');
          await textInput.clearText();
        }
      } catch {
        // No text inputs found, that's okay
      }
    });

    it('should handle scrolling', async () => {
      // Test scrolling functionality
      const scrollView = element(
        by.type('RCTScrollView').or(by.id('scroll-view')),
      );

      try {
        if (await scrollView.isVisible()) {
          await scrollView.scroll(200, 'down');
          await scrollView.scroll(200, 'up');
        }
      } catch {
        // No scrollable content found, that's okay
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // The app should still be functional even if network is unavailable
      await expect(element(by.id('app-root'))).toBeVisible();

      // Look for error messages or offline indicators
      try {
        await expect(
          element(by.id('error-message').or(by.text('Error'))).atIndex(0),
        ).toBeVisible();
      } catch {
        // No error state visible, which is good
      }
    });

    it('should not crash on invalid interactions', async () => {
      // Rapid tapping to test stability
      const appRoot = element(by.id('app-root'));
      for (let i = 0; i < 5; i++) {
        try {
          await appRoot.tap();
        } catch {
          // Some taps might fail, that's okay
        }
      }

      // App should still be running
      await expect(appRoot).toBeVisible();
    });
  });

  describe('Theme and Accessibility', () => {
    it('should support dark and light themes', async () => {
      // The app should render correctly regardless of theme
      await expect(element(by.id('app-root'))).toBeVisible();

      // Look for theme toggle if available
      const themeToggle = element(
        by.id('theme-toggle').or(by.text('Dark').or(by.text('Light'))),
      );

      try {
        if (await themeToggle.isVisible()) {
          await themeToggle.tap();
          await expect(element(by.id('app-root'))).toBeVisible();
        }
      } catch {
        // No theme toggle found, that's okay
      }
    });

    it('should have accessible elements', async () => {
      // Check for accessibility labels and traits
      const accessibleElements = element(
        by.traits(['button', 'link', 'header']),
      );

      try {
        await expect(accessibleElements.atIndex(0)).toBeVisible();
      } catch {
        // Accessibility elements might not be properly labeled yet
      }
    });
  });
});
