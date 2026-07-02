import type { Page } from '@playwright/test';

/**
 * Platform-neutral UI-driver contracts (ADR-0016).
 *
 * Page/component objects written against these interfaces carry no Playwright
 * `Page`/`Locator` types, so the same object can drive the web app (via
 * {@link ../playwright-web.driver.PlaywrightWebDriver}) or, later, the native
 * app via an Appium-backed driver. The Playwright *runner* (test, expect,
 * expect.poll) stays the single orchestrator on every platform — only the
 * element-access and assertion mechanics live behind these interfaces.
 *
 * Selector vocabulary is deliberately narrow and maps onto what both platforms
 * can resolve: Tamagui's `testID` renders as `data-testid` on web and as the
 * accessibility/resource id on native, and role/name maps to the accessibility
 * tree on both. Anything outside this vocabulary is a web-only concern and
 * belongs in an unmigrated (Playwright-typed) page object, not here.
 */

/** ARIA role union — reuse Playwright's typing so role names stay checked. */
export type UIRole = Parameters<Page['getByRole']>[0];

/**
 * What a driver implementation can and cannot do (ADR-0016 §capability model).
 *
 * Tests or fixtures that depend on a capability must gate on it explicitly
 * (`test.skip(!driver.capabilities.clock, '…')`) instead of failing at
 * runtime — a missing capability is a scoping decision, not a flake.
 */
export interface DriverCapabilities {
  /** In-process network interception (`page.route` / `route.fulfill`). */
  readonly networkMock: boolean;
  /** Clock injection / time freezing (`page.clock`). */
  readonly clock: boolean;
  /** Trace capture (Playwright trace viewer). */
  readonly trace: boolean;
  /** Pointer hover (no touch-only equivalent on native). */
  readonly hover: boolean;
  /** Multiple concurrent authenticated sessions (multi-context specs). */
  readonly multiWindow: boolean;
}

/** Options accepted by the retrying assertion surface. */
export interface ExpectOptions {
  timeout?: number;
}

/** Text-matching options shared by the text/placeholder selectors. */
export interface TextOptions {
  exact?: boolean;
}

/**
 * A scope elements can be resolved within — implemented by both the driver
 * (page-level scope) and every element (descendant scope), mirroring how
 * Playwright locators chain.
 */
export interface ElementScope {
  /** By stable test id (`data-testid` on web, accessibility id on native). */
  byTestId(id: string): UIElement;
  /**
   * Every element whose test id starts with `prefix` — the cross-platform
   * equivalent of `[data-testid^="…"]` collection locators (e.g. the
   * `player-row-<id>` rows).
   */
  byTestIdPrefix(prefix: string): UIElement;
  /** By accessibility role and (optionally) accessible name. */
  byRole(
    role: UIRole,
    options?: { name?: string | RegExp; exact?: boolean },
  ): UIElement;
  /** By rendered text. */
  byText(text: string | RegExp, options?: TextOptions): UIElement;
  /** By input placeholder. */
  byPlaceholder(text: string | RegExp): UIElement;
}

/**
 * A lazily-resolved UI element (or collection — like a Playwright `Locator`,
 * an element is a query, not a handle; `first()`/`count()` deal with
 * multi-match queries).
 *
 * The `expect*` methods are the retrying assertion surface (ADR-0015 §1):
 * on web they delegate to Playwright's web-first assertions; a native driver
 * must implement equivalent polling (e.g. wdio `waitForDisplayed`) so specs
 * and page objects keep identical retry semantics on every platform.
 */
export interface UIElement extends ElementScope {
  /** The first match of this query. */
  first(): UIElement;
  /** Matches narrowed to those containing `text`. */
  filterByText(text: string | RegExp): UIElement;

  // ── Actions ───────────────────────────────────────────────────────
  /** Activate the element (click on web, tap on native). */
  tap(): Promise<void>;
  /** Replace the element's value with `value`. */
  fill(value: string): Promise<void>;

  // ── Reads (point-in-time snapshots — for branching/logging) ──────
  count(): Promise<number>;
  isVisible(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  text(): Promise<string>;
  /** Inner text of every match (collection queries). */
  allTexts(): Promise<string[]>;

  // ── Retrying assertions ("wait until" semantics) ─────────────────
  expectVisible(options?: ExpectOptions): Promise<void>;
  expectHidden(options?: ExpectOptions): Promise<void>;
  expectCount(count: number, options?: ExpectOptions): Promise<void>;
  expectValue(value: string, options?: ExpectOptions): Promise<void>;
  expectContainsText(
    text: string | RegExp,
    options?: ExpectOptions,
  ): Promise<void>;
  /** Assert the element rendered *some* text (e.g. a non-empty error alert). */
  expectNonEmptyText(options?: ExpectOptions): Promise<void>;
}

/**
 * The platform driver a migrated page object is constructed with (ADR-0016).
 *
 * Carries no mocking, no identity, and no data setup — those stay in fixtures
 * (ADR-0015 §6). A driver is purely "resolve elements, act, assert" plus
 * route-shaped navigation.
 */
export interface AppDriver extends ElementScope {
  readonly capabilities: DriverCapabilities;
  /**
   * Open an app route. `path` is the URL-shaped route the app uses everywhere
   * (`/baseball/league/7/draft`): a web driver resolves it against `baseURL`;
   * a native driver opens it as a deep link (the mobile app is expo-router,
   * so routes are URL-shaped there too).
   */
  open(path: string): Promise<void>;
}
