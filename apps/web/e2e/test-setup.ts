import { test as base } from '@playwright/test';
import { closeMocks, resetMocks } from './mocks/server';

// Extend the base test with MSW setup
export const test = base.extend({
  // Setup MSW for each test
  page: async ({ page }, use) => {
    // Intercept console errors and warnings
    const messages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        messages.push(`${msg.type()}: ${msg.text()}`);
      }
    });

    // Intercept network requests to ensure they're mocked
    page.on('request', (request) => {
      const url = request.url();
      // Allow requests to our local dev server and static assets
      if (
        url.startsWith('http://localhost:4200') ||
        url.includes('.js') ||
        url.includes('.css') ||
        url.includes('.ico') ||
        url.includes('.png') ||
        url.includes('.svg')
      ) {
        return;
      }

      // Log external requests that should be mocked
      if (!url.includes('localhost')) {
        console.warn(`External request detected: ${url}`);
      }
    });

    await use(page);

    // Check for console errors after test
    if (messages.length > 0) {
      console.warn('Console messages during test:', messages);
    }
  },
});

// Setup global test hooks
test.beforeAll(async () => {
  // MSW server is already started in server.ts
});

test.beforeEach(async () => {
  // Reset MSW handlers before each test
  resetMocks();
});

test.afterAll(async () => {
  // Close MSW server after all tests
  closeMocks();
});

export { expect } from '@playwright/test';
