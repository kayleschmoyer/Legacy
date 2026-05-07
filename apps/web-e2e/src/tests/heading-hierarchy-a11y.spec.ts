/**
 * Heading Hierarchy Accessibility E2E Suite (LS-2226)
 *
 * Covers:
 *  - Each major page has exactly one h1 element
 *  - Heading levels descend properly (h1 → h2 → h3, no skipped levels)
 *  - H1 text is meaningful (not empty)
 *  - H1 is the first heading on the page
 *
 * Pages tested:
 *  - /about (static, no auth required)
 *  - /help (static)
 *  - /baseball/league/1/overview (data-driven, auth required)
 *  - / (home page)
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for React.lazy() page content to mount inside the main content area.
 * The app wraps all routes in `<Suspense fallback={null}>`, so after
 * navigation the main-content div may be empty until the lazy chunk loads.
 */
async function waitForPageContent(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const main = document.getElementById('main-content');
      return main && main.children.length > 0;
    },
    { timeout: 15_000 },
  );
}

/**
 * Get all heading elements from a page and validate hierarchy.
 * Returns {h1Count, headings, issues}
 */
async function getHeadingHierarchy(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const headingSelectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    const headings = Array.from(
      document.querySelectorAll(headingSelectors.join(', ')),
    )
      // Exclude headings inside modal dialogs — they have their own
      // heading hierarchy and should not affect the page-level check.
      .filter((el) => !el.closest('[role="dialog"], dialog'))
      .map((el) => ({
        level: parseInt(el.tagName.charAt(1), 10),
        text: el.textContent?.trim().substring(0, 100) ?? '',
      }));

    const issues: string[] = [];
    let prevLevel = 0;

    for (const heading of headings) {
      if (prevLevel > 0 && heading.level > prevLevel + 1) {
        issues.push(
          `Skipped heading level: h${prevLevel} → h${heading.level} ("${heading.text}")`,
        );
      }
      prevLevel = heading.level;
    }

    const h1Count = headings.filter((h) => h.level === 1).length;

    return { h1Count, headings, issues };
  });
}

// ---------------------------------------------------------------------------
// 1. /about page
// ---------------------------------------------------------------------------

test.describe('Heading hierarchy — /about @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');
    await waitForPageContent(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('About page has exactly one h1', async ({ page }) => {
    const { h1Count } = await getHeadingHierarchy(page);
    expect(h1Count).toBe(1);
  });

  test('About page heading levels do not skip', async ({ page }) => {
    const { issues } = await getHeadingHierarchy(page);
    expect(issues).toHaveLength(0);
  });

  test('About page h1 text is not empty', async ({ page }) => {
    const { headings } = await getHeadingHierarchy(page);
    const h1 = headings.find((h) => h.level === 1);
    expect(h1).toBeDefined();
    expect(h1?.text.length).toBeGreaterThan(0);
  });

  test('About page h1 is the first heading on the page', async ({ page }) => {
    const { headings } = await getHeadingHierarchy(page);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].level).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. /help page
// ---------------------------------------------------------------------------

test.describe('Heading hierarchy — /help @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('load');
    await waitForPageContent(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('Help page has exactly one h1', async ({ page }) => {
    const { h1Count } = await getHeadingHierarchy(page);
    expect(h1Count).toBe(1);
  });

  test('Help page heading levels do not skip', async ({ page }) => {
    const { issues } = await getHeadingHierarchy(page);
    expect(issues).toHaveLength(0);
  });

  test('Help page h1 text is not empty', async ({ page }) => {
    const { headings } = await getHeadingHierarchy(page);
    const h1 = headings.find((h) => h.level === 1);
    expect(h1).toBeDefined();
    expect(h1?.text.length).toBeGreaterThan(0);
  });

  test('Help page h1 is the first heading on the page', async ({ page }) => {
    const { headings } = await getHeadingHierarchy(page);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].level).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. /baseball/league/1/overview (authenticated, data-driven)
// ---------------------------------------------------------------------------

test.describe('Heading hierarchy — /baseball/league/1/overview @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('networkidle');
    await waitForPageContent(page);
    // waitForPageContent is satisfied by the loading spinner inside #main-content.
    // For data-driven pages, we must also wait for the league title h1 to render
    // with actual text before any heading-hierarchy assertions run (LS-3593).
    // Additionally confirm it is the FIRST non-dialog heading in the document
    // so that the "h1 is the first heading" assertion is deterministic (LS-3594).
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="league-title"]');
        if (!el || (el.textContent?.trim().length ?? 0) === 0) return false;
        // Confirm league-title h1 is the first heading outside any dialog.
        const headings = Array.from(
          document.querySelectorAll('h1, h2, h3, h4, h5, h6'),
        ).filter((h) => !h.closest('[role="dialog"], dialog'));
        return headings[0] === el;
      },
      { timeout: 15_000 },
    );
  });

  test('League overview page has exactly one h1 after data loads', async ({
    page,
  }) => {
    const { h1Count } = await getHeadingHierarchy(page);
    expect(h1Count).toBe(1);
  });

  test('League overview page heading hierarchy is valid', async ({ page }) => {
    const { issues } = await getHeadingHierarchy(page);
    expect(issues).toHaveLength(0);
  });

  test('League overview page h1 text is not empty', async ({ page }) => {
    const { headings } = await getHeadingHierarchy(page);
    const h1 = headings.find((h) => h.level === 1);
    expect(h1).toBeDefined();
    expect(h1?.text.length).toBeGreaterThan(0);
  });

  test('League overview page h1 is the first heading on the page', async ({
    page,
  }) => {
    const { headings } = await getHeadingHierarchy(page);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].level).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. / (home page)
// ---------------------------------------------------------------------------

test.describe('Heading hierarchy — / (home) @regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    await waitForPageContent(page);
    // The home page has two async layers before any h1 renders:
    //   1. React.lazy() — defers chunk load past the Suspense fallback
    //   2. getUserLeagueSummaries query — loading state delays the h1
    // waitForPageContent() is satisfied by the Suspense fallback, so we
    // must also wait for the actual h1 to appear (mirrors the league-overview
    // fix from LS-3593 / LS-3594).
    await page.waitForFunction(
      () => {
        const h1 = Array.from(document.querySelectorAll('h1')).find(
          (el) => !el.closest('[role="dialog"], dialog'),
        );
        return h1 !== undefined && (h1.textContent?.trim().length ?? 0) > 0;
      },
      { timeout: 15_000 },
    );
  });

  test('Home page has exactly one h1', async ({ page }) => {
    const { h1Count } = await getHeadingHierarchy(page);
    expect(h1Count).toBe(1);
  });

  test('Home page heading levels do not skip', async ({ page }) => {
    const { issues } = await getHeadingHierarchy(page);
    expect(issues).toHaveLength(0);
  });

  test('Home page h1 text is not empty', async ({ page }) => {
    const { headings } = await getHeadingHierarchy(page);
    const h1 = headings.find((h) => h.level === 1);
    expect(h1).toBeDefined();
    expect(h1?.text.length).toBeGreaterThan(0);
  });

  test('Home page h1 is the first heading on the page', async ({ page }) => {
    const { headings } = await getHeadingHierarchy(page);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0].level).toBe(1);
  });
});
