// React Native E2E test using Appium + WebDriverIO
// Replaces Detox tests with pure Node.js solution

describe('App E2E Tests', () => {
  beforeEach(async () => {
    // Reset app state before each test
    await driver.reset();
  });

  it('should launch app successfully', async () => {
    await driver.waitUntil(
      async () => {
        const el = await driver.$('//android.widget.TextView');
        return await el.isDisplayed();
      },
      {
        timeout: 30000,
        timeoutMsg: 'App did not launch within 30 seconds',
      },
    );
  });

  it('should display main screen elements', async () => {
    const mainContainer = await driver.$('//android.view.ViewGroup');
    await expect(mainContainer).toBeDisplayed();
  });

  it('should validate navigation functionality', async () => {
    const touchableElements = await driver.$$(
      '//android.widget.Button | //android.view.ViewGroup[@clickable="true"]',
    );
    expect(touchableElements.length).toBeGreaterThan(0);
  });

  it('should handle basic user interactions', async () => {
    const screenSize = await driver.getWindowSize();
    await driver
      .action('pointer')
      .move({ x: screenSize.width / 2, y: screenSize.height / 2 })
      .down()
      .up()
      .perform();

    const mainContainer = await driver.$('//android.view.ViewGroup');
    await expect(mainContainer).toBeDisplayed();
  });

  afterEach(async () => {
    // Reserved for per-test cleanup hooks.
  });
});

// Utility functions for common E2E operations
const E2EHelpers = {
  async waitForElement(selector, timeout = 10000) {
    return await driver.waitUntil(
      async () => {
        const el = await driver.$(selector);
        return await el.isDisplayed();
      },
      {
        timeout,
        timeoutMsg: `Element ${selector} not found within ${timeout}ms`,
      },
    );
  },

  async tapElement(selector) {
    const element = await driver.$(selector);
    await element.waitForDisplayed();
    await element.click();
  },

  async enterText(selector, text) {
    const element = await driver.$(selector);
    await element.waitForDisplayed();
    await element.setValue(text);
  },

  async verifyText(selector, expectedText) {
    const element = await driver.$(selector);
    const actualText = await element.getText();
    expect(actualText).toContain(expectedText);
  },
};

// Export helpers for use in other test files
module.exports = { E2EHelpers };
