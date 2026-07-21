import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';
import {
  MOCK_DRAFT_PATH,
  RESOLVER_STANDINGS_PATH,
  resolverMatchupPath,
} from '../support/canonical-routes';

/**
 * Page object for the resolver / redirect + legacy-alias routes (LS-8464):
 *   • /matchup/:matchupId  → MatchupRedirectPage  → canonical league matchup URL
 *   • /standings           → StandingsRedirectPage → current league standings tab
 *   • /home  → /                          (legacy alias)
 *   • /draft/mock → /baseball/mock-draft   (legacy alias)
 *
 * Migrated to the platform-neutral driver interface (ADR-0016): the object is a
 * screen (extends {@link BaseScreen}, holds an {@link AppDriver}) so the same
 * verbs can later drive the native intent map. It exposes the three semantic
 * surfaces (ADR-0015 §1):
 *   • actions  — navigate to a source route (`gotoMatchupResolver`,
 *                `gotoStandingsResolver`, `gotoLegacyAlias`)
 *   • reads    — the stable destination anchors specs assert against
 *   • asserts  — retrying wrappers over those anchors (`expectMatchupDetailRendered`,
 *                `expectStandingsRendered`, `expectHomeRendered`,
 *                `expectMockDraftRendered`, `expectNoLeaguesState`, `expectNoAppError`)
 *
 * URL-shape assertions stay at the runner level in the spec (`expect(page)
 * .toHaveURL(...)`) using the shared `canonical-routes` builders — a redirect's
 * final URL is a web-only concern that lives outside the driver vocabulary
 * (see apps/web-e2e/src/driver/types.ts). The object carries no mocking or seed
 * data — that stays in the specs (ADR-0015 §6).
 */
export class RedirectResolverPage extends BaseScreen {
  constructor(driver: AppDriver) {
    super(driver);
  }

  // ── Actions: navigate to a source (resolver / legacy) route ─────────────

  /** Open `/matchup/:matchupId` (the `MatchupRedirectPage` resolver). */
  async gotoMatchupResolver(matchupId: number | string): Promise<void> {
    await this.open(resolverMatchupPath(matchupId));
  }

  /** Open `/standings` (the `StandingsRedirectPage` resolver). */
  async gotoStandingsResolver(): Promise<void> {
    await this.open(RESOLVER_STANDINGS_PATH);
  }

  /** Open an arbitrary legacy-alias source path (e.g. `/home`, `/draft/mock`). */
  async gotoLegacyAlias(path: string): Promise<void> {
    await this.open(path);
  }

  // ── Reads: stable destination anchors ───────────────────────────────────

  /** The home screen scroll container — present in every home state. */
  private get homeScreen(): UIElement {
    return this.driver.byTestId('home-screen');
  }

  /** The matchup detail page's "Matchup Details" heading. */
  private get matchupDetailHeading(): UIElement {
    return this.driver.byRole('heading', { name: /matchup details/i });
  }

  /** The mock-draft page's "Mock Draft Simulator" heading. */
  private get mockDraftHeading(): UIElement {
    return this.driver.byRole('heading', { name: /mock draft simulator/i });
  }

  /** The zero-leagues empty state on the standings resolver. */
  private get noLeaguesMessage(): UIElement {
    return this.driver.byText(/no leagues found/i);
  }

  /** The league detail page's league-name `<h1>`. */
  private leagueNameHeading(name: string): UIElement {
    return this.driver.byRole('heading', { name, level: 1 });
  }

  // ── Assertions ──────────────────────────────────────────────────────────

  /** Assert the home page rendered (not a blank page). */
  async expectHomeRendered(): Promise<void> {
    await this.homeScreen.expectVisible({ timeout: 15000 });
  }

  /** Assert the canonical matchup detail page rendered. */
  async expectMatchupDetailRendered(): Promise<void> {
    await this.matchupDetailHeading.expectVisible({ timeout: 15000 });
  }

  /** Assert the mock-draft page rendered. */
  async expectMockDraftRendered(): Promise<void> {
    await this.mockDraftHeading.expectVisible({ timeout: 15000 });
  }

  /**
   * Assert the league detail page rendered for `name` (the standings tab is a
   * tab of the league detail page, which renders the league name as its `<h1>`).
   */
  async expectStandingsRendered(name: string): Promise<void> {
    await this.leagueNameHeading(name).expectVisible({ timeout: 15000 });
    await this.expectNoAppError();
  }

  /** Assert the zero-leagues empty state rendered (sensible, not blank). */
  async expectNoLeaguesState(): Promise<void> {
    await this.noLeaguesMessage.expectVisible({ timeout: 15000 });
  }

  /** Assert the page did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await this.driver.byText('Unexpected Application Error').expectCount(0);
  }
}
