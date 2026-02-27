/** @type {import('@storybook/test-runner').TestRunnerConfig} */
const { getStoryContext } = require('@storybook/test-runner');
const { injectAxe } = require('axe-playwright');

const config = {
  async preVisit(page) {
    await page.setViewportSize({ width: 1200, height: 800 });
    // Inject axe-core into the page so we can run accessibility audits in postVisit.
    await injectAxe(page);
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

    // ── Accessibility audit ──────────────────────────────────────────────────
    // Get per-story a11y parameters (set in story's parameters.a11y).
    const storyContext = await getStoryContext(page, context);

    if (!storyContext.parameters?.a11y?.disabled) {
      const axeConfig = storyContext.parameters?.a11y?.config ?? {};

      /**
       * @type {{ violations: Array<{id: string, impact: string, description: string, nodes: Array<{html: string}>}> }}
       */
      const axeResults = await page.evaluate(async (cfg) => {
        if (!window.axe) return { violations: [] };
        try {
          const results = await window.axe.run(
            document.getElementById('storybook-root') ?? document,
            cfg,
          );
          return { violations: results.violations };
        } catch (_err) {
          return { violations: [] };
        }
      }, axeConfig);

      // Gate CI on critical and serious violations only.
      // Moderate / minor are logged as warnings but do not fail the test run.
      const blocking = axeResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );

      const nonBlocking = axeResults.violations.filter(
        (v) => v.impact !== 'critical' && v.impact !== 'serious',
      );

      if (nonBlocking.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[a11y] ${nonBlocking.length} moderate/minor violation(s) in story "${context.id}" (not blocking CI):`,
          nonBlocking.map((v) => `${v.id} (${v.impact})`).join(', '),
        );
      }

      if (blocking.length > 0) {
        const report = blocking
          .map((v) => {
            const nodeSnippets = v.nodes
              .slice(0, 3)
              .map((n) => `    ${n.html}`)
              .join('\n');
            return `  [${v.impact.toUpperCase()}] ${v.id}: ${v.description}\n${nodeSnippets}`;
          })
          .join('\n\n');

        throw new Error(
          `Found ${blocking.length} critical/serious a11y violation(s) in story "${context.id}":\n\n${report}\n\nFix these or add parameters.a11y.disabled = true to the story to skip.`,
        );
      }
    }
  },

  tags: {
    include: ['test', 'autodocs'],
    exclude: ['broken', 'skip-test'],
  },
};

module.exports = config;
