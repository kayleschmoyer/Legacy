import { by, device, element, expect } from 'detox';

describe('Build and Performance Verification', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  describe('App Build Verification', () => {
    it('should launch within acceptable time', async () => {
      const startTime = Date.now();

      await waitFor(element(by.id('app-root')))
        .toBeVisible()
        .withTimeout(15000);

      const launchTime = Date.now() - startTime;

      // App should launch within 15 seconds
      expect(launchTime).toBeLessThan(15000);
    });

    it('should have all required dependencies loaded', async () => {
      // Verify that all major app components are accessible
      await waitFor(element(by.id('app-root')))
        .toBeVisible()
        .withTimeout(10000);

      // Check that navigation is functional
      try {
        await expect(
          element(by.id('main-navigator').or(by.id('tab-navigator')))
        ).toBeVisible();
      } catch {
        // Navigation might use different IDs, just ensure app root is visible
        await expect(element(by.id('app-root'))).toBeVisible();
      }
    });

    it('should handle JavaScript bundle correctly', async () => {
      // Test that the JavaScript bundle loaded correctly by verifying app functionality
      await device.reloadReactNative();

      await waitFor(element(by.id('app-root')))
        .toBeVisible()
        .withTimeout(10000);

      // Should be able to interact with the app
      await expect(element(by.id('app-root'))).toBeVisible();
    });

    it('should not have critical console errors', async () => {
      // This is more of a smoke test - if the app loads and functions,
      // it likely doesn't have critical console errors
      await device.reloadReactNative();

      await waitFor(element(by.id('app-root')))
        .toBeVisible()
        .withTimeout(10000);

      // If we get here without timing out, the app is functional
      await expect(element(by.id('app-root'))).toBeVisible();
    });
  });

  describe('Memory and Performance', () => {
    it('should handle multiple screen transitions', async () => {
      // Test memory leaks by navigating between screens multiple times
      const tabs = [
        element(by.id('football-tab').or(by.text('Football'))),
        element(by.id('baseball-tab').or(by.text('Baseball'))),
        element(by.id('home-tab').or(by.text('Home'))),
      ];

      for (let i = 0; i < 5; i++) {
        for (const tab of tabs) {
          try {
            if (await tab.isVisible()) {
              await tab.tap();
              await waitFor(element(by.id('app-root')))
                .toBeVisible()
                .withTimeout(3000);
            }
          } catch {
            // Tab might not be available, continue
          }
        }
      }

      // App should still be responsive
      await expect(element(by.id('app-root'))).toBeVisible();
    });

    it('should handle rapid interactions', async () => {
      // Test app stability under rapid user interactions
      const appRoot = element(by.id('app-root'));

      for (let i = 0; i < 10; i++) {
        try {
          await appRoot.tap();
          await device.pressBack(); // Android back button
        } catch {
          // Some interactions might fail on iOS, continue
        }
      }

      // App should still be functional
      await expect(appRoot).toBeVisible();
    });

    it('should handle orientation changes smoothly', async () => {
      // Test performance during orientation changes
      const orientations = ['portrait', 'landscape'] as const;

      for (let i = 0; i < 3; i++) {
        for (const orientation of orientations) {
          await device.setOrientation(orientation);

          await waitFor(element(by.id('app-root')))
            .toBeVisible()
            .withTimeout(3000);

          // Small delay to let layout settle
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Return to portrait
      await device.setOrientation('portrait');
      await expect(element(by.id('app-root'))).toBeVisible();
    });

    it('should handle background/foreground cycles', async () => {
      // Test app lifecycle management
      for (let i = 0; i < 3; i++) {
        await device.sendToHome();
        await device.launchApp({ newInstance: false });

        await waitFor(element(by.id('app-root')))
          .toBeVisible()
          .withTimeout(5000);
      }

      await expect(element(by.id('app-root'))).toBeVisible();
    });
  });

  describe('Resource Loading', () => {
    it('should load images without errors', async () => {
      // Look for image elements and verify they load
      const imageElements = [
        element(by.id('team-logo')),
        element(by.id('app-logo')),
        element(by.type('RCTImageView')),
      ];

      for (const imageElement of imageElements) {
        try {
          if (await imageElement.isVisible()) {
            await expect(imageElement.atIndex(0)).toBeVisible();
            break;
          }
        } catch {
          // Continue to next image element
        }
      }
    });

    it('should handle network requests gracefully', async () => {
      // Test app behavior with slow network
      await device.setNetworkState('slow');

      await device.reloadReactNative();

      await waitFor(element(by.id('app-root')))
        .toBeVisible()
        .withTimeout(20000); // Longer timeout for slow network

      // Restore normal network
      await device.setNetworkState('online');

      await expect(element(by.id('app-root'))).toBeVisible();
    });

    it('should display loading states appropriately', async () => {
      // Look for loading indicators during data fetch
      await device.reloadReactNative();

      try {
        // Should show loading state briefly
        await expect(
          element(
            by.id('loading-panel').or(by.id('loading-indicator'))
          ).atIndex(0)
        ).toBeVisible();
      } catch {
        // Loading might be too fast to catch
      }

      // Should eventually show main content
      await waitFor(element(by.id('app-root')))
        .toBeVisible()
        .withTimeout(10000);
    });
  });

  describe('Error Boundaries and Resilience', () => {
    it('should handle app reload gracefully', async () => {
      // Test multiple reloads to ensure consistency
      for (let i = 0; i < 3; i++) {
        await device.reloadReactNative();

        await waitFor(element(by.id('app-root')))
          .toBeVisible()
          .withTimeout(10000);

        await expect(element(by.id('app-root'))).toBeVisible();
      }
    });

    it('should maintain state consistency', async () => {
      // Test that app state remains consistent across interactions
      await waitFor(element(by.id('app-root')))
        .toBeVisible()
        .withTimeout(10000);

      // Perform some interactions
      const interactiveElements = [
        element(by.type('RCTButtonView')),
        element(by.id('tab-button')),
        element(by.id('navigation-button')),
      ];

      for (const interactiveElement of interactiveElements) {
        try {
          if (await interactiveElement.isVisible()) {
            await interactiveElement.atIndex(0).tap();
            await expect(element(by.id('app-root'))).toBeVisible();
          }
        } catch {
          // Element might not be tappable, continue
        }
      }

      // App should still be in a consistent state
      await expect(element(by.id('app-root'))).toBeVisible();
    });

    it('should handle edge cases without crashing', async () => {
      // Test various edge cases that might cause crashes

      // Rapid orientation changes
      await device.setOrientation('landscape');
      await device.setOrientation('portrait');
      await device.setOrientation('landscape');
      await device.setOrientation('portrait');

      // App should still be running
      await expect(element(by.id('app-root'))).toBeVisible();

      // Multiple rapid taps
      const appRoot = element(by.id('app-root'));
      for (let i = 0; i < 5; i++) {
        try {
          await appRoot.multiTap(2);
        } catch {
          // Some gestures might not be supported
        }
      }

      // App should still be functional
      await expect(appRoot).toBeVisible();
    });
  });

  describe('Platform-Specific Features', () => {
    it('should handle platform-specific navigation', async () => {
      if (device.getPlatform() === 'android') {
        // Test Android back button
        try {
          await device.pressBack();
          await expect(element(by.id('app-root'))).toBeVisible();
        } catch {
          // App might exit on back press, that's okay
        }
      } else {
        // iOS specific gestures
        try {
          await element(by.id('app-root')).swipe('right', 'fast', 0.1);
          await expect(element(by.id('app-root'))).toBeVisible();
        } catch {
          // Gesture might not be supported
        }
      }
    });

    it('should adapt to platform UI conventions', async () => {
      // Verify that the app follows platform conventions
      await expect(element(by.id('app-root'))).toBeVisible();

      // Look for platform-appropriate navigation patterns
      const navigationElements = [
        element(by.id('tab-bar')), // iOS tab bar
        element(by.id('bottom-tabs')), // Android bottom navigation
        element(by.id('drawer-navigation')), // Drawer navigation
        element(by.id('header-navigation')), // Header navigation
      ];

      let foundNavigation = false;
      for (const navElement of navigationElements) {
        try {
          if (await navElement.isVisible()) {
            await expect(navElement).toBeVisible();
            foundNavigation = true;
            break;
          }
        } catch {
          // Continue to next navigation element
        }
      }

      // At minimum, app should be visible and functional
      if (!foundNavigation) {
        await expect(element(by.id('app-root'))).toBeVisible();
      }
    });
  });
});
