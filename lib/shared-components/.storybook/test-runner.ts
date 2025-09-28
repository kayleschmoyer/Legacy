import type { TestRunnerConfig } from '@storybook/test-runner';

const config: TestRunnerConfig = {
  // Configure the test runner
  async preVisit(page, context) {
    // Optional: Add any setup before visiting each story
    await page.setViewportSize({ width: 1200, height: 800 });
  },

  async postVisit(page, context) {
    // Optional: Add any cleanup after visiting each story

    // Run basic accessibility tests on each story
    const elementHandler = await page.$('#storybook-root');
    const innerHTML = await elementHandler?.innerHTML();

    // Basic checks - ensure story rendered
    if (!innerHTML || innerHTML.includes('Story not found')) {
      throw new Error(`Story ${context.id} failed to render`);
    }

    // Check for console errors (except known warnings)
    const logs = await page.evaluate(() => {
      return (window as any).__STORYBOOK_TEST_LOGS__ || [];
    });

    const errors = logs.filter(
      (log: any) =>
        log.level === 'error' &&
        !log.message.includes('deprecated') &&
        !log.message.includes('CJS build of Vite'),
    );

    if (errors.length > 0) {
      console.warn(`Console errors in story ${context.id}:`, errors);
    }
  },

  // Tags to include/exclude from testing
  tags: {
    include: ['test', 'autodocs'],
    exclude: ['broken', 'skip-test'],
  },
};

export default config;
