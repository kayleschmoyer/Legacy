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

    this.draftBoard = page.locator('[data-testid="draft-board"], .draft-board');
    this.playerPool = page.locator('[data-testid="player-pool"], .player-pool');
    this.draftQueue = page.locator('[data-testid="draft-queue"], .draft-queue');
    this.currentPick = page.locator(
      '[data-testid="current-pick"], .current-pick',
    );

    this.draftPlayerButton = page.getByRole('button', {
      name: /draft.*player|pick.*player/i,
    });
    this.autoPick = page.getByRole('button', { name: /auto.?pick/i });
    this.undoButton = page.getByRole('button', { name: /undo/i });

    this.playerSearch = page.getByPlaceholder(/search.*player/i);

    this.draftStatus = page.locator('[data-testid="draft-status"]').first();
    this.roundIndicator = page.getByText(/round \d+/i).first();
    this.pickTimer = page
      .locator('[data-testid="pick-timer"], .pick-timer')
      .first();
  }

  /** Navigate to a league's draft board. */
  async goto(leagueId: number) {
    await this.page.goto(`/baseball/league/${leagueId}/draft`);
    await this.page.waitForLoadState('networkidle');
  }

  /** Assert the draft board is loaded and visible. */
  async expectBoardVisible() {
    await expect(this.draftBoard).toBeVisible({ timeout: 15000 });
  }

  /** Search for a player in the draft pool. */
  async searchPlayer(name: string) {
    await this.playerSearch.fill(name);
    await this.page.waitForTimeout(500); // debounce
  }
}
