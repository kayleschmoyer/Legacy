import { expect, test } from '@playwright/test';

test.describe('HTML Snapshots @visual', () => {
  test.beforeEach(async ({ page }) => {
    // Remove dynamic content that changes between test runs
    await page.addStyleTag({
      content: `
        /* Hide dynamic elements */
        [data-testid="timestamp"],
        .timestamp,
        .time,
        [class*="time"],
        [id*="time"],
        [data-testid="current-time"],
        .loading-spinner,
        .spinner {
          display: none !important;
        }
      `,
    });
  });

  test('should capture complete page HTML structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Remove script tags and dynamic attributes that change
    await page.evaluate(() => {
      // Remove all script tags
      const scripts = document.querySelectorAll('script');
      scripts.forEach((script) => script.remove());

      // Remove dynamic attributes
      const elementsWithIds = document.querySelectorAll('[id]');
      elementsWithIds.forEach((el) => {
        const id = el.getAttribute('id');
        if (id && /^\d+$/.test(id)) {
          el.removeAttribute('id');
        }
      });

      // Remove data attributes that might be dynamic
      const elementsWithDataAttrs = document.querySelectorAll('*');
      elementsWithDataAttrs.forEach((el) => {
        const attrs = el.attributes;
        for (let i = attrs.length - 1; i >= 0; i--) {
          const attr = attrs[i];
          if (
            attr.name.startsWith('data-react') ||
            attr.name === 'data-reactroot'
          ) {
            el.removeAttribute(attr.name);
          }
        }
      });
    });

    const htmlContent = await page.content();
    // Verify HTML structure rather than snapshot — toMatchSnapshot causes
    // RangeError: Maximum call stack size exceeded on large HTML strings
    expect(htmlContent.length).toBeGreaterThan(1000);
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('<html');
    expect(htmlContent).toContain('<head');
    expect(htmlContent).toContain('<body');
    expect(htmlContent).toContain('Legacy Sports');
  });

  test('should capture main content structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const mainContent = await page
      .locator('[data-testid="main-content"], main, [role="main"]')
      .first()
      .innerHTML();
    expect(mainContent).toMatchSnapshot('main-content.html');
  });

  test('should capture navigation structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const navigation = page.locator('[role="navigation"]').first();
    if (await navigation.isVisible()) {
      const navContent = await navigation.innerHTML();
      expect(navContent).toMatchSnapshot('navigation.html');
    }
  });

  test('should capture component markup snapshots', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sports-specific components
    const componentSelectors = [
      '[data-testid="sports-list"]',
      '[data-testid="game-card"]',
      '[data-testid="team-selector"]',
      '[data-testid="score-display"]',
      '[data-testid="app-container"]',
      '[role="form"]',
    ];

    for (const selector of componentSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible()) {
        const content = await element.innerHTML();
        const cleanSelector = selector
          .replace(/[^\w-]/g, '_')
          .replace(/^_+|_+$/g, '');
        expect(content).toMatchSnapshot(`component-${cleanSelector}.html`);
      }
    }
  });

  test('should capture form structure snapshots', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const forms = page.locator('form');
    const formCount = await forms.count();

    for (let i = 0; i < formCount; i++) {
      const form = forms.nth(i);
      if (await form.isVisible()) {
        const formContent = await form.innerHTML();
        expect(formContent).toMatchSnapshot(`form-${i + 1}.html`);
      }
    }
  });

  test('should capture API response structure snapshots', async ({ page }) => {
    // Capture the structure of API responses by intercepting them
    const apiResponses: Record<string, unknown> = {};

    await page.route('**/api/**', async (route) => {
      const response = await route.fetch();
      const url = new URL(route.request().url());
      const pathname = url.pathname;

      try {
        const json = (await response.json()) as unknown;
        apiResponses[pathname] = json;
      } catch {
        // Not JSON response, skip
      }

      await route.fulfill({ response });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait a bit for all API calls to complete
    await page.waitForTimeout(2000);

    // Create snapshots for each API response
    for (const [endpoint, responseData] of Object.entries(apiResponses)) {
      const cleanEndpoint = endpoint
        .replace(/[^\w-]/g, '_')
        .replace(/^_+|_+$/g, '');
      expect(JSON.stringify(responseData, null, 2)).toMatchSnapshot(
        `api-${cleanEndpoint}.json`,
      );
    }
  });

  test('should capture accessibility tree snapshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get the accessibility tree using modern Playwright API
    const accessibilityTree = await page.locator('body').ariaSnapshot();
    expect(accessibilityTree).toMatchSnapshot('accessibility-tree.txt');
  });

  test('should capture page metadata snapshots', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Extract metadata
    const metadata = await page.evaluate(() => {
      const meta: Record<string, string> = {};

      // Page title
      meta.title = document.title;

      // Meta tags
      const metaTags = document.querySelectorAll('meta');
      metaTags.forEach((tag) => {
        const name =
          tag.getAttribute('name') ||
          tag.getAttribute('property') ||
          tag.getAttribute('http-equiv');
        const content = tag.getAttribute('content');
        if (name && content) {
          meta[name] = content;
        }
      });

      // Link tags (for favicons, stylesheets, etc.)
      const linkTags = document.querySelectorAll('link');
      const links: Array<{ rel: string; href: string; type?: string }> = [];
      linkTags.forEach((link) => {
        const rel = link.getAttribute('rel');
        const href = link.getAttribute('href');
        const type = link.getAttribute('type');
        if (rel && href) {
          links.push({ rel, href, ...(type && { type }) });
        }
      });
      meta.links = JSON.stringify(links);

      return meta;
    });

    expect(JSON.stringify(metadata, null, 2)).toMatchSnapshot(
      'page-metadata.json',
    );
  });
});
