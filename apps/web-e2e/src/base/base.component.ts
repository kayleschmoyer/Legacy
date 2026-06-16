import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared base for reusable component objects (ADR-0015 §2, §4).
 *
 * A component is scoped to a **root `Locator`** rather than a route, so the
 * same widget can be composed by any page object. It exposes the same three
 * semantic surfaces as a page (actions / reads / assertions) and keeps its
 * locators PRIVATE (`#field`). Like the base page it carries no app knowledge,
 * no mocking, and no data setup (ADR-0015 §6).
 */
export abstract class BaseComponent {
  protected readonly root: Locator;
  protected readonly page: Page;

  constructor(root: Locator) {
    this.root = root;
    this.page = root.page();
  }

  /**
   * Wait until a test id is visible **within this component's root**. Gate on a
   * stable element, never on `networkidle` (ADR-0015 Context).
   */
  protected async waitReady(testId: string, timeout = 30000): Promise<void> {
    await expect(this.root.getByTestId(testId)).toBeVisible({ timeout });
  }
}
