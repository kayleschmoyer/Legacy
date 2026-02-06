/** @type {import('@storybook/test-runner').TestRunnerConfig} */
const config = {
  async preVisit(page) {
    await page.setViewportSize({ width: 1200, height: 800 });
  },

  async postVisit(page, context) {
    // Give the preview a moment to paint after navigation.
    await page.waitForTimeout(300);

    const state = await page.evaluate(() => {
      const root = document.getElementById('storybook-root');
      const docs = document.getElementById('storybook-docs');

      const isDisplayed = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };

      const hasPaintedBox = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0'
        ) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const anyAppContentVisible = () => {
        const ignoredIds = new Set(['storybook-root', 'storybook-docs']);
        const ignoredTags = new Set([
          'SCRIPT',
          'STYLE',
          'LINK',
          'META',
          'HEAD',
        ]);

        const all = document.body
          ? Array.from(document.body.querySelectorAll('*')).slice(0, 2000)
          : [];

        return all.some((el) => {
          if (!(el instanceof HTMLElement)) return false;
          if (ignoredIds.has(el.id)) return false;
          if (ignoredTags.has(el.tagName)) return false;
          return hasPaintedBox(el);
        });
      };

      const rootText = root?.innerText ?? '';
      const docsText = docs?.innerText ?? '';
      const bodyText = document.body?.innerText ?? '';

      const previewErrors = [
        'Story not found',
        'This story threw an error',
        'Failed to render',
        'No story to display',
      ];

      const hasPreviewError = previewErrors.some((needle) =>
        bodyText.includes(needle),
      );

      return {
        rootDisplayed: isDisplayed(root),
        docsDisplayed: isDisplayed(docs),
        anyAppContentVisible: anyAppContentVisible(),
        rootHasStoryNotFound: rootText.includes('Story not found'),
        docsHasStoryNotFound: docsText.includes('Story not found'),
        hasPreviewError,
        rootRect: root?.getBoundingClientRect
          ? {
              width: root.getBoundingClientRect().width,
              height: root.getBoundingClientRect().height,
            }
          : null,
        docsRect: docs?.getBoundingClientRect
          ? {
              width: docs.getBoundingClientRect().width,
              height: docs.getBoundingClientRect().height,
            }
          : null,
      };
    });

    if (state.rootHasStoryNotFound || state.docsHasStoryNotFound) {
      throw new Error(`Story ${context.id} not found`);
    }

    if (state.hasPreviewError) {
      throw new Error(`Story ${context.id} had a preview error`);
    }

    if (
      !state.rootDisplayed &&
      !state.docsDisplayed &&
      !state.anyAppContentVisible
    ) {
      throw new Error(
        `Story ${context.id} did not become visible (rootRect=${JSON.stringify(
          state.rootRect,
        )}, docsRect=${JSON.stringify(state.docsRect)})`,
      );
    }

    const logs = await page.evaluate(() => {
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
