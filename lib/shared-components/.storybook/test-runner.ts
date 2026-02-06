/** @type {import('@storybook/test-runner').TestRunnerConfig} */
const config = {
  async preVisit(page) {
    await page.setViewportSize({ width: 1200, height: 800 });
  },

  async postVisit(page, context) {
    const elementHandle = await page.$('#storybook-root');
    const innerHTML = elementHandle ? await elementHandle.innerHTML() : '';

    if (!innerHTML || innerHTML.includes('Story not found')) {
      throw new Error(`Story ${context.id} failed to render`);
    }

    const logs = await page.evaluate(() => {
      // @ts-expect-error - test harness may inject this
      return window.__STORYBOOK_TEST_LOGS__ || [];
    });

    const errors = logs.filter(
      /** @param {{ level?: string; message?: string }} log */ (log) =>
        log?.level === 'error' &&
        !log?.message?.includes('deprecated') &&
        !log?.message?.includes('CJS build of Vite'),
    );

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`Console errors in story ${context.id}:`, errors);
    }
  },

  tags: {
    include: ['test', 'autodocs'],
    exclude: ['broken', 'skip-test'],
  },
};

module.exports = config;
