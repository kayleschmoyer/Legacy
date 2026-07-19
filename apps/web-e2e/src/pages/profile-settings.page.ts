import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Lean page object for the Profile Settings screen (/profile/settings).
 *
 * Written against the platform-neutral {@link AppDriver} interface (ADR-0016).
 * This object intentionally covers only the surface the Discord callback flow
 * lands on — the page heading (proof of the post-link redirect) and the Linked
 * Identities section (LS-7825), which is where a freshly-linked Discord account
 * shows up. The broader Profile Settings coverage lives in
 * `profile-settings.spec.ts` and can migrate verbs here opportunistically as it
 * is touched (ADR-0016 rollout). Carries no mocking or data setup.
 *
 * The heading and providers resolve via the portable role/text/testID
 * vocabulary — no web-only surfaces.
 */
export class ProfileSettingsScreen extends BaseScreen {
  // ── Private elements ─────────────────────────────────────────────
  readonly #heading: UIElement;
  readonly #linkedIdentitiesSection: UIElement;

  constructor(driver: AppDriver) {
    super(driver);

    this.#heading = driver.byRole('heading', { name: 'Profile Settings' });
    this.#linkedIdentitiesSection = driver.byTestId(
      'profile-linked-identities-section',
    );
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
