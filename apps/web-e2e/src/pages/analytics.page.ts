import type { UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the premium league analytics surface (ADR-0015 §1):
 *   • /leagues/:leagueId/analytics — the analytics dashboard rendered by the
 *     shared `AnalyticsScreen` (`@legacy-sports/shared-components/analytics`),
 *     gated behind the route-level `PremiumGuard` (free users redirect to
 *     `/pricing`).
 *
 * Migrated to the platform-neutral driver interface (ADR-0016): the object is a
 * screen (extends {@link BaseScreen}, holds an `AppDriver`) and every read
 * getter returns a {@link UIElement}, so the same object is native-ready.
 *
 * Selectors are role/text-based rather than `data-testid`: the shared
 * `AnalyticsScreen` ships no test ids, and its headings render as accessible
 * `heading` roles (Tamagui `H2`/`H3`) and its tabs as `button` roles on both
 * web and native — all within the driver's portable selector vocabulary, so no
 * web-only surface is required. The redirect assertion for free users is a
 * cross-page URL check owned by the spec (no `/pricing` page object exists).
 *
 * The object exposes the three semantic surfaces (ADR-0015):
 *   • actions  — navigation + tab verbs (`goto`, `selectOverviewTab`, …)
 *   • reads    — element getters specs assert against (`header`, `loading`,
 *                `errorMessage`, section headings, tab buttons)
 *   • asserts  — retrying wrappers (`expectLoaded`, `expectLoading`,
 *                `expectErrorState`, `expectPowerRankingsVisible`, …)
 *
 * It carries no mocking or seed data — that stays in the spec + route handlers
 * (ADR-0015 §6).
 */
export class AnalyticsPage extends BaseScreen {
  // ── Reads: headline sections ─────────────────────────────────────

  /** The page header — `<H2>{leagueName} Analytics</H2>` (readiness anchor). */
  get header(): UIElement {
    return this.driver.byRole('heading', { name: /Analytics$/i });
  }

  /** The header for a specific league, e.g. "Test League Analytics". */
  headerFor(leagueName: string): UIElement {
    return this.driver.byRole('heading', {
      name: new RegExp(`${leagueName} Analytics`, 'i'),
    });
  }

  /** The "Week N • M Teams" subtitle under the header. */
  get subtitle(): UIElement {
    return this.driver.byText(/Week .+ Teams/i);
  }

  /** The Overview tab's "League Summary" card heading. */
  get leagueSummaryHeading(): UIElement {
    return this.driver.byRole('heading', { name: 'League Summary' });
  }

  /** The Overview tab's "Team Statistics" card heading. */
  get teamStatisticsHeading(): UIElement {
    return this.driver.byRole('heading', { name: 'Team Statistics' });
  }

  /** The Power Rankings card heading (Power Rankings tab). */
  get powerRankingsHeading(): UIElement {
    return this.driver.byRole('heading', {
      name: 'Power Rankings',
      exact: true,
    });
  }

  /** The Playoff Projections card heading (Playoff Projections tab). */
  get playoffProjectionsHeading(): UIElement {
    return this.driver.byRole('heading', {
      name: 'Playoff Projections',
      exact: true,
    });
  }

  // ── Reads: tab controls ──────────────────────────────────────────

  get overviewTab(): UIElement {
    return this.driver.byRole('button', { name: 'Overview' });
  }

  get powerRankingsTab(): UIElement {
    return this.driver.byRole('button', { name: 'Power Rankings' });
  }

  get playoffProjectionsTab(): UIElement {
    return this.driver.byRole('button', { name: 'Playoff Projections' });
  }

  // ── Reads: loading / error states ────────────────────────────────

  /** The initial loading spinner label (`loading && !data`). */
  get loading(): UIElement {
    return this.driver.byText('Loading analytics...');
  }

  /** The full-screen error heading (`!analytics`). */
  get errorHeading(): UIElement {
    return this.driver.byText('Error loading analytics');
  }

  /**
   * The analytics screen's "Retry" button (error / inline-error states).
   * Scoped to the `main-content` region: an unscoped role+name query also
   * matches an app-shell "Retry" affordance, tripping Playwright strict mode.
   */
  get retryButton(): UIElement {
    return this.driver
      .byTestId('main-content')
      .byRole('button', { name: 'Retry' });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Navigate to the analytics route for a league. Does NOT gate on a readiness
   * element — a free user is redirected to `/pricing` before the screen mounts,
   * so callers assert the destination themselves (`expectLoaded` for premium,
   * a URL check for the redirect).
   */
  async goto(leagueId: number): Promise<void> {
    await this.driver.open(`/leagues/${leagueId}/analytics`);
  }

  async selectOverviewTab(): Promise<void> {
    await this.overviewTab.tap();
  }

  async selectPowerRankingsTab(): Promise<void> {
    await this.powerRankingsTab.tap();
  }

  async selectPlayoffProjectionsTab(): Promise<void> {
    await this.playoffProjectionsTab.tap();
  }

  // ── Asserts ──────────────────────────────────────────────────────

  /** Assert the analytics dashboard rendered with its Overview headline sections. */
  async expectLoaded(): Promise<void> {
    await this.header.expectVisible({ timeout: 15000 });
    await this.overviewTab.expectVisible();
    await this.leagueSummaryHeading.expectVisible();
    await this.teamStatisticsHeading.expectVisible();
  }

  /** Assert the initial loading state is visible. */
  async expectLoading(): Promise<void> {
    await this.loading.expectVisible({ timeout: 15000 });
  }

  /**
   * Assert the error state rendered: the "Error loading analytics" heading, the
   * Retry affordance, and (when given) the surfaced error message.
   */
  async expectErrorState(message?: string | RegExp): Promise<void> {
    await this.errorHeading.expectVisible({ timeout: 15000 });
    await this.retryButton.expectVisible();
    if (message !== undefined) {
      // Scope to the screen region: a global app-shell alert/toast also echoes
      // the GraphQL error message, so an unscoped text query is ambiguous.
      await this.driver
        .byTestId('main-content')
        .byText(message)
        .expectVisible();
    }
  }

  /** Assert the Power Rankings tab content is visible after selecting it. */
  async expectPowerRankingsVisible(): Promise<void> {
    await this.powerRankingsHeading.expectVisible({ timeout: 15000 });
  }

  /** Assert the Playoff Projections tab content is visible after selecting it. */
  async expectPlayoffProjectionsVisible(): Promise<void> {
    await this.playoffProjectionsHeading.expectVisible({ timeout: 15000 });
  }
}
