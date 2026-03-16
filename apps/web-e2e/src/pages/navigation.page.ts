import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for the persistent header/navigation bar.
 * Covers desktop nav, mobile hamburger menu, and brand elements.
 */
export class NavigationPage {
  readonly page: Page;

  // Brand
  readonly logoLink: Locator;
  readonly brandText: Locator;

  // Desktop navigation
  readonly primaryNav: Locator;
  readonly aboutLink: Locator;
  readonly baseballLink: Locator;
  readonly playersLink: Locator;
  readonly header: Locator;

  // Mobile navigation
  readonly hamburgerButton: Locator;
  readonly mobileNav: Locator;

  constructor(page: Page) {
    this.page = page;

    this.logoLink = page.getByRole('link', { name: /legacy sports home/i });
    this.brandText = page.getByTestId('brand-text');

    this.primaryNav = page.getByRole('navigation', { name: 'Primary' });
    this.aboutLink = this.primaryNav.getByRole('link', { name: /about/i });
    this.baseballLink = this.primaryNav.getByRole('link', {
      name: /baseball/i,
    });
    this.playersLink = this.primaryNav.getByRole('link', {
      name: /players/i,
    });
    this.header = page.getByRole('banner');

    this.hamburgerButton = page.getByRole('button', {
      name: /open menu|close menu/i,
    });
    this.mobileNav = page.getByRole('navigation', { name: /mobile/i });
  }

  /** Assert the header and logo are visible. */
  async expectHeaderVisible() {
    await expect(this.header).toBeVisible({ timeout: 30000 });
    await expect(this.logoLink).toBeVisible({ timeout: 30000 });
  }

  /** Navigate home via the logo link. */
  async clickLogo() {
    await this.page.locator('a[href="/"]').first().click();
    await this.page.waitForLoadState('load');
  }

  /** Switch to a mobile viewport and reload to apply responsive styles. */
  async setMobileViewport() {
    await this.page.setViewportSize({ width: 375, height: 812 });
    await this.page.reload();
    await this.page.waitForLoadState('load');
  }

  /** Open the mobile hamburger menu. */
  async openMobileMenu() {
    const openButton = this.page.getByRole('button', { name: /open menu/i });
    await openButton.click();
  }

  /** Close the mobile hamburger menu. */
  async closeMobileMenu() {
    const closeButton = this.page.getByRole('button', {
      name: /close menu/i,
    });
    await closeButton.click();
  }

  /** Assert the active nav link matches the given href. */
  async expectActiveLink(href: string) {
    const activeLink = this.page.locator(
      `[role="navigation"][aria-label="Primary"] a[href="${href}"][aria-current="page"]`,
    );
    await expect(activeLink).toBeVisible({ timeout: 30000 });
  }
}
