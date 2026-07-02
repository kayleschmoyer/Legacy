import { expect, type Locator, type Page } from '@playwright/test';

import type {
  AppDriver,
  DriverCapabilities,
  ExpectOptions,
  TextOptions,
  UIElement,
  UIRole,
} from './types';

/**
 * Web implementation of {@link AppDriver} — a thin adapter over the Playwright
 * `Page`/`Locator` API (ADR-0016).
 *
 * The retrying `expect*` surface delegates to Playwright's web-first
 * assertions, so migrated page objects keep exactly the retry semantics the
 * determinism levers require (no bespoke polling on web).
 */

/** Adapter from a Playwright `Locator` to the platform-neutral element. */
class PlaywrightElement implements UIElement {
  readonly #locator: Locator;

  constructor(locator: Locator) {
    this.#locator = locator;
  }

  // ── ElementScope (descendant queries) ─────────────────────────────
  byTestId(id: string): UIElement {
    return new PlaywrightElement(this.#locator.getByTestId(id));
  }

  byTestIdPrefix(prefix: string): UIElement {
    return new PlaywrightElement(
      this.#locator.locator(`[data-testid^="${prefix}"]`),
    );
  }

  byRole(
    role: UIRole,
    options?: { name?: string | RegExp; exact?: boolean },
  ): UIElement {
    return new PlaywrightElement(this.#locator.getByRole(role, options));
  }

  byText(text: string | RegExp, options?: TextOptions): UIElement {
    return new PlaywrightElement(this.#locator.getByText(text, options));
  }

  byPlaceholder(text: string | RegExp): UIElement {
    return new PlaywrightElement(this.#locator.getByPlaceholder(text));
  }

  first(): UIElement {
    return new PlaywrightElement(this.#locator.first());
  }

  filterByText(text: string | RegExp): UIElement {
    return new PlaywrightElement(this.#locator.filter({ hasText: text }));
  }

  // ── Actions ───────────────────────────────────────────────────────
  async tap(): Promise<void> {
    await this.#locator.click();
  }

  async fill(value: string): Promise<void> {
    await this.#locator.fill(value);
  }

  // ── Reads ─────────────────────────────────────────────────────────
  count(): Promise<number> {
    return this.#locator.count();
  }

  isVisible(): Promise<boolean> {
    return this.#locator.isVisible();
  }

  isEnabled(): Promise<boolean> {
    return this.#locator.isEnabled();
  }

  async text(): Promise<string> {
    return (await this.#locator.textContent()) ?? '';
  }

  allTexts(): Promise<string[]> {
    return this.#locator.allInnerTexts();
  }

  // ── Retrying assertions ───────────────────────────────────────────
  async expectVisible(options?: ExpectOptions): Promise<void> {
    await expect(this.#locator).toBeVisible(options);
  }

  async expectHidden(options?: ExpectOptions): Promise<void> {
    await expect(this.#locator).not.toBeVisible(options);
  }

  async expectCount(count: number, options?: ExpectOptions): Promise<void> {
    await expect(this.#locator).toHaveCount(count, options);
  }

  async expectValue(value: string, options?: ExpectOptions): Promise<void> {
    await expect(this.#locator).toHaveValue(value, options);
  }

  async expectContainsText(
    text: string | RegExp,
    options?: ExpectOptions,
  ): Promise<void> {
    await expect(this.#locator).toContainText(text, options);
  }

  async expectNonEmptyText(options?: ExpectOptions): Promise<void> {
    await expect(this.#locator).not.toHaveText('', options);
  }
}

export class PlaywrightWebDriver implements AppDriver {
  /**
   * The underlying Playwright page — the deliberate escape hatch for fixtures
   * and web-only call sites during incremental migration. Page objects typed
   * against {@link AppDriver} cannot reach it, which is the point.
   */
  readonly page: Page;

  readonly capabilities: DriverCapabilities = {
    networkMock: true,
    clock: true,
    trace: true,
    hover: true,
    multiWindow: true,
  };

  constructor(page: Page) {
    this.page = page;
  }

  async open(path: string): Promise<void> {
    await this.page.goto(path);
  }

  byTestId(id: string): UIElement {
    return new PlaywrightElement(this.page.getByTestId(id));
  }

  byTestIdPrefix(prefix: string): UIElement {
    return new PlaywrightElement(
      this.page.locator(`[data-testid^="${prefix}"]`),
    );
  }

  byRole(
    role: UIRole,
    options?: { name?: string | RegExp; exact?: boolean },
  ): UIElement {
    return new PlaywrightElement(this.page.getByRole(role, options));
  }

  byText(text: string | RegExp, options?: TextOptions): UIElement {
    return new PlaywrightElement(this.page.getByText(text, options));
  }

  byPlaceholder(text: string | RegExp): UIElement {
    return new PlaywrightElement(this.page.getByPlaceholder(text));
  }
}
