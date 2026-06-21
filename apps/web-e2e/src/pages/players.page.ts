import { expect, type Locator, type Page } from '@playwright/test';

import { BasePage } from '../base/base.page';
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
 */
export class PlayersPage extends BasePage {
  /** The blurred premium-gate overlay shared across premium-gated pages. */
  readonly premiumGate: PremiumGate;
  /** `/players/stats` surface. */
  readonly stats: PlayerStatsSurface;
  /** Player-detail modal surface (`/players/:id` and `/players/:brefId`). */
  readonly detail: PlayerDetailSurface;
  /** `/players/compare` surface. */
  readonly compare: PlayerCompareSurface;

  constructor(page: Page) {
    super(page);
    this.premiumGate = new PremiumGate(
      page.getByTestId('premium-feature-gate'),
    );
    this.stats = new PlayerStatsSurface(page);
    this.detail = new PlayerDetailSurface(page);
    this.compare = new PlayerCompareSurface(page);
  }

  // ── Navigation ────────────────────────────────────────────────────

  /** Navigate to `/players/stats` and wait for the document to load. */
  async gotoStats(): Promise<void> {
    await this.page.goto('/players/stats');
    await this.page.waitForLoadState('load');
  }

  /**
   * Navigate to a player-detail deep link (`/players/:id`). Pass
   * `waitUntil: 'domcontentloaded'` to catch the loading state before stats
   * resolve; defaults to `'load'`.
   */
  async gotoDetail(
    playerId: number,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'load',
  ): Promise<void> {
    await this.page.goto(`/players/${playerId}`);
    await this.page.waitForLoadState(waitUntil);
  }

  /** Navigate to a player-detail brefId deep link (`/players/:brefId`). */
  async gotoBrefId(
    brefId: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' = 'load',
  ): Promise<void> {
    await this.page.goto(`/players/${brefId}`);
    await this.page.waitForLoadState(waitUntil);
  }

  /** Navigate to `/players/compare` and wait for the document to load. */
  async gotoCompare(): Promise<void> {
    await this.page.goto('/players/compare');
    await this.page.waitForLoadState('load');
  }

  // ── Shared reads / assertions ─────────────────────────────────────

  /** Assert the page did not render the global "Unexpected Application Error". */
  async expectNoApplicationError(): Promise<void> {
    await expect(this.page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
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
  readonly #page: Page;
  readonly #heading: Locator;
  readonly #search: Locator;
  readonly #battingGrid: Locator;
  readonly #filterControls: Locator;

  constructor(page: Page) {
    this.#page = page;
    this.#heading = page.getByText('MLB Player Statistics');
    this.#search = page.getByPlaceholder('Search player name · min 2 chars');
    this.#battingGrid = page.getByTestId('player-stats-data-grid');
    this.#filterControls = page.getByTestId('filter-controls');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Type a search term into the stats search input. */
  async search(term: string): Promise<void> {
    await this.#search.fill(term);
    await expect(this.#search).toHaveValue(term);
  }

  /** Clear the stats search input. */
  async clearSearch(): Promise<void> {
    await this.#search.clear();
    await expect(this.#search).toHaveValue('');
  }

  /** Switch the stats view via its tab (Combined / Hitters / Pitchers). */
  async switchView(name: 'Combined' | 'Hitters' | 'Pitchers'): Promise<void> {
    await this.#page.getByRole('tab', { name }).click();
  }

  /** Click a column header by label (e.g. to sort). */
  async clickColumnHeader(label: string): Promise<void> {
    await this.#page.getByText(label, { exact: true }).first().click();
  }

  /** Open a player's detail modal by clicking their row (matched by name). */
  async openPlayerByName(name: string): Promise<void> {
    await this.#page.getByText(name).first().click();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** A player row by id (`data-testid="player-row-<id>"`). */
  row(playerId: number): Locator {
    return this.#page.getByTestId(`player-row-${playerId}`);
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the stats page heading is visible. */
  async expectLoaded(timeout = 15000): Promise<void> {
    await expect(this.#heading.first()).toBeVisible({ timeout });
  }

  /** Assert the search input is visible. */
  async expectSearchVisible(): Promise<void> {
    await expect(this.#search).toBeVisible();
  }

  /** Assert a view tab is visible. */
  async expectTabVisible(
    name: 'Combined' | 'Hitters' | 'Pitchers',
    timeout?: number,
  ): Promise<void> {
    await expect(this.#page.getByRole('tab', { name })).toBeVisible({
      timeout,
    });
  }

  /** Assert a view tab is the selected one. */
  async expectTabSelected(
    name: 'Combined' | 'Hitters' | 'Pitchers',
  ): Promise<void> {
    await expect(this.#page.getByRole('tab', { name })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  }

  /** Assert the batting-leaders heading is visible. */
  async expectBattingLeaders(): Promise<void> {
    await expect(
      this.#page.getByText('MLB Career Batting Leaders').first(),
    ).toBeVisible();
  }

  /** Assert the pitching-leaders heading is visible. */
  async expectPitchingLeaders(): Promise<void> {
    await expect(
      this.#page.getByText('MLB Career Pitching Leaders'),
    ).toBeVisible();
  }

  /** Assert a player name is visible somewhere on the page. */
  async expectPlayerVisible(name: string, timeout?: number): Promise<void> {
    await expect(this.#page.getByText(name)).toBeVisible({ timeout });
  }

  /** Assert a value is rendered inside a specific player row. */
  async expectRowValue(playerId: number, value: string): Promise<void> {
    await expect(this.row(playerId).getByText(value)).toBeVisible();
  }

  /** Assert a data-grid column header is visible. */
  async expectColumnHeader(label: string): Promise<void> {
    await expect(
      this.#page.getByText(label, { exact: true }).first(),
    ).toBeVisible();
  }

  /** Assert the filter-controls toolbar is visible. */
  async expectFilterControls(): Promise<void> {
    await expect(this.#filterControls).toBeVisible();
  }

  /** Assert the batting grid's pagination controls render. */
  async expectPaginationControls(): Promise<void> {
    await expect(
      this.#battingGrid.getByRole('button', { name: /next/i }),
    ).toBeVisible();
    await expect(
      this.#battingGrid.getByRole('button', { name: /previous|prev/i }),
    ).toBeVisible();
  }

  /** Assert the batting grid shows its loading indicator. */
  async expectLoadingIndicator(timeout = 5000): Promise<void> {
    await expect(
      this.#battingGrid.getByTestId('loading-indicator'),
    ).toBeVisible({ timeout });
  }

  /** Assert the batting grid shows its inline error message. */
  async expectGridError(timeout = 5000): Promise<void> {
    await expect(this.#battingGrid.getByTestId('error-message')).toBeVisible({
      timeout,
    });
  }

  /** Assert a full-page empty/error state message is visible by text. */
  async expectMessage(text: string): Promise<void> {
    await expect(this.#page.getByText(text)).toBeVisible();
  }

  /** Assert the marketing landing page ("Dominate Your League") is NOT shown. */
  async expectMarketingLandingHidden(): Promise<void> {
    await expect(
      this.#page.getByText(/dominate your league/i),
    ).not.toBeVisible();
  }

  /** Assert an arbitrary value/label is visible on the stats page. */
  async expectText(
    text: string | RegExp,
    opts: { exact?: boolean; first?: boolean; timeout?: number } = {},
  ): Promise<void> {
    const { exact, first = true, timeout } = opts;
    const locator =
      typeof text === 'string'
        ? this.#page.getByText(text, { exact })
        : this.#page.getByText(text);
    await expect(first ? locator.first() : locator).toBeVisible({ timeout });
  }
}

// ===========================================================================
// /players/:id  +  /players/:brefId  (detail modal)
// ===========================================================================

/**
 * Semantic surface for the player-detail modal route. The modal is the only
 * `div[role="dialog"]` on the page; all reads scope to it. The brefId route
 * additionally renders a loading `status` and (on miss) an inline `alert`.
 */
class PlayerDetailSurface {
  readonly #page: Page;
  readonly #dialog: Locator;
  readonly #loading: Locator;

  constructor(page: Page) {
    this.#page = page;
    this.#dialog = page.locator('div[role="dialog"]');
    this.#loading = page.getByTestId('player-detail-loading');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Switch the modal's stat tab (Career Arc / Batting / Pitching / Fielding).
   * Uses `force` because the open dialog overlay can intercept pointer events.
   */
  async switchTab(
    name: 'Career Arc' | 'Batting' | 'Pitching' | 'Fielding',
  ): Promise<void> {
    await this.#dialog.getByText(name, { exact: true }).first().click({
      force: true,
    });
  }

  /** Click the modal's Close (X) button. */
  async close(): Promise<void> {
    await this.#dialog
      .getByRole('button', { name: 'Close' })
      .click({ force: true });
  }

  /** Press Escape to close the modal. */
  async pressEscape(): Promise<void> {
    await this.#page.keyboard.press('Escape');
  }

  /** Click the "← Back" button (dispatchEvent bypasses overlay interception). */
  async back(): Promise<void> {
    await this.#page
      .getByRole('button', { name: /← back/i })
      .dispatchEvent('click');
  }

  /** Wait for navigation back to the stats list. */
  async waitForStatsList(): Promise<void> {
    await this.#page.waitForURL('**/players/stats');
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** The modal dialog root, for compound assertions in a spec. */
  get dialog(): Locator {
    return this.#dialog;
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the modal dialog is open. */
  async expectOpen(): Promise<void> {
    await expect(this.#dialog).toBeVisible();
  }

  /** Assert the modal dialog is not mounted/visible. */
  async expectClosed(): Promise<void> {
    await expect(this.#dialog).not.toBeVisible();
  }

  /** Assert the loading spinner is visible. */
  async expectLoading(): Promise<void> {
    await expect(this.#loading).toBeVisible();
  }

  /** Assert the loading spinner has cleared. */
  async expectNotLoading(): Promise<void> {
    await expect(this.#loading).not.toBeVisible();
  }

  /** Assert the "← Back" button is visible. */
  async expectBackButton(): Promise<void> {
    await expect(
      this.#page.getByRole('button', { name: /← back|back/i }),
    ).toBeVisible({ timeout: 15000 });
  }

  /** Assert the eligible-positions section is visible. */
  async expectEligiblePositions(): Promise<void> {
    await expect(this.#dialog.getByTestId('eligible-positions')).toBeVisible();
  }

  /** Assert the career-batting summary card is visible. */
  async expectCareerBattingCard(): Promise<void> {
    await expect(this.#dialog.getByTestId('career-batting-card')).toBeVisible();
  }

  /** Assert the career-pitching summary card is visible. */
  async expectCareerPitchingCard(): Promise<void> {
    await expect(
      this.#dialog.getByTestId('career-pitching-card'),
    ).toBeVisible();
  }

  /** Assert the empty-state (no seasons) is visible. */
  async expectEmptyState(): Promise<void> {
    await expect(this.#dialog.getByTestId('player-detail-empty')).toBeVisible();
  }

  /** Assert the error-state is visible. */
  async expectErrorState(): Promise<void> {
    await expect(this.#dialog.getByTestId('player-detail-error')).toBeVisible();
  }

  /** Assert the eligible-positions band is NOT visible. */
  async expectEligiblePositionsNotVisible(): Promise<void> {
    await expect(
      this.#dialog.getByTestId('eligible-positions'),
    ).not.toBeVisible();
  }

  /** Assert the career-batting summary card is NOT visible. */
  async expectCareerBattingCardNotVisible(): Promise<void> {
    await expect(
      this.#dialog.getByTestId('career-batting-card'),
    ).not.toBeVisible();
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
    const locator =
      typeof text === 'string'
        ? this.#dialog.getByText(text, { exact })
        : this.#dialog.getByText(text);
    await expect(first ? locator.first() : locator).toBeVisible();
  }

  // ── brefId route ─────────────────────────────────────────────────

  /** Assert the brefId loading `status` indicator is visible. */
  async expectLoadingStatus(): Promise<void> {
    await expect(this.#page.getByRole('status')).toBeVisible();
  }

  /** Assert the brefId "No player found" alert is visible. */
  async expectNotFoundAlert(): Promise<void> {
    const alert = this.#page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('No player found');
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
  readonly #page: Page;
  readonly #search: Locator;
  readonly #suggestions: Locator;
  readonly #selectedPlayers: Locator;
  readonly #table: Locator;

  constructor(page: Page) {
    this.#page = page;
    this.#search = page.getByLabel('Search players to compare');
    this.#suggestions = page.getByLabel('Player suggestions');
    this.#selectedPlayers = page.getByLabel('Selected players');
    this.#table = page.getByRole('table', { name: 'Player comparison' });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Add a player by typing `searchTerm` and clicking the `fullName` result.
   * Retry-wrapped: the suggestion dropdown can close on a stale blur, so the
   * fill + click is retried until it lands (mirrors every comparison spec).
   */
  async addPlayer(searchTerm: string, fullName: string): Promise<void> {
    await expect(async () => {
      await this.#search.clear();
      await this.#search.focus();
      await this.#search.fill(searchTerm);
      await expect(this.#page.getByText(fullName)).toBeVisible({
        timeout: 5000,
      });
      await this.#page.getByText(fullName).click({ timeout: 5000 });
    }).toPass({ timeout: 15000 });
  }

  /** As {@link addPlayer} but forces each interaction past the gate overlay. */
  async addPlayerForce(searchTerm: string, fullName: string): Promise<void> {
    await expect(async () => {
      await this.#search.clear({ force: true });
      await this.#search.focus();
      await this.#search.fill(searchTerm, { force: true });
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
    await expect(this.#search).toHaveValue(term);
  }

  /** Blur the comparison search input (drives the blur-before-click race). */
  async blurSearch(): Promise<void> {
    await this.#search.blur();
  }

  /** Click a suggestion in the dropdown by player name. */
  async clickSuggestion(name: string): Promise<void> {
    await this.#suggestions.getByText(name).first().click();
  }

  /** Remove a selected player via their chip's Remove button (matched by name). */
  async removePlayer(fullName: string): Promise<void> {
    await this.#page
      .getByRole('button', { name: nameRegExp('remove', fullName) })
      .click();
  }

  /** Click the empty-slot chip-button for the given slot number. */
  async clickEmptySlot(slotNumber: number): Promise<void> {
    await this.#page
      .getByRole('button', { name: `Slot ${slotNumber} empty — add a player` })
      .click();
  }

  /** Focus the empty-slot chip-button for the given slot number. */
  async focusEmptySlot(slotNumber: number): Promise<void> {
    await this.#page
      .getByRole('button', { name: `Slot ${slotNumber} empty — add a player` })
      .focus();
  }

  /** Click "Undo" in the remove-player toast (matched by player name). */
  async clickUndoRemove(fullName: string): Promise<void> {
    await this.#page
      .getByRole('button', { name: nameRegExp('undo removing', fullName) })
      .click();
  }

  /** Click the "Get Started Free" CTA shown to unauthenticated visitors. */
  async clickGetStartedFree(): Promise<void> {
    await this.#page.getByRole('button', { name: /get started free/i }).click();
  }

  /** Click a season-breakdown expand/collapse toggle by player id. */
  async clickSeasonExpand(playerId: number): Promise<void> {
    await this.#page.getByTestId(`season-expand-${playerId}`).click();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** A comparison-table row matched by its stat label. */
  row(label: string | RegExp): Locator {
    return this.#page.getByRole('row').filter({ hasText: label });
  }

  /** A selected-player chip by player id. */
  chip(playerId: number): Locator {
    return this.#page.getByTestId(`selected-chip-${playerId}`);
  }

  /** A season-breakdown table by kind + player name. */
  seasonTable(kind: 'batting' | 'pitching', playerName: string): Locator {
    return this.#page.getByRole('table', {
      name: `Season ${kind} for ${playerName}`,
    });
  }

  // ── Assertions: search & selection ───────────────────────────────

  /** Assert the comparison search input is visible. */
  async expectSearchVisible(): Promise<void> {
    await expect(this.#search).toBeVisible();
  }

  /** Assert the comparison search input is enabled. */
  async expectSearchEnabled(): Promise<void> {
    await expect(this.#search).toBeEnabled();
  }

  /** Assert the search input is focused. */
  async expectSearchFocused(): Promise<void> {
    await expect(this.#search).toBeFocused();
  }

  /** Assert the search input has the given value. */
  async expectSearchValue(value: string): Promise<void> {
    await expect(this.#search).toHaveValue(value);
  }

  /** Assert the capacity-reached placeholder is shown and the input disabled. */
  async expectSearchAtCapacity(): Promise<void> {
    const input = this.#page.getByPlaceholder(
      '4 players selected — remove one to add more',
    );
    await expect(input).toBeVisible();
    await expect(input).toBeDisabled();
  }

  /** Assert the default-capacity placeholder ("Search player name…") is shown. */
  async expectSearchPlaceholderDefault(): Promise<void> {
    await expect(
      this.#page.getByPlaceholder('Search player name…'),
    ).toBeVisible();
  }

  /** Assert the suggestions dropdown is not visible. */
  async expectSuggestionsHidden(timeout = 2000): Promise<void> {
    await expect(this.#suggestions).not.toBeVisible({ timeout });
  }

  /** Assert a suggestion with `name` is visible in the dropdown. */
  async expectSuggestionVisible(name: string, timeout?: number): Promise<void> {
    await expect(this.#suggestions.getByText(name)).toBeVisible({ timeout });
  }

  /** Assert a suggestion with `name` is NOT visible in the dropdown. */
  async expectSuggestionHidden(name: string): Promise<void> {
    await expect(this.#suggestions.getByText(name)).not.toBeVisible();
  }

  /** Wait until the suggestions dropdown is visible (retry-wrapped fill). */
  async expectSuggestionsVisibleAfterTyping(
    term: string,
    timeout = 10000,
  ): Promise<void> {
    await expect(async () => {
      await this.#search.fill(term);
      await expect(this.#suggestions).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout });
  }

  /** Assert a selected-player chip (by id) is visible. */
  async expectChipVisible(playerId: number): Promise<void> {
    await expect(this.chip(playerId)).toBeVisible();
  }

  /** Assert a selected-player chip (by id) is not visible. */
  async expectChipHidden(playerId: number): Promise<void> {
    await expect(this.chip(playerId)).not.toBeVisible();
  }

  /** Assert a selected-player chip (by id) has count 0. */
  async expectChipCount(playerId: number, count: number): Promise<void> {
    await expect(this.chip(playerId)).toHaveCount(count);
  }

  /** Assert a chip contains the given text (name / position). */
  async expectChipContains(playerId: number, text: string): Promise<void> {
    await expect(this.chip(playerId)).toContainText(text);
  }

  /** Assert a chip's top-border accent color (slot color coding). */
  async expectChipBorderTopColor(
    playerId: number,
    color: string,
  ): Promise<void> {
    await expect(this.chip(playerId)).toHaveCSS('border-top-color', color);
  }

  /** Assert a chip's accent dot (first child div) background color. */
  async expectChipAccentDotColor(
    playerId: number,
    color: string,
  ): Promise<void> {
    await expect(this.chip(playerId).locator('div').first()).toHaveCSS(
      'background-color',
      color,
    );
  }

  /** Assert the player's Remove button is visible. */
  async expectRemoveButton(fullName: string): Promise<void> {
    await expect(
      this.#page.getByRole('button', { name: nameRegExp('remove', fullName) }),
    ).toBeVisible();
  }

  /** Assert the player's Remove button carries the id-based test id. */
  async expectRemoveTestId(playerId: number): Promise<void> {
    await expect(
      this.#page.getByTestId(`remove-player-${playerId}`),
    ).toBeVisible();
  }

  /** Assert the selected-players container is visible. */
  async expectSelectedPlayersContainer(): Promise<void> {
    await expect(this.#selectedPlayers).toBeVisible();
  }

  /** Assert the number of empty-slot placeholders in the selection bar. */
  async expectEmptySlotCount(count: number): Promise<void> {
    await expect(this.#selectedPlayers.getByText(/slot.*empty/i)).toHaveCount(
      count,
    );
  }

  /** Assert an "Slot N · empty" placeholder text is visible. */
  async expectEmptySlotText(slotNumber: number): Promise<void> {
    await expect(
      this.#page.getByText(`Slot ${slotNumber} · empty`),
    ).toBeVisible();
  }

  /** Assert an empty-slot chip-button is visible. */
  async expectEmptySlotButton(slotNumber: number): Promise<void> {
    await expect(
      this.#page.getByRole('button', {
        name: `Slot ${slotNumber} empty — add a player`,
      }),
    ).toBeVisible();
  }

  /** Assert the "N of 4 selected · M slots open" count hint. */
  async expectCountHint(text: string): Promise<void> {
    await expect(this.#page.getByText(text)).toBeVisible();
  }

  /** Assert the "Add player · up to 4" slot label is visible. */
  async expectSlotLabel(): Promise<void> {
    await expect(this.#page.getByText('Add player · up to 4')).toBeVisible();
  }

  /** Assert the undo-remove toast is visible and names the removed player. */
  async expectUndoToast(fullName: string): Promise<void> {
    const toast = this.#page.getByTestId('undo-remove-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(`Removed ${fullName}`);
  }

  /** Assert the undo-remove toast is no longer present. */
  async expectUndoToastGone(): Promise<void> {
    await expect(this.#page.getByTestId('undo-remove-toast')).toHaveCount(0);
  }

  // ── Assertions: states ───────────────────────────────────────────

  /** Assert the empty-state `status` region is visible (0-player card). */
  async expectStatusVisible(): Promise<void> {
    await expect(this.#page.getByRole('status')).toBeVisible();
  }

  /** Assert the 0-player empty-state heading ("Nobody on deck yet") is visible. */
  async expectEmptyStateHeading(): Promise<void> {
    await expect(this.#page.getByText('Nobody on deck yet')).toBeVisible();
  }

  /** Assert the empty-state heading is hidden. */
  async expectEmptyStateHidden(): Promise<void> {
    await expect(this.#page.getByText('Nobody on deck yet')).not.toBeVisible();
  }

  /** Assert the empty-state "add at least two players" prompt is visible. */
  async expectEmptyStatePrompt(): Promise<void> {
    await expect(
      this.#page.getByText(/add at least two players to begin comparing/i),
    ).toBeVisible();
  }

  /** Assert the one-player minimum-selection nudge is visible. */
  async expectOnePlayerNudge(): Promise<void> {
    await expect(this.#page.getByText('One player on deck.')).toBeVisible();
  }

  /** Assert the one-player nudge is hidden. */
  async expectOnePlayerNudgeHidden(): Promise<void> {
    await expect(this.#page.getByText('One player on deck.')).not.toBeVisible();
  }

  /** Assert the "add at least one more for head-to-head" copy is visible. */
  async expectAddOneMoreHint(): Promise<void> {
    await expect(
      this.#page.getByText(/add at least one more to run the head-to-head/i),
    ).toBeVisible();
  }

  /** Assert the legacy "add at least 2 players to run the comparison" hint. */
  async expectMinimumPlayersHint(): Promise<void> {
    await expect(
      this.#page.getByText(/add at least 2 players to run the comparison/i),
    ).toBeVisible();
  }

  /** Assert the legacy minimum-players hint is hidden. */
  async expectMinimumPlayersHintHidden(): Promise<void> {
    await expect(
      this.#page.getByText(/add at least 2 players to run the comparison/i),
    ).not.toBeVisible();
  }

  // ── Assertions: comparison table ─────────────────────────────────

  /** Assert the comparison table is visible. */
  async expectTableVisible(): Promise<void> {
    await expect(this.#table).toBeVisible();
  }

  /** Assert the comparison table is hidden. */
  async expectTableHidden(): Promise<void> {
    await expect(this.#table).not.toBeVisible();
  }

  /** Assert the "Head-to-Head" section heading is visible (exact by default). */
  async expectHeadToHeadVisible(): Promise<void> {
    await expect(
      this.#page.getByRole('heading', { name: 'Head-to-Head' }),
    ).toBeVisible();
  }

  /** Assert no "Head-to-Head" heading is shown. */
  async expectHeadToHeadHidden(): Promise<void> {
    await expect(
      this.#page.getByRole('heading', { name: /head-to-head/i }),
    ).not.toBeVisible();
  }

  /** Assert a section header is visible (matched by text; pass a RegExp for fuzzy). */
  async expectSectionVisible(
    name: string | RegExp,
    opts: { exact?: boolean } = {},
  ): Promise<void> {
    const locator =
      typeof name === 'string'
        ? this.#page.getByText(name, { exact: opts.exact })
        : this.#page.getByText(name);
    await expect(locator.first()).toBeVisible();
  }

  /** Assert a section header is hidden. */
  async expectSectionHidden(
    name: string | RegExp,
    opts: { exact?: boolean } = {},
  ): Promise<void> {
    const locator =
      typeof name === 'string'
        ? this.#page.getByText(name, { exact: opts.exact })
        : this.#page.getByText(name);
    await expect(locator.first()).not.toBeVisible();
  }

  /** Assert a `rowgroup` section (e.g. "Career Batting") is visible. */
  async expectRowGroupVisible(name: string): Promise<void> {
    await expect(
      this.#page.getByRole('rowgroup').filter({ hasText: name }),
    ).toBeVisible();
  }

  /** Assert every given row label is present inside the named `rowgroup`. */
  async expectRowLabelsInGroup(
    groupName: string,
    labels: readonly string[],
  ): Promise<void> {
    const section = this.#page
      .getByRole('rowgroup')
      .filter({ hasText: groupName });
    for (const label of labels) {
      await expect(
        section.getByRole('row').filter({ hasText: label }).first(),
      ).toBeVisible();
    }
  }

  /** Assert a row (by label) is visible. */
  async expectRowVisible(label: string | RegExp): Promise<void> {
    await expect(this.row(label).first()).toBeVisible();
  }

  /** Assert the BEST badge is present in the row matched by `label`. */
  async expectBestInRow(label: string | RegExp): Promise<void> {
    await expect(
      this.row(label).getByText('BEST', { exact: true }),
    ).toBeVisible();
  }

  /**
   * Assert the BEST badge is present in the FIRST row matched by `label`. Use
   * when the label is ambiguous across sections (e.g. "Strikeouts" appears in
   * both Career Batting and Career Pitching, batting rendered first).
   */
  async expectBestInFirstRow(label: string | RegExp): Promise<void> {
    await expect(
      this.row(label).first().getByText('BEST', { exact: true }),
    ).toBeVisible();
  }

  /** Assert no BEST badge appears in the row matched by `label`. */
  async expectNoBestInRow(label: string | RegExp): Promise<void> {
    await expect(
      this.row(label).getByText('BEST', { exact: true }),
    ).not.toBeVisible();
  }

  /** Assert the BEST badge count in the row matched by `label`. */
  async expectBestCountInRow(
    label: string | RegExp,
    count: number,
  ): Promise<void> {
    await expect(
      this.row(label).getByText('BEST', { exact: true }),
    ).toHaveCount(count);
  }

  /** Assert a value is visible inside the row matched by `label`. */
  async expectValueInRow(label: string | RegExp, value: string): Promise<void> {
    await expect(this.row(label).getByText(value)).toBeVisible();
  }

  /** Assert a value appears exactly `count` times inside the row. */
  async expectValueCountInRow(
    label: string | RegExp,
    value: string,
    count: number,
  ): Promise<void> {
    await expect(this.row(label).getByText(value)).toHaveCount(count);
  }

  /** Assert the row matched by `label` contains `text` (substring). */
  async expectRowContains(label: string | RegExp, text: string): Promise<void> {
    await expect(this.row(label).first()).toContainText(text);
  }

  /** Assert a suppressed-stat dash ("—") appears in the row. */
  async expectDashInRow(label: string | RegExp): Promise<void> {
    await expect(this.row(label).getByText('—').first()).toBeVisible();
  }

  /** Assert the "Min. 50 IP required" qualifier note appears in the row. */
  async expectQualifierNoteInRow(label: string | RegExp): Promise<void> {
    await expect(
      this.row(label).getByText(/min\. 50 ip required/i),
    ).toBeVisible();
  }

  /** Assert the BEST cell of a row contains `value` (badge co-located w/ value). */
  async expectBestCellContains(
    label: string | RegExp,
    value: string,
  ): Promise<void> {
    await expect(
      this.row(label).getByRole('cell').filter({ hasText: 'BEST' }),
    ).toContainText(value);
  }

  /** Assert the cell containing `value` in a row does NOT carry the BEST badge. */
  async expectCellWithoutBest(
    label: string | RegExp,
    value: string,
  ): Promise<void> {
    await expect(
      this.row(label).getByRole('cell').filter({ hasText: value }),
    ).not.toContainText('BEST');
  }

  /** Assert at least one BEST badge is visible in the table. */
  async expectAnyBest(): Promise<void> {
    await expect(
      this.#page.getByText('BEST', { exact: true }).first(),
    ).toBeVisible();
  }

  /** Assert no BEST badges exist in the DOM. */
  async expectNoBest(): Promise<void> {
    await expect(this.#page.getByText('BEST', { exact: true })).toHaveCount(0);
  }

  /** Assert at least `min` BEST badges are present. */
  async expectBestCountAtLeast(min: number): Promise<void> {
    const count = await this.#page.getByText('BEST', { exact: true }).count();
    expect(count).toBeGreaterThanOrEqual(min);
  }

  /** Assert the upward triangle (▲) BEST indicator is visible. */
  async expectTriangle(): Promise<void> {
    await expect(this.#page.getByText('▲').first()).toBeVisible();
  }

  /** Assert no upward-triangle indicators exist in the DOM. */
  async expectNoTriangle(): Promise<void> {
    await expect(this.#page.getByText('▲')).toHaveCount(0);
  }

  /** Assert the BEST badge appears in the value-filtered row, scoped to table. */
  async expectBestInTableRowWithValue(value: string): Promise<void> {
    await expect(
      this.#table
        .getByRole('row')
        .filter({ hasText: value })
        .getByText('BEST', {
          exact: true,
        }),
    ).toBeVisible();
  }

  /** Assert the BEST badge appears in the table row matched by `label`. */
  async expectBestInTableRow(label: string | RegExp): Promise<void> {
    await expect(
      this.#table
        .getByRole('row')
        .filter({ hasText: label })
        .getByText('BEST', {
          exact: true,
        }),
    ).toBeVisible();
  }

  // ── Assertions: season-by-season tables ──────────────────────────

  /** Assert the "Season by Season" heading is visible. */
  async expectSeasonBySeasonHeading(): Promise<void> {
    await expect(this.#page.getByText('Season by Season')).toBeVisible();
  }

  /** Assert a season-breakdown table (kind + player) is visible. */
  async expectSeasonTableVisible(
    kind: 'batting' | 'pitching',
    playerName: string,
  ): Promise<void> {
    await expect(this.seasonTable(kind, playerName)).toBeVisible();
  }

  /** Assert a season-breakdown table (kind + player) is hidden. */
  async expectSeasonTableHidden(
    kind: 'batting' | 'pitching',
    playerName: string,
  ): Promise<void> {
    await expect(this.seasonTable(kind, playerName)).not.toBeVisible();
  }

  /** Assert a column header is visible inside a season-breakdown table. */
  async expectSeasonTableHeader(
    kind: 'batting' | 'pitching',
    playerName: string,
    header: string,
  ): Promise<void> {
    await expect(
      this.seasonTable(kind, playerName).getByText(header).first(),
    ).toBeVisible();
  }

  /** Assert a season year row is visible inside a season-breakdown table. */
  async expectSeasonRowVisible(
    kind: 'batting' | 'pitching',
    playerName: string,
    year: string,
  ): Promise<void> {
    await expect(
      this.seasonTable(kind, playerName).getByText(year, { exact: true }),
    ).toBeVisible();
  }

  /** Assert a season year row is absent from a season-breakdown table. */
  async expectSeasonRowAbsent(
    kind: 'batting' | 'pitching',
    playerName: string,
    year: string,
  ): Promise<void> {
    await expect(
      this.seasonTable(kind, playerName).getByText(year, { exact: true }),
    ).toHaveCount(0);
  }

  /** Assert the season-expand toggle for a player is absent. */
  async expectSeasonExpandAbsent(playerId: number): Promise<void> {
    await expect(
      this.#page.getByTestId(`season-expand-${playerId}`),
    ).toHaveCount(0);
  }

  /** Assert the season-expand toggle is visible and matches `text`. */
  async expectSeasonExpandText(playerId: number, text: RegExp): Promise<void> {
    const toggle = this.#page.getByTestId(`season-expand-${playerId}`);
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText(text);
  }

  // ── Assertions: page header / premium / unauth ───────────────────

  /** Assert the "Compare up to four" headline is visible. */
  async expectHeadlineVisible(): Promise<void> {
    await expect(
      this.#page.getByRole('heading', { name: /compare up to four/i }).first(),
    ).toBeVisible();
  }

  /** Assert the comparison tool headline is NOT shown (unauthenticated). */
  async expectHeadlineHidden(): Promise<void> {
    await expect(
      this.#page.getByRole('heading', { name: /compare up to four/i }),
    ).not.toBeVisible();
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
    const locator =
      typeof text === 'string'
        ? this.#page.getByText(text, { exact })
        : this.#page.getByText(text);
    await expect(first ? locator.first() : locator).toBeVisible();
  }

  /** Assert a free-text label/value is hidden on the page. */
  async expectTextHidden(
    text: string | RegExp,
    opts: { exact?: boolean } = {},
  ): Promise<void> {
    const locator =
      typeof text === 'string'
        ? this.#page.getByText(text, { exact: opts.exact })
        : this.#page.getByText(text);
    await expect(locator.first()).not.toBeVisible();
  }

  /** Assert the inline premium-upgrade CTA (PremiumBanner) is visible. */
  async expectPremiumUpgradeCta(): Promise<void> {
    await expect(
      this.#page.getByRole('button', { name: /upgrade/i }),
    ).toBeVisible();
  }

  /** Assert the "Get Started Free" CTA is visible and enabled. */
  async expectGetStartedFree(): Promise<void> {
    const cta = this.#page.getByRole('button', { name: /get started free/i });
    await expect(cta).toBeVisible({ timeout: 15000 });
    await expect(cta).toBeEnabled();
  }
}
