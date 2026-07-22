import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the notifications surfaces (ADR-0015 §1):
 *   • /notifications                — the redesigned full-page notification
 *                                     centre (`NotificationsScreen`): loaded /
 *                                     populated / empty / error states, the
 *                                     day-grouped notification cards, the retry
 *                                     affordance, and the prev/next pagination.
 *   • the bell dropdown in the nav   — `NotificationDropdown`, the popover
 *     header (every route)             surfaced from the header bell on every
 *                                     authenticated route: opening it, the
 *                                     per-notification menu items, and their
 *                                     click-to-navigate / close behaviour.
 *   • the app shell around them       — the generic "did the page crash" and
 *                                     "main content mounted" guards the hub
 *                                     smoke specs assert after the notification
 *                                     GraphQL operations (history / unread-count
 *                                     / mark-as-read / mark-all-read) are mocked.
 *
 * Migrated to the platform-neutral driver interface (ADR-0016): the object is a
 * screen (extends {@link BaseScreen}, holds an {@link AppDriver}) and every read
 * getter returns a {@link UIElement} rather than a Playwright `Locator`, so the
 * same object drives web today and the native app once an Appium driver lands.
 * Locators stay PRIVATE; the only public API is the three semantic surfaces —
 * actions (verbs), reads (element getters specs assert against), assertions
 * (retrying wrappers). Specs call these and never touch a selector, so a UI
 * mechanism change is a one-object edit instead of a spec-wide sweep.
 *
 * The bell dropdown is kept as verbs on this object (rather than extracted to a
 * component) because the persistent-header component layer is owned elsewhere
 * and the notification popover's surface is small; every dropdown locator still
 * stays private here.
 *
 * The object carries no mocking, identity, or seed data — that stays in the
 * specs' `page.route` handlers and the auth fixtures (ADR-0015 §6), so the same
 * object serves every mocked variant.
 *
 * Portability note (AC3): the whole surface is expressible on the platform-
 * neutral driver — every element resolves by test id, role, or text, all of
 * which map onto the native accessibility tree. The only web-only concern is
 * URL assertion (`expect(page).toHaveURL(...)` for the dropdown's navigation
 * targets), which is a runner-level check the specs keep directly rather than a
 * page-object verb; a native driver has no URL bar, so that assertion is
 * inherently a web-suite concern and is intentionally left in the specs.
 */
export class NotificationsPage extends BaseScreen {
  // ── Private elements: /notifications route ───────────────────────
  // The page `<h1>` — rendered in every state (populated / empty / error), so
  // it is the stable readiness gate for the route.
  readonly #pageHeading: UIElement;
  // Empty-state `<h2>` + its "all caught up" subtitle copy.
  readonly #emptyHeading: UIElement;
  readonly #caughtUpSubtitle: UIElement;
  // Error-state `<h2>` + its retry button.
  readonly #errorHeading: UIElement;
  readonly #retryButton: UIElement;
  // Pagination "Next" button (accessible name "Next page").
  readonly #nextPageButton: UIElement;
  // The global error-boundary copy (crash guard).
  readonly #appError: UIElement;
  // The app-shell main content region (hub smoke guard).
  readonly #mainContent: UIElement;

  // ── Private elements: bell dropdown ──────────────────────────────
  // The header bell trigger. The app shell renders NotificationDropdown twice
  // (desktop + mobile nav), so the test id resolves to two elements — one is
  // hidden by responsive CSS. `.first()` targets the one visible at the desktop
  // test viewport, avoiding a strict-mode violation.
  readonly #bellTrigger: UIElement;

  constructor(driver: AppDriver) {
    super(driver);

    this.#pageHeading = driver.byRole('heading', {
      level: 1,
      name: 'Notifications',
    });
    this.#emptyHeading = driver.byRole('heading', {
      level: 2,
      name: 'No notifications yet',
    });
    this.#caughtUpSubtitle = driver.byText('You’re all caught up');
    this.#errorHeading = driver.byRole('heading', {
      level: 2,
      name: 'Unable to load your notifications',
    });
    this.#retryButton = driver.byRole('button', { name: 'Try again' });
    this.#nextPageButton = driver.byRole('button', { name: 'Next page' });
    this.#appError = driver.byText('Unexpected Application Error');
    this.#mainContent = driver.byTestId('main-content');

    this.#bellTrigger = driver.byTestId('notifications-trigger').first();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /**
   * The pagination "Next" button (accessible name "Next page"). Exposed as a
   * getter so specs assert its visible/enabled/disabled state via the element's
   * retrying `expect*` surface (`nextPageButton.expectEnabled()`).
   */
  get nextPageButton(): UIElement {
    return this.#nextPageButton;
  }

  // ── Actions: navigation ──────────────────────────────────────────

  /**
   * Navigate to the full notifications page and wait for it to render. Gate on
   * the `<h1>` — it renders in every state (populated / empty / error), unlike
   * the body which swaps per state (ADR-0015 Context: never `networkidle`).
   */
  async gotoNotifications(): Promise<void> {
    await this.driver.open('/notifications');
    await this.#pageHeading.expectVisible({ timeout: 30000 });
  }

  // ── Actions: bell dropdown ───────────────────────────────────────

  /** Open the header bell dropdown via its trigger. */
  async openBellDropdown(): Promise<void> {
    await this.#bellTrigger.tap();
  }

  /** Click a notification item in the open bell dropdown, by its id. */
  async clickDropdownItem(id: number): Promise<void> {
    await this.#dropdownItem(id).tap();
  }

  // ── Assertions: /notifications route ─────────────────────────────

  /** Assert the notifications page header (`<h1>`) is visible. */
  async expectPageHeadingVisible(): Promise<void> {
    await this.#pageHeading.expectVisible({ timeout: 15000 });
  }

  /**
   * Assert a notification card with `title` is rendered (its title is an `<h3>`
   * semantic heading, so it is targetable per-notification).
   */
  async expectNotificationCard(title: string): Promise<void> {
    await this.driver
      .byRole('heading', { level: 3, name: title })
      .expectVisible();
  }

  /** Assert a notification card's message body copy is visible. */
  async expectNotificationMessage(message: string): Promise<void> {
    await this.driver.byText(message).expectVisible();
  }

  /**
   * Assert the empty state: the "No notifications yet" heading and the
   * "all caught up" subtitle copy.
   */
  async expectEmptyState(): Promise<void> {
    await this.#emptyHeading.expectVisible();
    await this.#caughtUpSubtitle.expectVisible();
  }

  /**
   * Assert the error state: the "Unable to load your notifications" heading and
   * the "Try again" retry button.
   */
  async expectErrorState(): Promise<void> {
    await this.#errorHeading.expectVisible();
    await this.#retryButton.expectVisible();
  }

  // ── Assertions: bell dropdown ────────────────────────────────────

  /** Assert a notification item is visible in the open dropdown. */
  async expectDropdownItem(id: number): Promise<void> {
    await this.#dropdownItem(id).expectVisible();
  }

  /**
   * Assert a notification item is no longer shown — the dropdown closed after a
   * click (the item leaves the DOM).
   */
  async expectDropdownItemHidden(id: number): Promise<void> {
    await this.#dropdownItem(id).expectHidden();
  }

  // ── Assertions: app-shell guards ─────────────────────────────────

  /** Assert the page did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await this.#appError.expectCount(0);
  }

  /** Assert the app-shell main content region is mounted and visible. */
  async expectMainContentVisible(): Promise<void> {
    await this.#mainContent.expectVisible();
  }

  // ── Private helpers ──────────────────────────────────────────────

  /** A dropdown notification menu item, by its notification id. */
  #dropdownItem(id: number): UIElement {
    return this.driver.byTestId(`notification-item-${id}`);
  }
}
