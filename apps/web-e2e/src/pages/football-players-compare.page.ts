import { type AppDriver, PlaywrightWebDriver } from '../driver';
import { PremiumGate } from '../components/premium-gate.component';

/**
 * Page object for the football player-comparison route
 * (`/football/players/compare` — behind `FootballGate`; ADR-0015 §1, §4).
 *
 * Unlike the baseball `/players/compare` tool (a search-and-chip picker owned by
 * {@link ./players.page.PlayersPage}'s `compare` surface), the football compare
 * page is **URL-param driven**: it reads `?a=<id>&b=<id>`, fires two parallel
 * `FootballPlayer` queries, and renders a side-by-side "VS" table
 * (apps/web/src/pages/football/FootballPlayersComparePage.tsx). The two pages
 * share no interaction surface — there is no search box, chip list, or
 * "Nobody on deck yet" empty state here — so this is a distinct, driver-typed
 * page object rather than a sport-parameterisation of the baseball object
 * (LS-8465). It is NOT a parallel Playwright-typed object: every verb resolves
 * through the platform {@link AppDriver} (ADR-0016), and the premium overlay is
 * composed via the reusable {@link PremiumGate} component (ADR-0015 §2).
 *
 * Football stat-row labels come from the page's own `STAT_ROWS` (Pass YDS,
 * Rush YDS, Rec, …), which are the rendered football stat labels for this
 * surface; a row is hidden when neither player has a value in that category.
 */
export class FootballPlayersComparePage {
  /** The shared blurred premium-gate overlay wrapping the comparison table. */
  readonly premiumGate: PremiumGate;

  readonly #driver: AppDriver;

  constructor(driver: AppDriver) {
    this.#driver = driver;
    if (!(driver instanceof PlaywrightWebDriver)) {
      throw new Error(
        'FootballPlayersComparePage requires the web driver: it composes the ' +
          'web PremiumGate overlay via the Page (LS-8465).',
      );
    }
    this.premiumGate = new PremiumGate(
      driver.page.getByTestId('premium-feature-gate'),
    );
  }

  // ── Navigation ────────────────────────────────────────────────────

  /**
   * Navigate to `/football/players/compare`. Pass player ids to compare two
   * players (`?a=<a>&b=<b>`); omit them to land on the "select two players"
   * empty state.
   */
  async goto(ids?: { a?: number; b?: number }): Promise<void> {
    const params = new URLSearchParams();
    if (ids?.a != null) params.set('a', String(ids.a));
    if (ids?.b != null) params.set('b', String(ids.b));
    const query = params.toString();
    await this.#driver.open(
      `/football/players/compare${query ? `?${query}` : ''}`,
    );
  }

  // ── Assertions: page shell ────────────────────────────────────────

  /** Assert the "Compare Players" page heading is visible (always rendered). */
  async expectHeadingVisible(): Promise<void> {
    await this.#driver
      .byText('Compare Players', { exact: true })
      .first()
      .expectVisible();
  }

  // ── Assertions: empty / minimum-player / error / not-found states ──

  /** Assert the 0/1-player empty prompt ("Select two players to compare"). */
  async expectSelectTwoPrompt(): Promise<void> {
    await this.#driver.byText('Select two players to compare').expectVisible();
  }

  /** Assert the empty-state helper hint ("Go back to the players list…"). */
  async expectSelectTwoHint(): Promise<void> {
    await this.#driver
      .byText('Go back to the players list and pick two.')
      .expectVisible();
  }

  /** Assert the "Player not found" state (both ids valid, a player resolved null). */
  async expectPlayerNotFound(): Promise<void> {
    await this.#driver.byText('Player not found').expectVisible();
  }

  /** Assert the query-error banner ("Failed to load players. Please try again."). */
  async expectErrorBanner(): Promise<void> {
    await this.#driver
      .byText('Failed to load players. Please try again.')
      .expectVisible();
  }

  // ── Assertions: comparison table ──────────────────────────────────

  /** Assert the side-by-side "VS" comparison header is rendered. */
  async expectComparisonVisible(): Promise<void> {
    await this.#driver.byText('VS', { exact: true }).expectVisible();
  }

  /** Assert a player's name is visible (column header). */
  async expectPlayerNameVisible(name: string): Promise<void> {
    await this.#driver.byText(name).first().expectVisible();
  }

  /** Assert a football stat-row label is visible (exact — labels like "Rec" are
   *  substrings of "Rec YDS"). */
  async expectStatLabelVisible(label: string): Promise<void> {
    await this.#driver.byText(label, { exact: true }).first().expectVisible();
  }

  /** Assert a football stat-row label is absent (row hidden when neither player
   *  has a value in that category). */
  async expectStatLabelHidden(label: string): Promise<void> {
    await this.#driver.byText(label, { exact: true }).expectHidden();
  }

  /** Assert a stat value is visible somewhere in the table. */
  async expectStatValueVisible(value: string): Promise<void> {
    await this.#driver.byText(value).first().expectVisible();
  }

  // ── Assertions: premium gate ──────────────────────────────────────

  /** Assert the premium-gate overlay is shown (free users). */
  async expectPremiumGateVisible(): Promise<void> {
    await this.premiumGate.expectVisible();
  }

  /** Assert no premium-gate overlay is rendered (premium users). */
  async expectPremiumGateAbsent(): Promise<void> {
    await this.premiumGate.expectAbsent();
  }
}
