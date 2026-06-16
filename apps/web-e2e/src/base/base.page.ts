import { expect, type Page } from '@playwright/test';

/**
 * Shared base for all page objects (ADR-0015 §4).
 *
 * Holds the Playwright `page` handle and the primitives every route-scoped
 * page object needs — a testid-gated readiness wait and a navigation helper.
 * It carries **no app knowledge**: no routes, no selectors, no mocking, no
 * data setup (those belong to fixtures and route handlers — ADR-0015 §6).
 *
 * Subclasses (the per-route page objects under `pages/`) keep their locators
 * PRIVATE (`#field`) and expose only the three semantic surfaces — actions,
 * reads, and assertions (ADR-0015 §1).
 */
export abstract class BasePage {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Wait until a test id is visible. This is the canonical readiness signal
   * for a route: gate on a stable element, NEVER on `networkidle` — the draft
   * WebSocket and league long-poll never reach idle, so `networkidle` hangs
   * (ADR-0015 Context; see the `goto*` notes on DraftPage/LeaguePage).
   */
  protected async waitReady(testId: string, timeout = 30000): Promise<void> {
    await expect(this.page.getByTestId(testId)).toBeVisible({ timeout });
  }

  /**
   * Navigate to `path` and, when a readiness test id is given, wait for it to
   * render before returning. Subclass `goto*` methods build on this.
   */
  protected async goto(
    path: string,
    readyTestId?: string,
    timeout = 30000,
  ): Promise<void> {
    await this.page.goto(path);
    if (readyTestId) {
      await this.waitReady(readyTestId, timeout);
    }
  }
}
