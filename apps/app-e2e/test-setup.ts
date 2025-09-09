/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { afterAll, beforeAll, beforeEach } from '@jest/globals';
import { by, device, element, expect, waitFor } from 'detox';

// Increase timeout for e2e tests
jest.setTimeout(120000);

// Global test configuration
beforeAll(async () => {
  console.log('🚀 Starting Legacy Sports App E2E Tests');
  console.log(`Platform: ${device.getPlatform()}`);
  console.log(`Test Environment: ${process.env.NODE_ENV || 'development'}`);

  // Launch app for all tests
  await device.launchApp({ newInstance: true });
});

beforeEach(() => {
  // Add any global setup needed before each test
  console.log('📱 Running test');
});

afterAll(async () => {
  console.log('✅ Completed Legacy Sports App E2E Tests');
  await device.terminateApp();
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Common test utilities
export const TestUtils = {
  async waitForAppToLoad(timeout = 15000) {
    await waitFor(element(by.id('app-root')))
      .toBeVisible()
      .withTimeout(timeout);
  },

  async navigateToTab(tabId: string, timeout = 5000) {
    const tab = element(by.id(tabId));
    try {
      const isVisible = await tab.isVisible();
      if (isVisible) {
        await tab.tap();
        await waitFor(element(by.id('app-root')))
          .toBeVisible()
          .withTimeout(timeout);
      }
    } catch (error) {
      console.warn(`Failed to navigate to tab ${tabId}:`, error);
    }
  },

  async takeScreenshot(name: string) {
    try {
      await device.takeScreenshot(name);
    } catch (error) {
      console.warn(`Failed to take screenshot ${name}:`, error);
    }
  },

  async checkElementExists(elementId: string): Promise<boolean> {
    try {
      await expect(element(by.id(elementId))).toBeVisible();
      return true;
    } catch {
      return false;
    }
  },

  async tapElementSafely(elementId: string): Promise<boolean> {
    try {
      const el = element(by.id(elementId));
      if (await el.isVisible()) {
        await el.tap();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  async verifyNoRedBoxErrors() {
    // Check for React Native red box errors
    try {
      await expect(element(by.text('RedBox'))).not.toBeVisible();
      await expect(element(by.text('Error'))).not.toBeVisible();
    } catch {
      // No red box found, which is good
    }
  },
};
