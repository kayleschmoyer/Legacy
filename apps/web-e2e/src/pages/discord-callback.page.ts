import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the Discord OAuth callback screen (/auth/discord/callback).
 *
 * Written against the platform-neutral {@link AppDriver} interface (ADR-0016),
 * so the same object drives the web app today and a native app once an Appium
 * driver lands. Locators stay PRIVATE and the only public API is the semantic
 * surfaces — the navigation verb plus retrying assertions (ADR-0015). The
 * object carries no mocking or data setup; the spec fulfils the Discord link
 * endpoint and any GraphQL the destination page needs (ADR-0015 §6).
 *
 * The callback UI renders no stable `testID`s, so every element resolves via
 * the portable role/text vocabulary the driver exposes (both platforms map
 * these onto the accessibility tree) — no web-only surfaces are used here.
 */
export class DiscordCallbackScreen extends BaseScreen {
  // ── Private elements ─────────────────────────────────────────────
  // The spinner state renders this copy while the link request is in flight.
  readonly #linkingMessage: UIElement;
  // "Need help? Contact support" — the dead-end-avoidance affordance the error
  // state always shows (LS-6659); its presence is the signal that a sensible
  // error state rendered rather than a blank/crashed page.
  readonly #contactSupportLink: UIElement;
  // The "Back to Profile Settings" recovery link shown on the error state.
  readonly #backToSettingsLink: UIElement;

  constructor(driver: AppDriver) {
    super(driver);

    this.#linkingMessage = driver.byText(/linking your discord account/i);
    this.#contactSupportLink = driver.byRole('link', {
      name: /need help\? contact support/i,
    });
    this.#backToSettingsLink = driver.byText('Back to Profile Settings');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Open the callback route with the given OAuth query string, e.g.
   * `'?code=abc&state=xyz'` or `'?error=access_denied'`. The query is part of
   * the route path — on native this maps onto the deep-link query the same way.
   */
  async goto(query: string): Promise<void> {
    await this.open(`/auth/discord/callback${query}`);
  }

  /** Click the "Back to Profile Settings" recovery link on the error state. */
  async tapBackToProfileSettings(): Promise<void> {
    await this.#backToSettingsLink.tap();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the in-flight "Linking your Discord account…" state is shown. */
  async expectLinkingInProgress(): Promise<void> {
    await this.#linkingMessage.expectVisible({ timeout: 5000 });
  }

  /** Assert the error state shows a message containing `text`. */
  async expectErrorMessage(text: string | RegExp): Promise<void> {
    await this.driver.byText(text).first().expectVisible({ timeout: 10000 });
  }

  /**
   * Assert the error state rendered a usable, non-blank page: the
   * contact-support affordance is present so the user is never at a dead end
   * (LS-6659). Pair with {@link expectErrorMessage} for the specific copy.
   */
  async expectErrorStateVisible(): Promise<void> {
    await this.#contactSupportLink.expectVisible({ timeout: 10000 });
  }
}
