import { expect, type Locator } from '@playwright/test';

import { BaseComponent } from '../base/base.component';

/**
 * Reusable component for the persistent header / navigation bar (ADR-0015 §2).
 *
 * The header is a widget present on every route, not a route itself, so it
 * lives in the component layer scoped to a **root `Locator`** (the `banner`
 * landmark) rather than as a page object. Page objects compose it; specs
 * receive it via the `navHeader` fixture and never `new` it.
 *
 * Locators are private; the component exposes semantic surfaces (ADR-0015 §1).
 * The header drives interaction and verification — it has no plain-data to read
 * — so only the actions and assertions surfaces are populated:
 *   • actions  — `clickLogo()`, `clickNavItem(name)`, `goMobile()`,
 *                `openMobileMenu()`, `closeMobileMenu()`,
 *                `clickMobileMenuItem(text)`, `openUserProfileMenu()`,
 *                `clickUserProfileMenuItem(text)`, `openHelpMenu()`,
 *                `closeHelpMenuWithEscape()`
 *   • asserts  — `expectVisible()`, `expectLogo()`, `expectPrimaryNavVisible()`,
 *                `expectNavItem(name)`, `expectHamburgerVisible()`,
 *                `expectHamburgerHidden()`, `expectCloseButtonVisible()`,
 *                `expectMobileMenuVisible()`, `expectMobileMenuHidden()`,
 *                `expectMobileMenuItem(text)`, `expectCollapsed()`,
 *                `expectExpanded()`, `expectUserProfileMenuVisible()`,
 *                `expectUserProfileMenuItem(text)`, `expectHelpMenuVisible()`,
 *                `expectHelpMenuHidden()`
 *
 * Scoping note: the desktop header, brand, primary nav, hamburger,
 * user-profile dropdown, and Help & support menu live inside the `banner` root,
 * so those locators scope to `this.root`. The user-profile dropdown and Help
 * menu are `position: absolute` inside their respective banner-anchored
 * containers (not portaled). The mobile drawer renders through
 * `createPortal(..., document.body)` (it escapes the nav's sticky stacking
 * context), so it is **outside** the banner subtree and must be located via
 * `this.page`.
 *
 * It carries no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6).
 */
export class NavHeader extends BaseComponent {
  // ── Brand / desktop nav (inside the banner root) ──────────────────
  readonly #homeLink: Locator;
  readonly #logoImg: Locator;
  readonly #primaryNav: Locator;

  // ── Mobile hamburger (inside the banner root) ─────────────────────
  readonly #openMenuButton: Locator;

  // ── Mobile drawer (portaled to document.body — page-scoped) ───────
  readonly #closeMenuButton: Locator;
  readonly #mobileNav: Locator;

  // ── User-profile dropdown (inside the banner root) ────────────────
  readonly #userProfileTrigger: Locator;
  readonly #userProfileDropdown: Locator;

  // ── Help & support menu (inside the banner root) ──────────────────
  readonly #helpMenuButton: Locator;
  readonly #helpMenu: Locator;

  constructor(root: Locator) {
    super(root);

    this.#homeLink = root.getByRole('link', { name: /legacy sports home/i });
    this.#logoImg = root.getByTestId('header-logo');
    this.#primaryNav = root.getByRole('navigation', { name: 'Primary' });

    this.#openMenuButton = root.getByRole('button', { name: /open menu/i });

    // Portaled to document.body — scope to the page, not the banner root.
    this.#closeMenuButton = this.page.getByRole('button', {
      name: /close menu/i,
    });
    this.#mobileNav = this.page.getByRole('navigation', {
      name: /mobile navigation/i,
    });

    this.#userProfileTrigger = root.getByTestId('user-profile-trigger');
    this.#userProfileDropdown = root.getByTestId('user-profile-dropdown');

    this.#helpMenuButton = root.getByRole('button', {
      name: /help & support/i,
    });
    this.#helpMenu = root.getByRole('menu', { name: /help & support/i });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Navigate home via the brand/logo link and wait for the load to settle. */
  async clickLogo(): Promise<void> {
    await this.#homeLink.click();
    await this.page.waitForLoadState('load');
  }

  /**
   * Switch to a mobile viewport and reload so Tamagui's responsive styles
   * re-evaluate (the desktop nav and mobile hamburger are gated on `$gtMd`).
   * Use this when the page has already navigated; specs that navigate fresh
   * can size the viewport before their own `goto`.
   */
  async goMobile(): Promise<void> {
    await this.page.setViewportSize({ width: 375, height: 812 });
    await this.page.reload();
    await this.page.waitForLoadState('load');
  }

  /** Open the mobile drawer via the hamburger button. */
  async openMobileMenu(): Promise<void> {
    await this.#openMenuButton.click();
  }

  /** Close the mobile drawer via its close (X) button. */
  async closeMobileMenu(): Promise<void> {
    await this.#closeMenuButton.click();
  }

  /** Click a link/item inside the open mobile drawer, located by its text. */
  async clickMobileMenuItem(text: string | RegExp): Promise<void> {
    // Scoped to the drawer nav, the text engine's smallest-match semantics
    // make this unique (items are single-text-node buttons / section labels),
    // so no positional narrowing is needed (LS-9660).
    await this.#mobileNav.getByText(text).click();
  }

  /**
   * Click a primary-nav pill link by its accessible name and wait for the
   * resulting navigation to settle.
   */
  async clickNavItem(name: string | RegExp): Promise<void> {
    await this.#primaryNav.getByRole('link', { name }).click();
    await this.page.waitForLoadState('load');
  }

  /** Open the desktop user-profile dropdown via its trigger button. */
  async openUserProfileMenu(): Promise<void> {
    await this.#userProfileTrigger.click();
  }

  /**
   * Click an item in the open user-profile dropdown by its visible text and
   * wait for the resulting navigation to settle.
   */
  async clickUserProfileMenuItem(text: string | RegExp): Promise<void> {
    await this.#userProfileDropdown.getByText(text).click();
    await this.page.waitForLoadState('load');
  }

  /** Open the Help & support menu via its trigger button. */
  async openHelpMenu(): Promise<void> {
    await this.#helpMenuButton.click();
  }

  /** Close the Help & support menu by pressing Escape. */
  async closeHelpMenuWithEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the header landmark (banner) is mounted and visible. */
  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: 30000 });
  }

  /**
   * Assert the brand is rendered: the home link and logo image are visible and
   * the logo points at the expected asset with its accessible alt text.
   */
  async expectLogo(): Promise<void> {
    await expect(this.#homeLink).toBeVisible({ timeout: 30000 });
    await expect(this.#logoImg).toBeVisible({ timeout: 30000 });
    await expect(this.#logoImg).toHaveAttribute('src', '/logo.png');
    await expect(this.#logoImg).toHaveAttribute('alt', 'Legacy Sports');
  }

  /** Assert the primary (desktop) navigation landmark is visible. */
  async expectPrimaryNavVisible(): Promise<void> {
    await expect(this.#primaryNav).toBeVisible({ timeout: 30000 });
  }

  /** Assert a primary-nav pill link with the given accessible name is visible. */
  async expectNavItem(name: string | RegExp): Promise<void> {
    await expect(this.#primaryNav.getByRole('link', { name })).toBeVisible({
      timeout: 30000,
    });
  }

  /** Assert the mobile hamburger (open-menu) button is visible. */
  async expectHamburgerVisible(): Promise<void> {
    await expect(this.#openMenuButton).toBeVisible({ timeout: 15000 });
  }

  /** Assert the mobile hamburger is not present/visible (e.g. desktop width). */
  async expectHamburgerHidden(): Promise<void> {
    await expect(this.#openMenuButton).not.toBeVisible({ timeout: 15000 });
  }

  /** Assert the drawer's close (X) button is visible (drawer is open). */
  async expectCloseButtonVisible(): Promise<void> {
    await expect(this.#closeMenuButton).toBeVisible({ timeout: 10000 });
  }

  /** Assert the mobile drawer is open and visible. */
  async expectMobileMenuVisible(): Promise<void> {
    await expect(this.#mobileNav).toBeVisible({ timeout: 10000 });
  }

  /** Assert the mobile drawer is closed / not visible. */
  async expectMobileMenuHidden(): Promise<void> {
    await expect(this.#mobileNav).not.toBeVisible({ timeout: 10000 });
  }

  /** Assert an item/section with the given text is visible in the open drawer. */
  async expectMobileMenuItem(text: string | RegExp): Promise<void> {
    // Scoped to the drawer nav, the text engine's smallest-match semantics
    // make this unique (items are single-text-node buttons / section labels),
    // so no positional narrowing is needed (LS-9660).
    await expect(this.#mobileNav.getByText(text)).toBeVisible({
      timeout: 10000,
    });
  }

  /** Assert the hamburger reports the drawer as collapsed (`aria-expanded`). */
  async expectCollapsed(): Promise<void> {
    await expect(this.#openMenuButton).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  }

  /** Assert the open drawer reports itself expanded (`aria-expanded`). */
  async expectExpanded(): Promise<void> {
    await expect(this.#closeMenuButton).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  }

  /** Assert the desktop user-profile dropdown is open and visible. */
  async expectUserProfileMenuVisible(): Promise<void> {
    await expect(this.#userProfileDropdown).toBeVisible({ timeout: 10000 });
  }

  /** Assert an item with the given text is visible in the user-profile dropdown. */
  async expectUserProfileMenuItem(text: string | RegExp): Promise<void> {
    await expect(this.#userProfileDropdown.getByText(text)).toBeVisible({
      timeout: 10000,
    });
  }

  /** Assert the Help & support menu is open and visible. */
  async expectHelpMenuVisible(): Promise<void> {
    await expect(this.#helpMenu).toBeVisible({ timeout: 10000 });
  }

  /** Assert the Help & support menu is closed / not visible. */
  async expectHelpMenuHidden(): Promise<void> {
    await expect(this.#helpMenu).not.toBeVisible({ timeout: 5000 });
  }
}
