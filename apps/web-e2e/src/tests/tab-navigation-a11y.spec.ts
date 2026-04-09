/**
 * Tab Component ARIA Semantics & Keyboard Navigation — E2E Tests (LS-2222)
 *
 * Verifies that tab components on the league detail page expose correct
 * ARIA roles (tablist / tab / tabpanel), maintain proper selected-state
 * attributes, and support basic keyboard / click interaction.
 *
 * GraphQL isolation is handled by the _apiIsolation auto-fixture from
 * auth-enhanced.ts. That fixture intercepts all non-static requests and
 * fulfills GraphQL operations from BASELINE_GRAPHQL_RESPONSES; unknown
 * operations are fulfilled with empty data and reported as test errors.
 * route.continue() is NEVER used — route.fulfill() only.
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAGUE_ID = 1;
const LEAGUE_URL = `/baseball/league/${LEAGUE_ID}/overview`;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function evaluateTabSemantics(page: import('@playwright/test').Page) {
  return await page.evaluate(() => {
    const tablists = Array.from(document.querySelectorAll('[role="tablist"]'));
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const tabpanels = Array.from(
      document.querySelectorAll('[role="tabpanel"]'),
    );

    const issues: string[] = [];

    if (tablists.length === 0 && tabs.length === 0) {
      return {
        hasTabPattern: false,
        tablists: 0,
        tabs: 0,
        tabpanels: 0,
        selectedTabs: 0,
        issues,
      };
    }

    const selectedTabs = tabs.filter(
      (t) => t.getAttribute('aria-selected') === 'true',
    );

    if (selectedTabs.length === 0 && tabs.length > 0) {
      issues.push('No tab has aria-selected="true"');
    }
    if (selectedTabs.length > 1) {
      issues.push(
        `Multiple tabs have aria-selected="true": ${selectedTabs.length}`,
      );
    }
    if (tabs.length > 0 && tablists.length === 0) {
      issues.push(
        'role="tab" elements exist but no role="tablist" ancestor was found',
      );
    }

    return {
      hasTabPattern: tablists.length > 0 || tabs.length > 0,
      tablists: tablists.length,
      tabs: tabs.length,
      tabpanels: tabpanels.length,
      selectedTabs: selectedTabs.length,
      issues,
    };
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Tab component ARIA semantics @regression', () => {
  test('league detail sub-tabs have proper ARIA roles', async ({ page }) => {
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('networkidle');

    const { hasTabPattern, issues } = await evaluateTabSemantics(page);

    // If tabs exist, verify semantics are correct
    if (hasTabPattern) {
      expect(issues).toHaveLength(0);
    }

    // Page should load without errors regardless
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('exactly one tab is selected at a time', async ({ page }) => {
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('networkidle');

    const { hasTabPattern, selectedTabs } = await evaluateTabSemantics(page);
    if (!hasTabPattern) {
      // No tabs on this page — acceptable
      return;
    }

    expect(selectedTabs).toBe(1);
  });

  test('active tab has aria-selected="true", inactive tabs have aria-selected="false"', async ({
    page,
  }) => {
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('networkidle');

    const { hasTabPattern, tabs } = await evaluateTabSemantics(page);
    if (!hasTabPattern || tabs < 2) {
      return;
    }

    // Verify every tab carries an explicit aria-selected attribute
    const tabElements = page.locator('[role="tab"]');
    const count = await tabElements.count();

    for (let i = 0; i < count; i++) {
      const tab = tabElements.nth(i);
      const ariaSelected = await tab.getAttribute('aria-selected');
      // Each tab must declare its selected state explicitly
      expect(ariaSelected === 'true' || ariaSelected === 'false').toBe(true);
    }
  });

  test('clicking a different tab makes it selected', async ({ page }) => {
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('networkidle');

    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    if (tabCount < 2) {
      // Need at least 2 tabs to exercise selection change
      return;
    }

    // Click the second tab
    await tabs.nth(1).click();

    // The second tab should now be selected
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true', {
      timeout: 5000,
    });
  });

  test('tab panels are associated with their tabs via aria-labelledby or aria-label', async ({
    page,
  }) => {
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('networkidle');

    const { hasTabPattern, tabpanels } = await evaluateTabSemantics(page);
    if (!hasTabPattern) {
      return;
    }

    // If tabpanels are present, at least some should carry accessible labels
    if (tabpanels > 0) {
      const panelWithLabel = await page.evaluate(() => {
        return Array.from(
          document.querySelectorAll('[role="tabpanel"]'),
        ).filter(
          (panel) =>
            panel.hasAttribute('aria-labelledby') ||
            panel.hasAttribute('aria-label'),
        ).length;
      });
      // At least one tabpanel must carry an accessible label
      expect(panelWithLabel).toBeGreaterThan(0);
    }

    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('keyboard arrow navigation between tabs does not crash the page', async ({
    page,
  }) => {
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('networkidle');

    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();
    if (tabCount < 2) {
      return;
    }

    // Focus the first tab
    await tabs.first().focus();
    await expect(tabs.first()).toBeFocused({ timeout: 5000 });

    // ArrowRight — move focus to next tab (if keyboard nav is implemented)
    await page.keyboard.press('ArrowRight');

    // Page must remain stable regardless of whether keyboard navigation is implemented
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('each tab has an ancestor tablist container or aria-owns relationship', async ({
    page,
  }) => {
    await page.goto(LEAGUE_URL);
    await page.waitForLoadState('networkidle');

    const { hasTabPattern } = await evaluateTabSemantics(page);
    if (!hasTabPattern) {
      return;
    }

    // Every tab must be owned by a tablist (via DOM ancestry or aria-owns)
    const orphanedTabs = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      return tabs.filter((tab) => {
        let el: Element | null = tab.parentElement;
        while (el) {
          if (el.getAttribute('role') === 'tablist') return false;
          el = el.parentElement;
        }
        // Check aria-owns fallback (basic string match)
        const id = tab.id;
        if (id) {
          const owner = document.querySelector(
            `[aria-owns~="${id}"][role="tablist"]`,
          );
          if (owner) return false;
        }
        return true;
      }).length;
    });

    expect(orphanedTabs).toBe(0);
  });
});
