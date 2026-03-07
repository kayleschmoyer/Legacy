import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page object for league-related pages:
 * - /baseball/league/create
 * - /baseball/league/:id (detail)
 * - /baseball/leagues (discovery list)
 * - /baseball/league/join (join by invite code)
 * - /baseball/league/join/:inviteCode (deep link)
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

  // Commissioner branding section
  readonly brandingHeading: Locator;
  readonly primaryColorInput: Locator;
  readonly secondaryColorInput: Locator;
  readonly saveColorsButton: Locator;
  readonly resetColorsButton: Locator;

  // Join by code form
  readonly joinHeading: Locator;
  readonly inviteCodeInput: Locator;
  readonly teamNameInput: Locator;
  readonly joinButton: Locator;
  readonly cancelButton: Locator;
  readonly deepLinkBanner: Locator;
  readonly leagueFullBanner: Locator;
  readonly inviteCodePreview: Locator;
  readonly formErrorCard: Locator;

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

    // Commissioner branding
    this.brandingHeading = page.getByRole('heading', {
      name: /League Branding/i,
    });
    this.primaryColorInput = page.locator('#primary-color');
    this.secondaryColorInput = page.locator('#secondary-color');
    this.saveColorsButton = page.getByRole('button', {
      name: /save colors/i,
    });
    this.resetColorsButton = page.getByRole('button', { name: /reset/i });

    // Join by code form
    this.joinHeading = page.getByRole('heading', {
      name: /Join League/i,
      level: 1,
    });
    this.inviteCodeInput = page.getByPlaceholder('Enter 8-character code');
    this.teamNameInput = page.getByPlaceholder('Enter your team name');
    this.joinButton = page.getByRole('button', { name: /join league/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    this.deepLinkBanner = page.getByText(/Invite code loaded from link/i);
    this.leagueFullBanner = page.getByRole('alert').filter({
      hasText: /league is full/i,
    });
    this.inviteCodePreview = page.getByRole('status').filter({
      hasText: /spot/i,
    });
    this.formErrorCard = page.getByRole('alert').filter({
      hasText: /❌/,
    });
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

  /** Navigate to the join-by-code page (optionally with a deep-link code). */
  async gotoJoin(inviteCode?: string) {
    const path = inviteCode
      ? `/baseball/league/join/${inviteCode}`
      : '/baseball/league/join';
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  /** Wait for the join form to be fully rendered. */
  async expectJoinFormVisible() {
    await expect(this.joinHeading).toBeVisible({ timeout: 15000 });
    await expect(this.inviteCodeInput).toBeVisible();
    await expect(this.teamNameInput).toBeVisible();
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

  /** Fill the join form and click the Join League button. */
  async fillAndSubmitJoinForm(inviteCode: string, teamName: string) {
    await this.inviteCodeInput.fill(inviteCode);
    await this.teamNameInput.fill(teamName);
    await this.joinButton.click();
  }
}
