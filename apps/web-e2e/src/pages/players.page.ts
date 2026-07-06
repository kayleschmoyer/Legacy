import { expect, type Locator, type Page } from '@playwright/test';

import { type AppDriver, PlaywrightWebDriver, type UIElement } from '../driver';
import { PremiumGate } from '../components/premium-gate.component';

/**
 * Page object for the player-facing routes (ADR-0015 §1, §4):
 *   - `/players/stats`            — the MLB statistics page
 *   - `/players/:id` / `:brefId`  — the player-detail modal route
 *   - `/players/compare`          — the premium player-comparison tool
 *
 * Locators are PRIVATE; specs interact only through the three semantic
 * surfaces (actions / reads / assertions). Because this object spans three
 * distinct routes, the per-route surfaces are grouped behind `stats`,
 * `detail`, and `compare` for readability — each is a thin, page-scoped helper
 * that owns its own private locators. The premium-gate overlay is composed via
 * the reusable {@link PremiumGate} component (ADR-0015 §2).
 *
 * Page objects carry no mocking or data setup — the same object drives both the
 * hermetic and integration suites (ADR-0015 §6). Specs keep their `page.route`
 * mocks; navigation and element access live here.
 *
 * ADR-0016 migration status (LS-8304 stage 1, LS-8305 stages 4-5):
 *   • The container and every surface (`stats`, `detail`, `compare`) are
 *     driver-typed (platform neutral). Navigation to stats/compare goes
 *     through `driver.open()`.
 *   • `detail` keeps only a slim, DOCUMENTED web-only remainder reached via the
 *     escape hatch below: `page.keyboard` (Escape-to-close), bfcache-aware
 *     `waitForURL(…, { waitUntil: 'commit' })`, the filter-by-descendant
 *     sort-table helpers, and the raw-`Locator` `dialog` / position-badge
 *     getters a few specs use for compound or `toHaveCSS` assertions.
 *   • `compare` is driver-typed with a slim, DOCUMENTED web-only remainder:
 *     `force: true` (the intentional premium-gate overlay bypass), `blur()` /
 *     `focus()` / `toBeFocused()`, `toHaveText(RegExp)`, and a negated
 *     contains-text cell assertion — none of which have a portable driver verb.
 *     The chip slot-color regression moved out of the spec entirely to
 *     PlayerComparison.stories.tsx (Chromatic); slot *identity* stays here as a
 *     platform-neutral `aria-label="Slot N"` check (LS-8352 stage 5).
 *   Constructing this object still REQUIRES the web driver because both
 *   `detail` and `compare` keep the web-only remainders above.
 */
export class PlayersPage {
  /** The blurred premium-gate overlay shared across premium-gated pages. */
  readonly premiumGate: PremiumGate;
  /** `/players/stats` surface (driver-typed — platform neutral). */
  readonly stats: PlayerStatsSurface;
  /** Player-detail modal surface (`/players/:id` and `/players/:brefId`). */
  readonly detail: PlayerDetailSurface;
  /** `/players/compare` surface. */
  readonly compare: PlayerCompareSurface;

  readonly #driver: AppDriver;
  /** Web escape hatch for the unmigrated surfaces + waitUntil navigation. */
  readonly #page: Page;

  constructor(driver: AppDriver) {
    this.#driver = driver;
    if (!(driver instanceof PlaywrightWebDriver)) {
      throw new Error(
        'PlayersPage requires the web driver: its detail/compare surfaces ' +
          'keep documented web-only remainders reached via the Page escape ' +
          'hatch (LS-8305 stages 4-5).',
      );
    }
    this.#page = driver.page;
    this.premiumGate = new PremiumGate(
      this.#page.getByTestId('premium-feature-gate'),
    );
    this.stats = new PlayerStatsSurface(driver);
    this.detail = new PlayerDetailSurface(driver, this.#page);
    this.compare = new PlayerCompareSurface(this.#driver, this.#page);
  }

  // ── Navigation ────────────────────────────────────────────────────

  /** Navigate to `/players/stats`. */
  async gotoStats(): Promise<void> {
    await this.#driver.open('/players/stats');
  }

  /**
   * Navigate to a player-detail deep link (`/players/:id`). Pass
   * `waitUntil: 'domcontentloaded'` to catch the loading state before stats
   * resolve; defaults to `'load'`. WEB-ONLY: `waitUntil` is a browser
   * navigation semantic (specs use it to freeze the loading state), so this
   * stays on the Page until the detail surface migrates (LS-8305 stage 4).
   */
  async gotoDetail(
    playerId: number,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'load',
  ): Promise<void> {
    await this.#page.goto(`/players/${playerId}`);
    await this.#page.waitForLoadState(waitUntil);
  }

  /** Navigate to a player-detail brefId deep link (`/players/:brefId`). */
  async gotoBrefId(
    brefId: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'load',
  ): Promise<void> {
    await this.#page.goto(`/players/${brefId}`);
    await this.#page.waitForLoadState(waitUntil);
  }

  /** Navigate to `/players/compare`. */
  async gotoCompare(): Promise<void> {
    await this.#driver.open('/players/compare');
  }

  // ── Shared reads / assertions ─────────────────────────────────────

  /** Assert the page did not render the global "Unexpected Application Error". */
  async expectNoApplicationError(): Promise<void> {
    await this.#driver.byText('Unexpected Application Error').expectCount(0);
  }
}

/** Escape a player name for use inside a case-insensitive RegExp. */
function nameRegExp(prefix: string, name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${prefix}\\s+${escaped}`, 'i');
}

// ===========================================================================
// /players/stats
// ===========================================================================

/**
 * Semantic surface for the `/players/stats` page. The page renders the title
 * as a styled `div` ("MLB Player Statistics"), a debounced search input, view
 * tabs (Combined / Hitters / Pitchers), and per-grid leader tables whose rows
 * carry `data-testid="player-row-<id>"`.
 */
class PlayerStatsSurface {
  readonly #driver: AppDriver;
  readonly #heading: UIElement;
  readonly #search: UIElement;
  readonly #battingGrid: UIElement;
  readonly #filterControls: UIElement;
  readonly #pageSizeSelect: UIElement;

  constructor(driver: AppDriver) {
    this.#driver = driver;
    this.#heading = driver.byText('MLB Player Statistics');
    this.#search = driver.byPlaceholder('Search player name · min 2 chars');
    this.#battingGrid = driver.byTestId('player-stats-data-grid');
    this.#filterControls = driver.byTestId('filter-controls');
    // The "Rows" dropdown is a native <select> inside the testid wrapper —
    // resolved via its implicit combobox role (portable) rather than a CSS
    // element selector (ADR-0016).
    this.#pageSizeSelect = driver
      .byTestId('page-size-select')
      .byRole('combobox');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Type a search term into the stats search input. */
  async search(term: string): Promise<void> {
    await this.#search.fill(term);
    await this.#search.expectValue(term);
  }

  /** Clear the stats search input. */
  async clearSearch(): Promise<void> {
    await this.#search.clear();
    await this.#search.expectValue('');
  }

  /** Switch the stats view via its tab (Combined / Hitters / Pitchers). */
  async switchView(name: 'Combined' | 'Hitters' | 'Pitchers'): Promise<void> {
    await this.#driver.byRole('tab', { name }).tap();
  }

  /** Select a rows-per-page value from the "Rows" dropdown (draft — call clickApplyFilters to commit). */
  async selectPageSize(n: 10 | 25 | 50 | 100): Promise<void> {
    await this.#pageSizeSelect.selectOption(String(n));
  }

  /** Click the "Apply filters" button to commit the current draft filter state. */
  async clickApplyFilters(): Promise<void> {
    await this.#driver.byTestId('apply-filters-button').tap();
  }

  /** Click a column header by label (e.g. to sort). */
  async clickColumnHeader(label: string): Promise<void> {
    await this.#driver.byText(label, { exact: true }).first().tap();
  }

  /** Open the "Advanced" filters panel (range sliders — LS-3825). */
  async openAdvancedFilters(): Promise<void> {
    const advancedButton = this.#driver.byRole('button', {
      name: /Advanced/i,
    });
    await advancedButton.expectVisible({ timeout: 10_000 });
    await advancedButton.tap();
  }

  /**
   * Drive the "Min Home Runs" range slider to (approximately) `target` career
   * HR via the keyboard: Home zeroes it, each ArrowUp advances one `step` and
   * fires onKeyUp → the debounced onCommit → applyFilters refetch. The press
   * count derives from the live `step` attribute so a cap/step change cannot
   * silently break the verb, and the settled value is asserted as
   * presses × step (mirrors the LS-8248 fix in the live integration spec).
   */
  async setMinHomeRuns(target: number): Promise<void> {
    const slider = this.#driver.byLabel('Min Home Runs');
    await slider.expectVisible({ timeout: 10_000 });

    const step = Number(await slider.attribute('step')) || 1;
    const presses = Math.round(target / step);

    await slider.press('Home');
    await slider.expectValue('0');
    for (let i = 0; i < presses; i++) {
      await slider.press('ArrowUp');
    }
    await slider.expectValue(String(presses * step));
  }

  /** Open a player's detail modal by clicking their row (matched by name). */
  async openPlayerByName(name: string): Promise<void> {
    await this.#driver.byText(name).first().tap();
  }

  /** Click the "Share player statistics link" button. */
  async clickShare(): Promise<void> {
    await this.#driver
      .byRole('button', { name: 'Share player statistics link' })
      .tap();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** A player row by id (`data-testid="player-row-<id>"`). */
  row(playerId: number): UIElement {
    return this.#driver.byTestId(`player-row-${playerId}`);
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the stats page heading is visible. */
  async expectLoaded(timeout = 15000): Promise<void> {
    await this.#heading.first().expectVisible({ timeout });
  }

  /** Assert the search input is visible. */
  async expectSearchVisible(): Promise<void> {
    await this.#search.expectVisible();
  }

  /** Assert a view tab is visible. */
  async expectTabVisible(
    name: 'Combined' | 'Hitters' | 'Pitchers',
    timeout?: number,
  ): Promise<void> {
    await this.#driver.byRole('tab', { name }).expectVisible({ timeout });
  }

  /** Assert a view tab is the selected one. */
  async expectTabSelected(
    name: 'Combined' | 'Hitters' | 'Pitchers',
  ): Promise<void> {
    await this.#driver
      .byRole('tab', { name })
      .expectAttribute('aria-selected', 'true');
  }

  /** Assert the batting-leaders heading is visible. */
  async expectBattingLeaders(): Promise<void> {
    await this.#driver
      .byText('MLB Career Batting Leaders')
      .first()
      .expectVisible();
  }

  /** Assert the pitching-leaders heading is visible. */
  async expectPitchingLeaders(): Promise<void> {
    await this.#driver.byText('MLB Career Pitching Leaders').expectVisible();
  }

  /** Assert the pitching-leaders heading is NOT in the DOM (Hitters tab active). */
  async expectPitchingLeadersNotVisible(): Promise<void> {
    await this.#driver.byText('MLB Career Pitching Leaders').expectHidden();
  }

  /** Assert the batting-leaders heading is NOT in the DOM (Pitchers tab active). */
  async expectBattingLeadersNotVisible(): Promise<void> {
    await this.#driver
      .byText('MLB Career Batting Leaders')
      .first()
      .expectHidden();
  }

  /** Assert a player name is visible somewhere on the page. */
  async expectPlayerVisible(name: string, timeout?: number): Promise<void> {
    await this.#driver.byText(name).expectVisible({ timeout });
  }

  /** Assert a value is rendered inside a specific player row. */
  async expectRowValue(playerId: number, value: string): Promise<void> {
    await this.row(playerId).byText(value).expectVisible();
  }

  /** Assert at least one player row is rendered (any `player-row-*`). */
  async expectAnyRowVisible(timeout = 15_000): Promise<void> {
    await this.#driver
      .byTestIdPrefix('player-row-')
      .first()
      .expectVisible({ timeout });
  }

  /** Assert a data-grid column header is visible. */
  async expectColumnHeader(label: string): Promise<void> {
    await this.#driver.byText(label, { exact: true }).first().expectVisible();
  }

  /** Assert a data-grid column header is present in the DOM (attached). Use
   * for columns in a horizontally-scrollable grid that may be off-screen. */
  async expectColumnHeaderAttached(label: string): Promise<void> {
    await this.#driver.byText(label, { exact: true }).first().expectAttached();
  }

  /** Assert a data-grid column header is NOT visible (grid is unmounted). */
  async expectColumnHeaderAbsent(label: string): Promise<void> {
    await this.#driver.byText(label, { exact: true }).first().expectHidden();
  }

  /** Assert the filter-controls toolbar is visible. */
  async expectFilterControls(): Promise<void> {
    await this.#filterControls.expectVisible();
  }

  /** Assert the "Rows" page-size selector is visible. */
  async expectRowsSelectorVisible(): Promise<void> {
    await this.#pageSizeSelect.expectVisible();
  }

  /** Assert a specific page-size option (e.g. 100) is present in the selector. */
  async expectPageSizeOptionAvailable(n: number): Promise<void> {
    await expect
      .poll(() => this.#pageSizeSelect.optionValues())
      .toContain(String(n));
  }

  /** Assert a specific page-size option (e.g. 100) is NOT present in the selector. */
  async expectPageSizeOptionAbsent(n: number): Promise<void> {
    await expect
      .poll(() => this.#pageSizeSelect.optionValues())
      .not.toContain(String(n));
  }

  /** Assert the selector's current value matches `n`. */
  async expectPageSizeSelected(n: number): Promise<void> {
    await this.#pageSizeSelect.expectValue(String(n));
  }

  /** Assert the batting grid's pagination controls render. */
  async expectPaginationControls(): Promise<void> {
    await this.#battingGrid.byRole('button', { name: /next/i }).expectVisible();
    await this.#battingGrid
      .byRole('button', { name: /previous|prev/i })
      .expectVisible();
  }

  /** Assert the batting grid shows its loading indicator. */
  async expectLoadingIndicator(timeout = 5000): Promise<void> {
    await this.#battingGrid
      .byTestId('loading-indicator')
      .expectVisible({ timeout });
  }

  /** Assert the batting grid shows its inline error message. */
  async expectGridError(timeout = 5000): Promise<void> {
    await this.#battingGrid
      .byTestId('error-message')
      .expectVisible({ timeout });
  }

  /** Assert a full-page empty/error state message is visible by text. */
  async expectMessage(text: string): Promise<void> {
    await this.#driver.byText(text).expectVisible();
  }

  /** Assert the marketing landing page ("Dominate Your League") is NOT shown. */
  async expectMarketingLandingHidden(): Promise<void> {
    await this.#driver.byText(/dominate your league/i).expectHidden();
  }

  /** Assert the share button is visible. */
  async expectShareButtonVisible(): Promise<void> {
    await this.#driver
      .byRole('button', { name: 'Share player statistics link' })
      .expectVisible();
  }

  /** Assert the share confirmation toast is visible and contains text. */
  async expectShareToast(text: string): Promise<void> {
    await this.#driver.byTestId('stats-share-toast').expectContainsText(text);
  }

  /** Assert no share toast is mounted (liveMsg is empty). */
  async expectShareToastHidden(): Promise<void> {
    await this.#driver.byTestId('stats-share-toast').expectNotAttached();
  }

  /** Assert the fallback URL input ("Shareable link to copy") is visible. */
  async expectShareFallbackInput(): Promise<void> {
    await this.#driver.byLabel('Shareable link to copy').expectVisible();
  }

  /** Assert an arbitrary value/label is visible on the stats page. */
  async expectText(
    text: string | RegExp,
    opts: { exact?: boolean; first?: boolean; timeout?: number } = {},
  ): Promise<void> {
    const { exact, first = true, timeout } = opts;
    const element =
      typeof text === 'string'
        ? this.#driver.byText(text, { exact })
        : this.#driver.byText(text);
    await (first ? element.first() : element).expectVisible({ timeout });
  }
}

// ===========================================================================
// /players/:id  +  /players/:brefId  (detail modal)
// ===========================================================================

/** Detail-modal stat-tab label → test id (expectTabVisible / expectTabHidden). */
const TAB_TEST_IDS = {
  'Career Arc': 'tab-career-arc',
  Batting: 'tab-batting',
  Pitching: 'tab-pitching',
  Fielding: 'tab-fielding',
} as const;

/**
 * Semantic surface for the player-detail modal route (ADR-0016 stage 4).
 *
 * Driver-typed: all reads/actions/assertions resolve through the platform
 * {@link AppDriver}, scoped to the modal by its stable `player-detail-modal`
 * test id (BaseModal → Dialog.Content, stage 3 — replaces the old
 * `[role="dialog"][aria-modal="true"]` CSS selector; the id is precise enough
 * to exclude Tamagui sheets / select portals, the LS-5807 concern, and maps to
 * the accessibility id on native). The brefId route additionally renders a
 * loading `status` and (on miss) an inline `alert`.
 *
 * A slim, DOCUMENTED web-only remainder still reaches the Playwright `Page`
 * (constructed alongside the driver): bfcache-aware back navigation
 * (`waitForURL(commit)`), page-level `keyboard` (Escape-to-close), the
 * filter-by-descendant sort-table helpers, `focus()`, and the raw-`Locator`
 * `dialog` / position-badge getters that a handful of specs use for compound
 * or CSS (`toHaveCSS`) assertions — the latter bound for Storybook in stage 5.
 */
class PlayerDetailSurface {
  readonly #driver: AppDriver;
  /** Web escape hatch for the documented web-only remainder (see class doc). */
  readonly #page: Page;
  readonly #dialog: UIElement;
  readonly #loading: UIElement;

  constructor(driver: AppDriver, page: Page) {
    this.#driver = driver;
    this.#page = page;
    this.#dialog = driver.byTestId('player-detail-modal');
    this.#loading = driver.byTestId('player-detail-loading');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Switch the modal's stat tab (Career Arc / Batting / Pitching / Fielding).
   * Plain click: the tab controls sit inside the dialog content, above the
   * overlay, so nothing intercepts the pointer — the old `force: true` bypass
   * was cargo-culted from the compare surface and is not needed here.
   */
  async switchTab(
    name: 'Career Arc' | 'Batting' | 'Pitching' | 'Fielding',
  ): Promise<void> {
    await this.#dialog.byText(name, { exact: true }).first().tap();
  }

  /** Click the modal's Close (X) button. */
  async close(): Promise<void> {
    const btn = this.#dialog.byRole('button', { name: 'Close' });
    await btn.expectVisible({ timeout: 5000 });
    await btn.tap();
  }

  /**
   * Press Escape to close the modal. WEB-ONLY: page-level keyboard input has no
   * portable driver verb (a native driver dismisses via a back gesture).
   */
  async pressEscape(): Promise<void> {
    await this.#page.keyboard.press('Escape');
  }

  /** Click the "Open full page" external-link button to navigate to /players/:id. */
  async openFullPage(): Promise<void> {
    await this.#dialog.byRole('button', { name: /open full page/i }).tap();
  }

  /**
   * Click the in-modal "← Back" button. Scoped to the dialog: on the standalone
   * `/players/:id` route the page also renders its own `.player-back-btn` under
   * the modal overlay, so a page-wide match would be strict-mode-ambiguous (and
   * would resolve the covered, unclickable button). The reachable control is the
   * in-masthead Back button, which lives inside the dialog (LS-5578 / LS-8311).
   */
  async back(): Promise<void> {
    await this.#dialog.byRole('button', { name: /← back/i }).tap();
  }

  /**
   * Wait for navigation back to the stats list. WEB-ONLY: the regex covers
   * /players/stats with or without query params, and `waitUntil: 'commit'` is
   * required for bfcache restores (navigate(-1)) which don't fire the 'load'
   * event the default condition waits for — a browser navigation semantic.
   */
  async waitForStatsList(): Promise<void> {
    await this.#page.waitForURL(/\/players\/stats/, { waitUntil: 'commit' });
  }

  // ── Reads ────────────────────────────────────────────────────────

  /**
   * The modal dialog root as a raw `Locator` — WEB-ONLY escape hatch for the
   * compound `dialog.getByTestId(...)` assertions a few specs build inline
   * (career-summary-cards, season tables, career-arc). Resolves by the same
   * `player-detail-modal` test id the driver-typed reads use.
   */
  get dialog(): Locator {
    return this.#page.getByTestId('player-detail-modal');
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the modal dialog is open. */
  async expectOpen(): Promise<void> {
    await this.#dialog.expectVisible();
  }

  /** Assert the modal dialog is not mounted/visible. */
  async expectClosed(): Promise<void> {
    await this.#dialog.expectHidden();
  }

  /** Assert the loading spinner is visible. */
  async expectLoading(): Promise<void> {
    await this.#loading.expectVisible();
  }

  /** Assert the loading spinner has cleared. */
  async expectNotLoading(): Promise<void> {
    await this.#loading.expectHidden();
  }

  /**
   * Assert the loading spinner never mounted. The spinner renders only while
   * `loading && !displayData`; on a cache hit `displayData` is present on the
   * first render, so the spinner element is absent from the settled DOM. This
   * is a deterministic check on the final state — not a race against a timing
   * window — so pair it with a positive ready signal (e.g.
   * {@link expectCareerBattingCard}) that proves the data has already rendered.
   */
  async expectNeverLoaded(): Promise<void> {
    await this.#loading.expectCount(0);
  }

  /** Assert the in-modal "← Back" button is visible (scoped to the dialog to
   * avoid the page-level `.player-back-btn` on the standalone route). */
  async expectBackButton(): Promise<void> {
    await this.#dialog
      .byRole('button', { name: /← back/i })
      .expectVisible({ timeout: 15000 });
  }

  /** Assert the eligible-positions section is visible. */
  async expectEligiblePositions(): Promise<void> {
    await this.#dialog.byTestId('eligible-positions').expectVisible();
  }

  /** Assert the career-batting summary card is visible. */
  async expectCareerBattingCard(): Promise<void> {
    await this.#dialog.byTestId('career-batting-card').expectVisible();
  }

  /** Assert the career-batting summary card is absent (detached or never mounted). */
  async expectNoCareerBattingCard(timeout = 3000): Promise<void> {
    await this.#dialog
      .byTestId('career-batting-card')
      .expectNotAttached({ timeout });
  }

  /** Assert the career-pitching summary card is visible. */
  async expectCareerPitchingCard(): Promise<void> {
    await this.#dialog.byTestId('career-pitching-card').expectVisible();
  }

  /** Assert the empty-state (no seasons) is visible. */
  async expectEmptyState(): Promise<void> {
    await this.#dialog.byTestId('player-detail-empty').expectVisible();
  }

  /** Assert the error-state is visible. */
  async expectErrorState(): Promise<void> {
    await this.#dialog.byTestId('player-detail-error').expectVisible();
  }

  /** Assert the eligible-positions band is NOT visible. */
  async expectEligiblePositionsNotVisible(): Promise<void> {
    await this.#dialog.byTestId('eligible-positions').expectHidden();
  }

  /**
   * All position badge elements in the eligible-positions band — WEB-ONLY raw
   * `Locator`: specs run `toHaveCSS` color assertions on these, which LS-8305
   * stage 5 relocates to Storybook.
   */
  getPlayerPositionBadges(): Locator {
    return this.dialog.getByTestId('player-position');
  }

  /** A single position badge filtered by its abbreviation text (WEB-ONLY). */
  getPlayerPositionBadge(abbr: string): Locator {
    return this.getPlayerPositionBadges().filter({ hasText: abbr });
  }

  /** Assert exactly `n` position badges are rendered. */
  async expectPlayerPositionCount(n: number): Promise<void> {
    await this.#dialog.byTestId('player-position').expectCount(n);
  }

  /** Assert the "No fantasy eligibility yet" placeholder is visible. */
  async expectEligiblePositionsUnranked(): Promise<void> {
    await this.#dialog.byTestId('eligible-positions-unranked').expectVisible();
  }

  /** Assert the career-batting summary card is NOT visible. */
  async expectCareerBattingCardNotVisible(): Promise<void> {
    await this.#dialog.byTestId('career-batting-card').expectHidden();
  }

  /** Assert the stat tab with the given label is present in the tab bar. */
  async expectTabVisible(
    name: 'Career Arc' | 'Batting' | 'Pitching' | 'Fielding',
  ): Promise<void> {
    await this.#dialog.byTestId(TAB_TEST_IDS[name]).expectVisible();
  }

  /** Assert the stat tab with the given label is absent from the tab bar. */
  async expectTabHidden(
    name: 'Career Arc' | 'Batting' | 'Pitching' | 'Fielding',
  ): Promise<void> {
    await this.#dialog.byTestId(TAB_TEST_IDS[name]).expectCount(0);
  }

  /** Wait until the player name is visible in the modal header. */
  async waitForPlayerName(name: string, timeout = 5000): Promise<void> {
    await this.#dialog.byText(name).first().expectVisible({ timeout });
  }

  /**
   * Assert text is visible within the modal. `exact` matches the whole node;
   * `first` (default true) resolves strict-mode collisions on repeated labels.
   */
  async expectText(
    text: string | RegExp,
    opts: { exact?: boolean; first?: boolean } = {},
  ): Promise<void> {
    const { exact, first = true } = opts;
    const element =
      typeof text === 'string'
        ? this.#dialog.byText(text, { exact })
        : this.#dialog.byText(text);
    await (first ? element.first() : element).expectVisible();
  }

  // ── Season-table sorting ─────────────────────────────────────────

  /**
   * The sort button for `column` (e.g. 'ERA', 'Year') inside the modal —
   * WEB-ONLY raw `Locator`, paired with the filter-by-descendant
   * {@link columnHeader} the narrow driver vocabulary can't express.
   */
  sortButton(column: string): Locator {
    return this.dialog.getByRole('button', {
      name: `Sort by ${column}`,
      exact: true,
    });
  }

  /** The `columnheader` cell that wraps the sort button for `column` (WEB-ONLY). */
  columnHeader(column: string): Locator {
    return this.dialog.getByRole('columnheader').filter({
      has: this.#page.getByRole('button', {
        name: `Sort by ${column}`,
        exact: true,
      }),
    });
  }

  /** The full text content of the modal dialog. */
  async dialogTextContent(): Promise<string> {
    return this.#dialog.text();
  }

  /** Assert the sort button for `column` is visible. */
  async expectSortButtonVisible(column: string): Promise<void> {
    await this.#dialog
      .byRole('button', { name: `Sort by ${column}`, exact: true })
      .expectVisible();
  }

  /** Click the sort button for `column`. */
  async clickSortButton(column: string): Promise<void> {
    await this.#dialog
      .byRole('button', { name: `Sort by ${column}`, exact: true })
      .tap();
  }

  /** Focus the sort button for `column`. WEB-ONLY: `focus()` has no driver verb. */
  async focusSortButton(column: string): Promise<void> {
    await this.sortButton(column).focus();
  }

  /**
   * Assert the `aria-sort` value on the columnheader for `column`. WEB-ONLY:
   * the columnheader is resolved by filter-by-descendant (see {@link columnHeader}).
   */
  async expectSortDirection(
    column: string,
    direction: 'none' | 'ascending' | 'descending',
  ): Promise<void> {
    await expect(this.columnHeader(column)).toHaveAttribute(
      'aria-sort',
      direction,
    );
  }

  /** Assert the given text is NOT visible anywhere inside the modal dialog. */
  async expectTextAbsent(text: string | RegExp): Promise<void> {
    await this.#dialog.byText(text).expectHidden();
  }

  // ── brefId route ─────────────────────────────────────────────────

  /** Assert the brefId loading `status` indicator is visible. */
  async expectLoadingStatus(): Promise<void> {
    await this.#driver.byRole('status').expectVisible();
  }

  /** Assert the brefId "No player found" alert is visible. */
  async expectNotFoundAlert(): Promise<void> {
    const alert = this.#driver.byRole('alert');
    await alert.expectVisible();
    await alert.expectContainsText('No player found');
  }
}

// ===========================================================================
// /players/compare
// ===========================================================================

/**
 * Semantic surface for the `/players/compare` premium comparison tool. Owns
 * the comparison search, the selected-player chips, the comparison table, and
 * the season-by-season breakdown tables. Comparison rows are matched by their
 * stat label; the BEST badge and stat values are asserted relative to a row.
 */
class PlayerCompareSurface {
  readonly #driver: AppDriver;
  /** Web escape hatch for the documented web-only remainder (see class doc). */
  readonly #page: Page;
  readonly #search: UIElement;
  readonly #suggestions: UIElement;
  readonly #selectedPlayers: UIElement;
  readonly #table: UIElement;

  constructor(driver: AppDriver, page: Page) {
    this.#driver = driver;
    this.#page = page;
    this.#search = driver.byLabel('Search players to compare');
    this.#suggestions = driver.byLabel('Player suggestions');
    this.#selectedPlayers = driver.byLabel('Selected players');
    this.#table = driver.byRole('table', { name: 'Player comparison' });
  }

  /**
   * The search input as a raw `Locator` — WEB-ONLY escape hatch for the
   * `force: true` premium-gate bypass, `blur()`, and `toBeFocused()` below,
   * none of which have a portable driver verb. Resolves by the same accessible
   * label the driver-typed `#search` uses.
   */
  #searchInput(): Locator {
    return this.#page.getByLabel('Search players to compare');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Add a player by typing `searchTerm` and tapping the `fullName` result.
   * Retry-wrapped: the suggestion dropdown can close on a stale blur, so the
   * fill + tap is retried until it lands (mirrors every comparison spec).
   * `fill()` focuses the input itself, so the old explicit `focus()` before it
   * was redundant and is dropped (same cleanup as the detail surface).
   */
  async addPlayer(searchTerm: string, fullName: string): Promise<void> {
    const result = this.#driver.byText(fullName);
    await expect(async () => {
      await this.#search.clear();
      await this.#search.fill(searchTerm);
      await result.expectVisible({ timeout: 5000 });
      await result.tap();
    }).toPass({ timeout: 15000 });
  }

  /**
   * As {@link addPlayer} but forces each interaction past the gate overlay.
   * WEB-ONLY: `force: true` bypasses the PremiumGate overlay's `pointerEvents:
   * 'none'` on blurred content for non-premium users (an intentional gate, not
   * the LS-5807 overlay bug) — there is no portable "click through an overlay"
   * driver verb, so this stays on the raw `Locator`.
   */
  async addPlayerForce(searchTerm: string, fullName: string): Promise<void> {
    const search = this.#searchInput();
    await expect(async () => {
      await search.clear({ force: true });
      await search.fill(searchTerm, { force: true });
      await expect(this.#page.getByText(fullName)).toBeVisible({
        timeout: 5000,
      });
      await this.#page
        .getByText(fullName)
        .click({ force: true, timeout: 5000 });
    }).toPass({ timeout: 15000 });
  }

  /** Type into the comparison search input without selecting a result. */
  async typeSearch(term: string): Promise<void> {
    await this.#search.fill(term);
    await this.#search.expectValue(term);
  }

  /**
   * Blur the comparison search input (drives the blur-before-click race).
   * WEB-ONLY: `blur()` has no portable driver verb (native dismisses focus via
   * a tap elsewhere, not an explicit blur).
   */
  async blurSearch(): Promise<void> {
    await this.#searchInput().blur();
  }

  /** Click a suggestion in the dropdown by player name. */
  async clickSuggestion(name: string): Promise<void> {
    await this.#suggestions.byText(name).first().tap();
  }

  /** Remove a selected player via their chip's Remove button (matched by name). */
  async removePlayer(fullName: string): Promise<void> {
    await this.#driver
      .byRole('button', { name: nameRegExp('remove', fullName) })
      .tap();
  }

  /** Click the empty-slot chip-button for the given slot number. */
  async clickEmptySlot(slotNumber: number): Promise<void> {
    await this.#driver
      .byRole('button', { name: `Slot ${slotNumber} empty — add a player` })
      .tap();
  }

  /**
   * Focus the empty-slot chip-button for the given slot number. WEB-ONLY:
   * `focus()` has no portable driver verb.
   */
  async focusEmptySlot(slotNumber: number): Promise<void> {
    await this.#page
      .getByRole('button', { name: `Slot ${slotNumber} empty — add a player` })
      .focus();
  }

  /** Click "Undo" in the remove-player toast (matched by player name). */
  async clickUndoRemove(fullName: string): Promise<void> {
    await this.#driver
      .byRole('button', { name: nameRegExp('undo removing', fullName) })
      .tap();
  }

  /** Click the "Get Started Free" CTA shown to unauthenticated visitors. */
  async clickGetStartedFree(): Promise<void> {
    await this.#driver.byRole('button', { name: /get started free/i }).tap();
  }

  /** Click a season-breakdown expand/collapse toggle by player id. */
  async clickSeasonExpand(playerId: number): Promise<void> {
    await this.#driver.byTestId(`season-expand-${playerId}`).tap();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** A comparison-table row matched by its stat label. */
  row(label: string | RegExp): UIElement {
    return this.#driver.byRole('row').filterByText(label);
  }

  /** A selected-player chip by player id. */
  chip(playerId: number): UIElement {
    return this.#driver.byTestId(`selected-chip-${playerId}`);
  }

  /** A season-breakdown table by kind + player name. */
  seasonTable(kind: 'batting' | 'pitching', playerName: string): UIElement {
    return this.#driver.byRole('table', {
      name: `Season ${kind} for ${playerName}`,
    });
  }

  // ── Assertions: search & selection ───────────────────────────────

  /** Assert the comparison search input is visible. */
  async expectSearchVisible(): Promise<void> {
    await this.#search.expectVisible();
  }

  /** Assert the comparison search input is enabled. */
  async expectSearchEnabled(): Promise<void> {
    await this.#search.expectEnabled();
  }

  /**
   * Assert the search input is focused. WEB-ONLY: `toBeFocused()` has no
   * portable driver assertion (focus is not a first-class native concept).
   */
  async expectSearchFocused(): Promise<void> {
    await expect(this.#searchInput()).toBeFocused();
  }

  /** Assert the search input has the given value. */
  async expectSearchValue(value: string): Promise<void> {
    await this.#search.expectValue(value);
  }

  /** Assert the capacity-reached placeholder is shown and the input disabled. */
  async expectSearchAtCapacity(): Promise<void> {
    const input = this.#driver.byPlaceholder(
      '4 players selected — remove one to add more',
    );
    await input.expectVisible();
    await input.expectDisabled();
  }

  /** Assert the default-capacity placeholder ("Search player name…") is shown. */
  async expectSearchPlaceholderDefault(): Promise<void> {
    await this.#driver.byPlaceholder('Search player name…').expectVisible();
  }

  /** Assert the suggestions dropdown is not visible. */
  async expectSuggestionsHidden(timeout = 2000): Promise<void> {
    await this.#suggestions.expectHidden({ timeout });
  }

  /** Assert a suggestion with `name` is visible in the dropdown. */
  async expectSuggestionVisible(name: string, timeout?: number): Promise<void> {
    await this.#suggestions.byText(name).expectVisible({ timeout });
  }

  /** Assert a suggestion with `name` is NOT visible in the dropdown. */
  async expectSuggestionHidden(name: string): Promise<void> {
    await this.#suggestions.byText(name).expectHidden();
  }

  /** Wait until the suggestions dropdown is visible (retry-wrapped fill). */
  async expectSuggestionsVisibleAfterTyping(
    term: string,
    timeout = 10000,
  ): Promise<void> {
    await expect(async () => {
      await this.#search.fill(term);
      await this.#suggestions.expectVisible({ timeout: 3000 });
    }).toPass({ timeout });
  }

  /** Assert a selected-player chip (by id) is visible. */
  async expectChipVisible(playerId: number): Promise<void> {
    await this.chip(playerId).expectVisible();
  }

  /** Assert a selected-player chip (by id) is not visible. */
  async expectChipHidden(playerId: number): Promise<void> {
    await this.chip(playerId).expectHidden();
  }

  /** Assert a selected-player chip (by id) has count 0. */
  async expectChipCount(playerId: number, count: number): Promise<void> {
    await this.chip(playerId).expectCount(count);
  }

  /** Assert a chip contains the given text (name / position). */
  async expectChipContains(playerId: number, text: string): Promise<void> {
    await this.chip(playerId).expectContainsText(text);
  }

  /**
   * Assert a chip carries the slot-`slot` badge (1-indexed). The {@link SlotBadge}
   * renders `aria-label="Slot N"` as the PRIMARY, color-blind-safe slot
   * differentiator (PCM-044 / LS-7039); the accent colors are a secondary cue.
   * This replaces the old `toHaveCSS` border/dot-color assertions — the color
   * regression itself now lives in PlayerComparison.stories.tsx (Chromatic),
   * while slot *identity* (and its stability across removals) stays here as a
   * platform-neutral behavioral check.
   */
  async expectChipSlot(playerId: number, slot: number): Promise<void> {
    await this.chip(playerId).byLabel(`Slot ${slot}`).expectVisible();
  }

  /** Assert the player's Remove button is visible. */
  async expectRemoveButton(fullName: string): Promise<void> {
    await this.#driver
      .byRole('button', { name: nameRegExp('remove', fullName) })
      .expectVisible();
  }

  /** Assert the player's Remove button carries the id-based test id. */
  async expectRemoveTestId(playerId: number): Promise<void> {
    await this.#driver.byTestId(`remove-player-${playerId}`).expectVisible();
  }

  /** Assert the selected-players container is visible. */
  async expectSelectedPlayersContainer(): Promise<void> {
    await this.#selectedPlayers.expectVisible();
  }

  /** Assert the number of empty-slot placeholders in the selection bar. */
  async expectEmptySlotCount(count: number): Promise<void> {
    await this.#selectedPlayers.byText(/slot.*empty/i).expectCount(count);
  }

  /** Assert an "Slot N · empty" placeholder text is visible. */
  async expectEmptySlotText(slotNumber: number): Promise<void> {
    await this.#driver.byText(`Slot ${slotNumber} · empty`).expectVisible();
  }

  /** Assert an empty-slot chip-button is visible. */
  async expectEmptySlotButton(slotNumber: number): Promise<void> {
    await this.#driver
      .byRole('button', {
        name: `Slot ${slotNumber} empty — add a player`,
      })
      .expectVisible();
  }

  /** Assert the "N of 4 selected · M slots open" count hint. */
  async expectCountHint(text: string): Promise<void> {
    await this.#driver.byText(text).expectVisible();
  }

  /** Assert the "Add player · up to 4" slot label is visible. */
  async expectSlotLabel(): Promise<void> {
    await this.#driver.byText('Add player · up to 4').expectVisible();
  }

  /** Assert the undo-remove toast is visible and names the removed player. */
  async expectUndoToast(fullName: string): Promise<void> {
    const toast = this.#driver.byTestId('undo-remove-toast');
    await toast.expectVisible();
    await toast.expectContainsText(`Removed ${fullName}`);
  }

  /** Assert the undo-remove toast is no longer present. */
  async expectUndoToastGone(): Promise<void> {
    await this.#driver.byTestId('undo-remove-toast').expectCount(0);
  }

  // ── Assertions: states ───────────────────────────────────────────

  /** Assert the empty-state `status` region is visible (0-player card). */
  async expectStatusVisible(): Promise<void> {
    await this.#driver.byRole('status').expectVisible();
  }

  /** Assert the 0-player empty-state heading ("Nobody on deck yet") is visible. */
  async expectEmptyStateHeading(): Promise<void> {
    await this.#driver.byText('Nobody on deck yet').expectVisible();
  }

  /** Assert the empty-state heading is hidden. */
  async expectEmptyStateHidden(): Promise<void> {
    await this.#driver.byText('Nobody on deck yet').expectHidden();
  }

  /** Assert the empty-state "add at least two players" prompt is visible. */
  async expectEmptyStatePrompt(): Promise<void> {
    await this.#driver
      .byText(/add at least two players to begin comparing/i)
      .expectVisible();
  }

  /** Assert the one-player minimum-selection nudge is visible. */
  async expectOnePlayerNudge(): Promise<void> {
    await this.#driver.byText('One player on deck.').expectVisible();
  }

  /** Assert the one-player nudge is hidden. */
  async expectOnePlayerNudgeHidden(): Promise<void> {
    await this.#driver.byText('One player on deck.').expectHidden();
  }

  /** Assert the "add at least one more for head-to-head" copy is visible. */
  async expectAddOneMoreHint(): Promise<void> {
    await this.#driver
      .byText(/add at least one more to run the head-to-head/i)
      .expectVisible();
  }

  /** Assert the legacy "add at least 2 players to run the comparison" hint. */
  async expectMinimumPlayersHint(): Promise<void> {
    await this.#driver
      .byText(/add at least 2 players to run the comparison/i)
      .expectVisible();
  }

  /** Assert the legacy minimum-players hint is hidden. */
  async expectMinimumPlayersHintHidden(): Promise<void> {
    await this.#driver
      .byText(/add at least 2 players to run the comparison/i)
      .expectHidden();
  }

  // ── Assertions: comparison table ─────────────────────────────────

  /** Assert the comparison table is visible. */
  async expectTableVisible(): Promise<void> {
    await this.#table.expectVisible();
  }

  /** Assert the comparison table is hidden. */
  async expectTableHidden(): Promise<void> {
    await this.#table.expectHidden();
  }

  /** Assert the "Head-to-Head" section heading is visible (exact by default). */
  async expectHeadToHeadVisible(): Promise<void> {
    await this.#driver
      .byRole('heading', { name: 'Head-to-Head' })
      .expectVisible();
  }

  /** Assert no "Head-to-Head" heading is shown. */
  async expectHeadToHeadHidden(): Promise<void> {
    await this.#driver
      .byRole('heading', { name: /head-to-head/i })
      .expectHidden();
  }

  /** Assert a section header is visible (matched by text; pass a RegExp for fuzzy). */
  async expectSectionVisible(
    name: string | RegExp,
    opts: { exact?: boolean } = {},
  ): Promise<void> {
    const element =
      typeof name === 'string'
        ? this.#driver.byText(name, { exact: opts.exact })
        : this.#driver.byText(name);
    await element.first().expectVisible();
  }

  /** Assert a section header is hidden. */
  async expectSectionHidden(
    name: string | RegExp,
    opts: { exact?: boolean } = {},
  ): Promise<void> {
    const element =
      typeof name === 'string'
        ? this.#driver.byText(name, { exact: opts.exact })
        : this.#driver.byText(name);
    await element.first().expectHidden();
  }

  /** Assert a `rowgroup` section (e.g. "Career Batting") is visible. */
  async expectRowGroupVisible(name: string): Promise<void> {
    await this.#driver.byRole('rowgroup').filterByText(name).expectVisible();
  }

  /** Assert every given row label is present inside the named `rowgroup`. */
  async expectRowLabelsInGroup(
    groupName: string,
    labels: readonly string[],
  ): Promise<void> {
    const section = this.#driver.byRole('rowgroup').filterByText(groupName);
    for (const label of labels) {
      await section.byRole('row').filterByText(label).first().expectVisible();
    }
  }

  /** Assert a row (by label) is visible. */
  async expectRowVisible(label: string | RegExp): Promise<void> {
    await this.row(label).first().expectVisible();
  }

  /** Assert the BEST badge is present in the row matched by `label`. */
  async expectBestInRow(label: string | RegExp): Promise<void> {
    await this.row(label).byText('BEST', { exact: true }).expectVisible();
  }

  /**
   * Assert the BEST badge is present in the FIRST row matched by `label`. Use
   * when the label is ambiguous across sections (e.g. "Strikeouts" appears in
   * both Career Batting and Career Pitching, batting rendered first).
   */
  async expectBestInFirstRow(label: string | RegExp): Promise<void> {
    await this.row(label)
      .first()
      .byText('BEST', { exact: true })
      .expectVisible();
  }

  /** Assert no BEST badge appears in the row matched by `label`. */
  async expectNoBestInRow(label: string | RegExp): Promise<void> {
    await this.row(label).byText('BEST', { exact: true }).expectHidden();
  }

  /** Assert the BEST badge count in the row matched by `label`. */
  async expectBestCountInRow(
    label: string | RegExp,
    count: number,
  ): Promise<void> {
    await this.row(label).byText('BEST', { exact: true }).expectCount(count);
  }

  /** Assert a value is visible inside the row matched by `label`. */
  async expectValueInRow(label: string | RegExp, value: string): Promise<void> {
    await this.row(label).byText(value).expectVisible();
  }

  /** Assert a value appears exactly `count` times inside the row. */
  async expectValueCountInRow(
    label: string | RegExp,
    value: string,
    count: number,
  ): Promise<void> {
    await this.row(label).byText(value).expectCount(count);
  }

  /** Assert the row matched by `label` contains `text` (substring). */
  async expectRowContains(label: string | RegExp, text: string): Promise<void> {
    await this.row(label).first().expectContainsText(text);
  }

  /** Assert a suppressed-stat dash ("—") appears in the row. */
  async expectDashInRow(label: string | RegExp): Promise<void> {
    await this.row(label).byText('—').first().expectVisible();
  }

  /** Assert the "Min. 50 IP required" qualifier note appears in the row. */
  async expectQualifierNoteInRow(label: string | RegExp): Promise<void> {
    await this.row(label)
      .byText(/min\. 50 ip required/i)
      .expectVisible();
  }

  /** Assert the BEST cell of a row contains `value` (badge co-located w/ value). */
  async expectBestCellContains(
    label: string | RegExp,
    value: string,
  ): Promise<void> {
    await this.row(label)
      .byRole('cell')
      .filterByText('BEST')
      .expectContainsText(value);
  }

  /**
   * Assert the cell containing `value` in a row does NOT carry the BEST badge.
   * WEB-ONLY: a negated `toContainText` has no portable driver assertion (the
   * vocabulary offers `expectContainsText` but no negation), so this stays on
   * the raw `Locator`.
   */
  async expectCellWithoutBest(
    label: string | RegExp,
    value: string,
  ): Promise<void> {
    await expect(
      this.#page
        .getByRole('row')
        .filter({ hasText: label })
        .getByRole('cell')
        .filter({ hasText: value }),
    ).not.toContainText('BEST');
  }

  /** Assert at least one BEST badge is visible in the table. */
  async expectAnyBest(): Promise<void> {
    await this.#driver.byText('BEST', { exact: true }).first().expectVisible();
  }

  /** Assert no BEST badges exist in the DOM. */
  async expectNoBest(): Promise<void> {
    await this.#driver.byText('BEST', { exact: true }).expectCount(0);
  }

  /** Assert at least `min` BEST badges are present. */
  async expectBestCountAtLeast(min: number): Promise<void> {
    const count = await this.#driver.byText('BEST', { exact: true }).count();
    expect(count).toBeGreaterThanOrEqual(min);
  }

  /** Assert the upward triangle (▲) BEST indicator is visible. */
  async expectTriangle(): Promise<void> {
    await this.#driver.byText('▲').first().expectVisible();
  }

  /** Assert no upward-triangle indicators exist in the DOM. */
  async expectNoTriangle(): Promise<void> {
    await this.#driver.byText('▲').expectCount(0);
  }

  /** Assert the BEST badge appears in the value-filtered row, scoped to table. */
  async expectBestInTableRowWithValue(value: string): Promise<void> {
    await this.#table
      .byRole('row')
      .filterByText(value)
      .byText('BEST', { exact: true })
      .expectVisible();
  }

  /** Assert the BEST badge appears in the table row matched by `label`. */
  async expectBestInTableRow(label: string | RegExp): Promise<void> {
    await this.#table
      .byRole('row')
      .filterByText(label)
      .byText('BEST', { exact: true })
      .expectVisible();
  }

  // ── Assertions: season-by-season tables ──────────────────────────

  /** Assert the "Season by Season" heading is visible. */
  async expectSeasonBySeasonHeading(): Promise<void> {
    await this.#driver.byText('Season by Season').expectVisible();
  }

  /** Assert a season-breakdown table (kind + player) is visible. */
  async expectSeasonTableVisible(
    kind: 'batting' | 'pitching',
    playerName: string,
  ): Promise<void> {
    await this.seasonTable(kind, playerName).expectVisible();
  }

  /** Assert a season-breakdown table (kind + player) is hidden. */
  async expectSeasonTableHidden(
    kind: 'batting' | 'pitching',
    playerName: string,
  ): Promise<void> {
    await this.seasonTable(kind, playerName).expectHidden();
  }

  /** Assert a column header is visible inside a season-breakdown table. */
  async expectSeasonTableHeader(
    kind: 'batting' | 'pitching',
    playerName: string,
    header: string,
  ): Promise<void> {
    await this.seasonTable(kind, playerName)
      .byText(header)
      .first()
      .expectVisible();
  }

  /** Assert a season year row is visible inside a season-breakdown table. */
  async expectSeasonRowVisible(
    kind: 'batting' | 'pitching',
    playerName: string,
    year: string,
  ): Promise<void> {
    await this.seasonTable(kind, playerName)
      .byText(year, { exact: true })
      .expectVisible();
  }

  /** Assert a season year row is absent from a season-breakdown table. */
  async expectSeasonRowAbsent(
    kind: 'batting' | 'pitching',
    playerName: string,
    year: string,
  ): Promise<void> {
    await this.seasonTable(kind, playerName)
      .byText(year, { exact: true })
      .expectCount(0);
  }

  /** Assert the season-expand toggle for a player is absent. */
  async expectSeasonExpandAbsent(playerId: number): Promise<void> {
    await this.#driver.byTestId(`season-expand-${playerId}`).expectCount(0);
  }

  /**
   * Assert the season-expand toggle is visible and matches `text`. WEB-ONLY:
   * `toHaveText(RegExp)` (whole-node regex match) has no portable driver
   * assertion — the vocabulary offers substring `expectContainsText`, not an
   * anchored regex — so this stays on the raw `Locator`.
   */
  async expectSeasonExpandText(playerId: number, text: RegExp): Promise<void> {
    const toggle = this.#page.getByTestId(`season-expand-${playerId}`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText(text);
  }

  // ── Assertions: page header / premium / unauth ───────────────────

  /** Assert the "Compare up to four" headline is visible. */
  async expectHeadlineVisible(): Promise<void> {
    await this.#driver
      .byRole('heading', { name: /compare up to four/i })
      .first()
      .expectVisible();
  }

  /** Assert the comparison tool headline is NOT shown (unauthenticated). */
  async expectHeadlineHidden(): Promise<void> {
    await this.#driver
      .byRole('heading', { name: /compare up to four/i })
      .expectHidden();
  }

  /**
   * Assert a free-text label/value is visible on the page. Resolves to the
   * first match by default (comparison values like "0.0" or "Aaron Judge"
   * appear in multiple cells); pass `first: false` to require a unique match.
   */
  async expectText(
    text: string | RegExp,
    opts: { exact?: boolean; first?: boolean } = {},
  ): Promise<void> {
    const { exact, first = true } = opts;
    const element =
      typeof text === 'string'
        ? this.#driver.byText(text, { exact })
        : this.#driver.byText(text);
    await (first ? element.first() : element).expectVisible();
  }

  /** Assert a free-text label/value is hidden on the page. */
  async expectTextHidden(
    text: string | RegExp,
    opts: { exact?: boolean } = {},
  ): Promise<void> {
    const element =
      typeof text === 'string'
        ? this.#driver.byText(text, { exact: opts.exact })
        : this.#driver.byText(text);
    await element.first().expectHidden();
  }

  /** Assert the inline premium-upgrade CTA (PremiumBanner) is visible. */
  async expectPremiumUpgradeCta(): Promise<void> {
    await this.#driver.byRole('button', { name: /upgrade/i }).expectVisible();
  }

  /** Assert the "Get Started Free" CTA is visible and enabled. */
  async expectGetStartedFree(): Promise<void> {
    const cta = this.#driver.byRole('button', { name: /get started free/i });
    await cta.expectVisible({ timeout: 15000 });
    await cta.expectEnabled();
  }

  // ── Actions: keyboard ────────────────────────────────────────────

  /** Press `key` on the search input. */
  async pressSearchKey(key: string): Promise<void> {
    await this.#search.press(key);
  }

  // ── Assertions: keyboard / aria ──────────────────────────────────

  /** Assert the named option in the suggestions list has aria-selected="true". */
  async expectSuggestionSelected(name: string): Promise<void> {
    await this.#suggestions
      .byRole('option', { name })
      .expectAttribute('aria-selected', 'true');
  }

  /** Assert the named option in the suggestions list has aria-selected="false". */
  async expectSuggestionDeselected(name: string): Promise<void> {
    await this.#suggestions
      .byRole('option', { name })
      .expectAttribute('aria-selected', 'false');
  }
}
