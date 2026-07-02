import type { AppDriver } from '../driver';

/**
 * Shared base for platform-neutral page objects (ADR-0016) — the driver-typed
 * counterpart of {@link ./base.page.BasePage}.
 *
 * A page object migrated to the driver interface extends this instead of
 * `BasePage`: it holds an {@link AppDriver} rather than a Playwright `Page`,
 * so the same object can drive web (Playwright) or, later, native (Appium).
 * Everything else from ADR-0015 is unchanged — locators stay private, only the
 * three semantic surfaces (actions / reads / assertions) are public, and the
 * object carries no mocking, identity, or data setup.
 *
 * Unmigrated page objects keep extending `BasePage`; migrate them here
 * opportunistically as their specs are touched (ADR-0016 rollout).
 */
export abstract class BaseScreen {
  protected readonly driver: AppDriver;

  constructor(driver: AppDriver) {
    this.driver = driver;
  }

  /**
   * Open an app route and, when a readiness test id is given, wait for it to
   * render. Gate on a stable element, NEVER on `networkidle` (ADR-0015
   * Context) — the readiness wait is the driver's retrying `expectVisible`.
   */
  protected async open(
    path: string,
    readyTestId?: string,
    timeout = 30000,
  ): Promise<void> {
    await this.driver.open(path);
    if (readyTestId) {
      await this.driver.byTestId(readyTestId).expectVisible({ timeout });
    }
  }
}
