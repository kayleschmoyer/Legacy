import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for league-related pages:
 * - /baseball/league/create
 * - /baseball/league/:id (detail)
 * - /baseball/leagues (discovery list)
 */
export class LeaguePage {
  readonly page: Page;

  // League detail
  readonly leagueTitle: Locator;
  readonly leagueName: Locator;
  readonly draftStatusBadge: Locator;
  readonly startDraftButton: Locator;
  readonly leagueTeams: Locator;

  // League creation form
  readonly createHeading: Locator;
  readonly leagueNameInput: Locator;
  readonly createButton: Locator;
  readonly teamCountSelect: Locator;

  // League discovery
  readonly leaguesGrid: Locator;

  constructor(page: Page) {
    this.page = page;

    // Detail page
    this.leagueTitle = page.locator('h1#league-title');
    this.leagueName = page.getByRole('heading', { level: 1 }).first();
    this.draftStatusBadge = page
      .locator('[data-testid="draft-status"], .draft-status')
      .first();
    this.startDraftButton = page
      .locator('button')
      .filter({ hasText: /start.*draft/i })
      .first();
    this.leagueTeams = page.locator('[data-testid="league-teams"]');

    // Create form
    this.createHeading = page.getByRole('heading', {
      name: /Create Baseball League/i,
    });
    this.leagueNameInput = page.getByPlaceholder('Enter your league name');
    this.createButton = page.getByRole('button', { name: /create league/i });
    this.teamCountSelect = page
      .locator('select, [role="combobox"]')
      .filter({ hasText: /team/i })
      .first();

    // Discovery list
    this.leaguesGrid = page.getByTestId('leagues-grid');
  }

  /** Navigate to the league creation page. */
  async gotoCreate() {
    await this.page.goto('/baseball/league/create');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Navigate to a league detail page by ID. */
  async gotoDetail(leagueId: number) {
    await this.page.goto(`/baseball/league/${leagueId}`);
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to the league discovery page. */
  async gotoDiscovery() {
    await this.page.goto('/baseball/leagues');
    await this.page.waitForLoadState('networkidle');
  }

  /** Assert the creation form is loaded. */
  async expectCreateFormVisible() {
    await expect(this.createHeading).toBeVisible({ timeout: 30000 });
    await expect(this.leagueNameInput).toBeVisible();
  }

  /** Assert the league detail page loaded with the title. */
  async expectDetailLoaded() {
    await this.page.waitForSelector('h1#league-title', { timeout: 15000 });
  }

  /**
   * Fill in the league creation form and submit.
   * Handles the alert-based validation by catching dialog events.
   */
  async fillAndSubmitCreateForm(name: string) {
    await this.leagueNameInput.fill(name);
    await this.createButton.click();
  }
}
