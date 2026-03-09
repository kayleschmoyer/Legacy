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
    this.sortHint = page.getByText('Click column headers to sort');
    this.battingTab = page.getByText(/batting stats/i).first();
    this.pitchingTab = page.getByText(/pitching stats/i).first();
    this.playerRows = page.locator('[data-testid^="player-row-"]');

    // Player detail
    this.playerName = page.getByRole('heading', { level: 1 }).first();
    this.playerPosition = page.getByTestId('player-position');

    // Player Detail Modal
    this.detailModal = page.getByRole('dialog');
    this.detailModalCloseButton = this.detailModal.getByRole('button', {
      name: 'Close',
    });
    this.detailModalLoading = page.getByText('Loading player statistics…');
    this.detailModalError = this.detailModal.getByText('Error loading stats');
    this.detailModalEmpty = this.detailModal.getByText(
      'No season statistics found',
    );
    this.detailModalEligiblePositions =
      this.detailModal.getByText('Eligible Positions');
    this.detailModalBattingTab = this.detailModal.getByText('Batting', {
      exact: true,
    });
    this.detailModalPitchingTab = this.detailModal.getByText('Pitching', {
      exact: true,
    });
    this.detailModalFieldingTab = this.detailModal.getByText('Fielding', {
      exact: true,
    });
    this.detailModalCareerBattingCard =
      this.detailModal.getByText('Career Batting');
    this.detailModalCareerPitchingCard =
      this.detailModal.getByText('Career Pitching');
  }

  /** Navigate to the player stats page. */
  async gotoStats() {
    await this.page.goto('/players/stats');
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to a specific player detail page. */
  async gotoDetail(playerId: number) {
    await this.page.goto(`/players/${playerId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to the player comparison page. */
  async gotoCompare() {
    await this.page.goto('/players/compare');
    await this.page.waitForLoadState('networkidle');
  }

  /** Assert the stats page has loaded. */
  async expectStatsPageVisible() {
    await expect(this.statsHeading).toBeVisible({ timeout: 15000 });
    await expect(this.searchInput).toBeVisible();
  }

  /** Search for a player by name. */
  async searchPlayer(name: string) {
    await this.searchInput.fill(name);
    await this.page.waitForTimeout(1000); // debounced search
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
