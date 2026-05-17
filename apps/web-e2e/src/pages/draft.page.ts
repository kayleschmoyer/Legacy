import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for the draft board (/baseball/league/:id/draft).
 * Covers the elite draft board UI, draft picks, queue, and player pool.
 */
export class DraftPage {
  readonly page: Page;

  // Draft board layout
  readonly draftBoard: Locator;
  readonly playerPool: Locator;
  readonly draftQueue: Locator;
  readonly currentPick: Locator;

  // Draft actions
  readonly draftPlayerButton: Locator;
  readonly autoPick: Locator;
  readonly undoButton: Locator;

  // Player search within draft
  readonly playerSearch: Locator;

  // Draft status
  readonly draftStatus: Locator;
  readonly roundIndicator: Locator;
  readonly pickTimer: Locator;

  constructor(page: Page) {
    this.page = page;

    this.draftBoard = page.getByTestId('draft-board');
    this.playerPool = page.getByTestId('player-pool');
    this.draftQueue = page.getByTestId('draft-queue');
    this.currentPick = page.getByTestId('current-pick');

    this.draftPlayerButton = page.getByRole('button', {
      name: /draft.*now/i,
    });
    this.autoPick = page.getByRole('button', { name: /auto.?pick/i });
    this.undoButton = page.getByRole('button', { name: /undo/i });

    this.playerSearch = page.getByPlaceholder(/search.*player/i);

    this.draftStatus = page.getByTestId('draft-status');
    this.roundIndicator = page.getByTestId('round-indicator');
    this.pickTimer = page.getByTestId('pick-timer');
  }

  /**
   * Navigate to a league's draft board and wait for it to render.
   *
   * `networkidle` is unreliable here: the draft route opens a WebSocket and
   * fires Apollo subscriptions that may never reach idle. Gate on the
   * `draft-board` test id instead — Playwright auto-retries until it appears.
   */
  async goto(leagueId: number) {
    await this.page.goto(`/baseball/league/${leagueId}/draft`);
    await expect(this.draftBoard).toBeVisible({ timeout: 30000 });
  }

  /** Assert the draft board is loaded and visible. */
  async expectBoardVisible() {
    await expect(this.draftBoard).toBeVisible({ timeout: 15000 });
  }

  /**
   * Type a search term into the draft player-pool search input.
   *
   * The shared draft hook debounces the search by 350ms before filtering the
   * already-loaded player pool (no network request fires). Callers should
   * follow this with an explicit assertion against the expected filtered
   * result (e.g. `expect(playerPool).toContainText(name)`) — that assertion
   * is the deterministic signal that the debounce flushed.
   */
  async searchPlayer(name: string) {
    await this.playerSearch.fill(name);
    await expect(this.playerSearch).toHaveValue(name);
  }
}
