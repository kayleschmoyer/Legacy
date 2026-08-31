import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';
import { TwoFactorSection } from '../components/two-factor-section.component';

/**
 * Page object for the Profile Settings screen (`/profile/settings`), migrated to
 * the platform-neutral driver (ADR-0016). Covers two surfaces, added
 * opportunistically as their specs were touched (ADR-0016 rollout):
 *
 *   • the Discord callback landing surface — the page heading (proof of the
 *     post-link redirect) and the Linked Identities section (LS-7825);
 *   • the Two-Factor Authentication section (LS-8463), exposed as a composed
 *     component.
 *
 * Broader Profile Settings coverage stays in the raw-Playwright
 * `profile-settings.spec.ts` until migrated. Locators resolve via the portable
 * role/text/testID vocabulary — no web-only surfaces. Carries no mocking or data
 * setup.
 */
export class ProfileSettingsScreen extends BaseScreen {
  // ── Private elements ─────────────────────────────────────────────
  readonly #heading: UIElement;
  readonly #linkedIdentitiesSection: UIElement;
  readonly #twoFactor: TwoFactorSection;

  constructor(driver: AppDriver) {
    super(driver);

    this.#heading = driver.byRole('heading', { name: 'Profile Settings' });
    this.#linkedIdentitiesSection = driver.byTestId(
      'profile-linked-identities-section',
    );
    this.#twoFactor = new TwoFactorSection(
      driver.byTestId('profile-2fa-section'),
    );
  }

  /** The Two-Factor Authentication section component. */
  get twoFactor(): TwoFactorSection {
    return this.#twoFactor;
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Navigate to `/profile/settings` and wait for the 2FA section to render. */
  async goto(): Promise<void> {
    await this.open('/profile/settings', 'profile-2fa-section');
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the Profile Settings page has loaded (its heading is visible). */
  async expectLoaded(): Promise<void> {
    await this.#heading.expectVisible({ timeout: 15000 });
  }

  /**
   * Assert a linked identity for `providerLabel` (e.g. `'Discord'`, `'Google'`)
   * is shown in the Linked Identities section. Scoped to the section so the
   * label can't collide with the same word elsewhere on the page.
   */
  async expectLinkedIdentityVisible(providerLabel: string): Promise<void> {
    await this.#linkedIdentitiesSection.expectVisible({ timeout: 15000 });
    await this.#linkedIdentitiesSection
      .byText(providerLabel, { exact: true })
      .first()
      .expectVisible({ timeout: 10000 });
  }
}
