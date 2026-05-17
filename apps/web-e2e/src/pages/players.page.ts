import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for player-related pages:
 * - /players/stats
 * - /players/:id (detail)
 * - /players/compare
 */
export class PlayersPage {
  readonly page: Page;

  // Stats page
  readonly statsHeading: Locator;
  readonly searchInput: Locator;
  readonly refreshButton: Locator;
  readonly sortHint: Locator;
  readonly battingTab: Locator;
  readonly pitchingTab: Locator;
  readonly playerRows: Locator;

  // Player detail
  readonly playerName: Locator;
  readonly playerPosition: Locator;

  // Player Detail Modal
  readonly detailModal: Locator;
  readonly detailModalCloseButton: Locator;
  readonly detailModalLoading: Locator;
  readonly detailModalError: Locator;
  readonly detailModalEmpty: Locator;
  readonly detailModalEligiblePositions: Locator;
  readonly detailModalBattingTab: Locator;
  readonly detailModalPitchingTab: Locator;
  readonly detailModalFieldingTab: Locator;
  readonly detailModalCareerBattingCard: Locator;
  readonly detailModalCareerPitchingCard: Locator;

  constructor(page: Page) {
    this.page = page;

    // Stats page
    this.statsHeading = page.getByRole('heading', {
      name: /player statistics/i,
    });
    this.searchInput = page.getByPlaceholder('Search players...');
    this.refreshButton = page.getByRole('button', { name: /refresh/i });
    this.sortHint = page.getByTestId('player-stats-sort-hint');
    this.battingTab = page.getByTestId('tab-trigger-batting');
    this.pitchingTab = page.getByTestId('tab-trigger-pitching');
    this.playerRows = page.locator('[data-testid^="player-row-"]');

    // Player detail
    this.playerName = page.getByRole('heading', { level: 1 }).first();
    this.playerPosition = page.getByTestId('player-position');

    // Player Detail Modal
    this.detailModal = page.getByRole('dialog');
    this.detailModalCloseButton = this.detailModal.getByRole('button', {
      name: 'Close',
    });
    this.detailModalLoading = page.getByTestId('player-detail-loading');
    this.detailModalError = this.detailModal.getByTestId('player-detail-error');
    this.detailModalEmpty = this.detailModal.getByTestId('player-detail-empty');
    this.detailModalEligiblePositions =
      this.detailModal.getByTestId('eligible-positions');
    this.detailModalBattingTab =
      this.detailModal.getByTestId('modal-tab-batting');
    this.detailModalPitchingTab =
      this.detailModal.getByTestId('modal-tab-pitching');
    this.detailModalFieldingTab =
      this.detailModal.getByTestId('modal-tab-fielding');
    this.detailModalCareerBattingCard = this.detailModal.getByTestId(
      'career-batting-card',
    );
    this.detailModalCareerPitchingCard = this.detailModal.getByTestId(
      'career-pitching-card',
    );
  }

  /**
   * Navigate to the player stats page and wait for it to render.
   *
   * `networkidle` was defeated by Apollo polling on this route. Gate on the
   * page heading instead — Playwright auto-retries until it appears.
   */
  async gotoStats() {
    await this.page.goto('/players/stats');
    await expect(this.statsHeading).toBeVisible({ timeout: 30000 });
  }

  /** Navigate to a specific player detail page and wait for it to render. */
  async gotoDetail(playerId: number) {
    await this.page.goto(`/players/${playerId}`);
    // The detail route renders a "← Back" button unconditionally (loading,
    // error, and resolved states all show it); use it as the page-loaded
    // signal so we don't depend on the modal/h1 having mounted yet.
    await expect(this.page.getByRole('button', { name: /back/i })).toBeVisible({
      timeout: 30000,
    });
  }

  /** Navigate to the player comparison page and wait for it to render. */
  async gotoCompare() {
    await this.page.goto('/players/compare');
    // The comparison page renders the "Compare up to four." headline when the
    // user is authenticated; if not, it renders a sign-in gate that also
    // includes "compare". Match the shared prefix.
    await expect(
      this.page.getByRole('heading', { name: /compare/i }).first(),
    ).toBeVisible({ timeout: 30000 });
  }

  /** Assert the stats page has loaded. */
  async expectStatsPageVisible() {
    await expect(this.statsHeading).toBeVisible({ timeout: 15000 });
    await expect(this.searchInput).toBeVisible();
  }

  /**
   * Type a search term into the player-stats search input.
   *
   * The page debounces the search before re-issuing the stats GraphQL query.
   * Callers should follow this with an explicit assertion (e.g.
   * `expect(playerRows.first()).toContainText(name)`) — that assertion is
   * the deterministic signal that the debounce flushed and the result
   * applied.
   */
  async searchPlayer(name: string) {
    await this.searchInput.fill(name);
    await expect(this.searchInput).toHaveValue(name);
  }

  /** Wait for player data rows to appear, skip test if none render. */
  async waitForPlayerData(): Promise<boolean> {
    try {
      await this.playerRows
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
}
