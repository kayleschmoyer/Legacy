import { test } from '@playwright/test';
import { resetMocks } from '../mocks/server';

// Setup hooks for Playwright tests
test.beforeEach(() => {
  resetMocks();
});

test.afterEach(() => {
  resetMocks();
});
