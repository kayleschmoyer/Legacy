import { expect } from '@playwright/test';

import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';
import { PlayerSearchBox } from '../components/player-search-box.component';

/**
 * Page object for the draft board (/baseball/league/:id/draft).
 *
 * Reference implementation of the ADR-0015 semantic page object AND of the
 * ADR-0016 driver migration: it is written against the platform-neutral
 * {@link AppDriver} interface (not a Playwright `Page`), so the same object
 * can drive the web app today and the native app once an Appium driver lands.
 * Locators stay PRIVATE (`#field`) and the only public API is the three
 * semantic surfaces — actions (verbs), reads (plain-data getters), assertions
 * (retrying wrappers). Specs call these verbs/reads and never touch a
 * selector, so a UI mechanism change is a one-object edit instead of a
 * spec-wide sweep.
 *
 * The debounced player-pool search is delegated to the shared `PlayerSearchBox`
 * component (ADR-0015 §2) rather than owned here. This object carries no mocking
 * or data setup — the same object drives the hermetic and integration suites
 * (ADR-0015 §6).
 */
export class DraftPage extends BaseScreen {
  // ── Private elements ─────────────────────────────────────────────
  readonly #draftBoard: UIElement;
  readonly #playerPool: UIElement;
  readonly #currentPick: UIElement;
  // The draftable-player button. Its accessible name is "Draft <player> now"
  // only while it is the user's pick (PlayerCard renders "Waiting for your turn
  // to draft <player>" otherwise) — so matching this name is also the signal
  // that a pick is actionable.
  readonly #draftNowButton: UIElement;
  // Any surfaced error (e.g. a rejected MakeDraftPick mutation) renders on an
  // ARIA alert.
  readonly #errorAlert: UIElement;

  // ── Composed components ──────────────────────────────────────────
  readonly #search: PlayerSearchBox;

  constructor(driver: AppDriver) {
    super(driver);

    this.#draftBoard = driver.byTestId('draft-board');
    this.#playerPool = driver.byTestId('player-pool');
    this.#currentPick = driver.byTestId('current-pick');
    this.#draftNowButton = driver.byRole('button', { name: /draft.*now/i });
    this.#errorAlert = driver.byRole('alert');

    // Scope the search box to the board so it never collides with other
    // "search player" inputs elsewhere on the page (e.g. the nav search).
    this.#search = new PlayerSearchBox(this.#draftBoard);
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Navigate to a league's draft board and wait for it to render.
   *
   * `networkidle` is unreliable here: the draft route opens a WebSocket and
   * fires Apollo subscriptions that may never reach idle. Gate on the
   * `draft-board` test id instead (BaseScreen.open auto-retries until it
   * appears).
   */
  async gotoLeague(leagueId: number): Promise<void> {
    await this.open(`/baseball/league/${leagueId}/draft`, 'draft-board');
  }

  /**
   * Search the player pool for `term`. Delegates to the composed search box,
   * which fills the input and confirms the value; the pool then filters
   * client-side (no network request). The spec asserts the filtered outcome
   * itself (the draft board's cards are not `player-row-*` rows the component
   * can read).
   */
  async searchPlayer(term: string): Promise<void> {
    await this.#search.fill(term);
  }

  /** Draft the first available player (clicks its "Draft … now" button). */
  async draftFirstAvailable(): Promise<void> {
    const button = this.#draftNowButton.first();
    await button.expectVisible({ timeout: 5000 });
    await button.tap();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /**
   * How many players are currently draftable. Greater than zero only when it is
   * the user's turn — otherwise every button reads "Waiting for your turn…" and
   * no longer matches the "Draft … now" accessible name. (The player name lives
   * in that accessible name, not the button's text, so this is a count rather
   * than a name list.)
   */
  async draftablePlayerCount(): Promise<number> {
    return this.#draftNowButton.count();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the draft board is loaded and visible. */
  async expectBoardVisible(): Promise<void> {
    await this.#draftBoard.expectVisible({ timeout: 15000 });
  }

  /** Assert the available-players pool is visible. */
  async expectPlayerPoolVisible(): Promise<void> {
    await this.#playerPool.expectVisible({ timeout: 5000 });
  }

  /** Assert the current-pick indicator is visible. */
  async expectCurrentPickVisible(): Promise<void> {
    await this.#currentPick.expectVisible({ timeout: 5000 });
  }

  /**
   * Assert the user cannot submit a pick — the contract for "not your turn".
   * Both shapes satisfy it: the draft button is hidden, or it is visible but
   * disabled. We assert the user-facing contract (cannot submit) rather than
   * pinning one implementation.
   *
   * `expect.poll` is runner-level (not Locator-bound), so it stays valid over
   * driver reads on every platform (ADR-0016).
   */
  async expectCannotDraft(): Promise<void> {
    const button = this.#draftNowButton.first();
    await expect
      .poll(
        async () => (await button.isVisible()) && (await button.isEnabled()),
        { timeout: 5000 },
      )
      .toBe(false);
  }

  /** Assert a previously-drafted player appears in the pick history. */
  async expectPickInHistory(name: string): Promise<void> {
    await this.driver.byText(name).first().expectVisible({ timeout: 5000 });
  }

  /**
   * Assert a non-empty error was surfaced (e.g. a rejected pick) and the board
   * stayed functional (no crash / blank page).
   */
  async expectDraftError(): Promise<void> {
    const alert = this.#errorAlert.first();
    await alert.expectVisible({ timeout: 5000 });
    await alert.expectNonEmptyText();
    await this.#draftBoard.expectVisible();
  }
}
