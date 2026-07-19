import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the standalone Trade Center (`/trade-center`).
 *
 * Written against the platform-neutral {@link AppDriver} (ADR-0016), not a
 * Playwright `Page`, so the same object drives the web app today and the native
 * app once an Appium driver lands. That pays off directly here because
 * `/trade-center` is also a native deep-link target (`apps/app/src/app/
 * +native-intent.ts` rewrites it to `/TradeCenterPage`), so the verbs below are
 * the shared vocabulary LS-8453/LS-8456 will reuse. Locators stay PRIVATE and
 * the only public API is the three semantic surfaces (actions / reads /
 * assertions); this object carries no mocking, identity, or data setup
 * (ADR-0015 §6).
 *
 * Web-only surfaces documented per ADR-0016 §"Now constrained":
 *  - `#premiumGate` targets `data-testid="premium-feature-gate"`, which the web
 *    `PremiumGate` overlay renders only for free users. The gate is a portable
 *    testID (Tamagui renders it as an accessibility id on native too), so no
 *    web-only escape hatch is needed.
 *  - The readiness anchor is the visible "Trade Center" heading text rather
 *    than a testid, because the product page exposes no root testid; matched
 *    exactly so it never collides with substrings.
 */
export class TradeCenterPage extends BaseScreen {
  // ── Private elements ─────────────────────────────────────────────
  readonly #heading: UIElement;
  readonly #leagueSelectPrompt: UIElement;
  readonly #tradeAnalyzerHeading: UIElement;
  readonly #premiumBadge: UIElement;
  readonly #premiumGate: UIElement;
  readonly #upgradeCta: UIElement;
  readonly #comingSoon: UIElement;

  constructor(driver: AppDriver) {
    super(driver);

    this.#heading = driver.byText('Trade Center', { exact: true });
    this.#leagueSelectPrompt = driver.byText(
      'Select a league to view and manage trade offers.',
    );
    this.#tradeAnalyzerHeading = driver.byText('Trade Analyzer', {
      exact: true,
    });
    this.#premiumBadge = driver.byText('PREMIUM', { exact: true });
    // The overlay lock card the web PremiumGate renders for free users only.
    this.#premiumGate = driver.byTestId('premium-feature-gate');
    this.#upgradeCta = driver.byRole('button', {
      name: /upgrade to premium/i,
    });
    this.#comingSoon = driver.byText(/Coming soon/i);
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Open `/trade-center` and wait for the page heading to render. */
  async goto(): Promise<void> {
    await this.driver.open('/trade-center');
    await this.#heading.expectVisible({ timeout: 30000 });
  }

  /**
   * Open a notification-style deep link into a specific league's trades.
   *
   * The product page reads `leagueId` and `offerId` query params
   * (`TradeCenterPage.tsx`) — the ticket's "tradeOfferId" is this `offerId`
   * param, which `NotificationDropdown` and the native `+native-intent`
   * rewrite pass through verbatim. `leagueId` pre-selects the league;
   * `offerId` is forwarded to `TradingCenter` as `deepLinkOfferId`.
   */
  async gotoDeepLink(leagueId: number, offerId?: number): Promise<void> {
    const query =
      offerId == null
        ? `leagueId=${leagueId}`
        : `leagueId=${leagueId}&offerId=${offerId}`;
    await this.driver.open(`/trade-center?${query}`);
    await this.#heading.expectVisible({ timeout: 30000 });
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the standalone route rendered its header for an authed user. */
  async expectLoaded(): Promise<void> {
    await this.#heading.expectVisible({ timeout: 15000 });
  }

  /** Assert the league-selection landing section is shown (list view). */
  async expectLeagueSelectPrompt(): Promise<void> {
    await this.#leagueSelectPrompt.expectVisible({ timeout: 15000 });
  }

  /** Assert the Trade Analyzer teaser section is present. */
  async expectTradeAnalyzerSection(): Promise<void> {
    await this.#tradeAnalyzerHeading.expectVisible({ timeout: 15000 });
  }

  /**
   * Assert the Trade Analyzer teaser is gated for a free user: the premium
   * overlay, its PREMIUM badge, and the Upgrade CTA are all visible.
   */
  async expectAnalyzerGated(): Promise<void> {
    await this.#premiumBadge.expectVisible({ timeout: 15000 });
    await this.#premiumGate.expectVisible({ timeout: 15000 });
    await this.#upgradeCta.expectVisible({ timeout: 15000 });
  }

  /**
   * Assert the Trade Analyzer teaser is unlocked for a premium user: no
   * overlay gate, no PREMIUM badge, and the "coming soon" note is shown.
   */
  async expectAnalyzerUnlocked(): Promise<void> {
    await this.#tradeAnalyzerHeading.expectVisible({ timeout: 15000 });
    await this.#comingSoon.expectVisible({ timeout: 15000 });
    await this.#premiumGate.expectNotAttached({ timeout: 15000 });
    await this.#premiumBadge.expectNotAttached({ timeout: 15000 });
  }

  /**
   * Assert a deep link landed on the selected league's trades view: the league
   * back-link (whose accessible name is the league name) is shown and the
   * league-selection prompt is gone. Proves navigation into the right content
   * rather than the list.
   *
   * Scoped to `main-content` so it never matches the app header's
   * league-switcher chip, which also carries the current league's name.
   */
  async expectLandedOnLeague(leagueName: string): Promise<void> {
    await this.driver
      .byTestId('main-content')
      .byRole('button', { name: leagueName })
      .expectVisible({ timeout: 15000 });
    await this.#leagueSelectPrompt.expectHidden({ timeout: 15000 });
  }
}
