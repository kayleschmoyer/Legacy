import { expect, type Locator } from '@playwright/test';

import { BasePage } from '../base/base.page';
import { LeagueCard } from '../components/league-card.component';

/** The two sports the league surfaces are mounted under. */
export type Sport = 'baseball' | 'football';

/**
 * Page object for the league surfaces (ADR-0015 §1):
 *   • /:sport/league/create        — creation form (basic + advanced + sport)
 *   • /:sport/league/:id/:tab       — detail (overview / standings / roster / …)
 *   • /:sport/leagues               — public discovery list
 *   • /:sport/league/join[/:code]   — join by invite code
 *
 * Locators are PRIVATE — specs never reach a raw `page.getByX` selector. The
 * object exposes the three semantic surfaces:
 *   • actions  — navigation + form/control verbs (`gotoCreate`, `expandSection`,
 *                `submitCreate`, `openTab`, `saveTeamName`, …)
 *   • reads    — locator getters specs assert against (`leagueNameInput`,
 *                `createButton`, plus the parameterised `button` / `text` /
 *                `heading` / `testId` getters that centralise locator
 *                construction so specs stay selector-free)
 *   • asserts  — retrying web-first wrappers (`expectCreateFormVisible`,
 *                `expectDiscoveryLoaded`, `expectNoAppError`, …)
 *
 * The discovery card's filter/join mechanism lives in the `LeagueCard`
 * component (ADR-0015 §2), composed via `cardById` / `cardByName`. The object
 * carries no mocking or seed data — that stays in the specs (ADR-0015 §6), so
 * the same object drives both the hermetic and integration suites.
 */
export class LeaguePage extends BasePage {
  // ── Reads: parameterised locator getters ─────────────────────────
  // These centralise locator construction so specs never build a raw selector.
  // Mechanism-level interactions have dedicated actions below; these cover the
  // long tail of content/control assertions (helper copy, option buttons, …).

  /** A button anywhere on the page, by accessible name. */
  button(name: string | RegExp, opts?: { exact?: boolean }): Locator {
    return this.page.getByRole('button', { name, ...opts });
  }

  /** A heading, by accessible name (optionally pinned to a level). */
  heading(
    name: string | RegExp,
    opts?: { level?: number; exact?: boolean },
  ): Locator {
    return this.page.getByRole('heading', { name, ...opts });
  }

  /** A visible text node, by string or pattern. */
  text(value: string | RegExp, opts?: { exact?: boolean }): Locator {
    return this.page.getByText(value, opts);
  }

  /** An input/textarea, by its placeholder. */
  placeholder(value: string | RegExp): Locator {
    return this.page.getByPlaceholder(value);
  }

  /** An element by its stable `data-testid`. */
  testId(id: string | RegExp): Locator {
    return this.page.getByTestId(id);
  }

  /** The current `role="alert"` (validation / error surface). */
  get alert(): Locator {
    return this.page.getByRole('alert');
  }

  // ── Reads: named create-form getters ─────────────────────────────

  /** The create-form readiness testid (`create-league-heading`). */
  get createHeading(): Locator {
    return this.page.getByTestId('create-league-heading');
  }

  /** The sport-specific "Create {Sport} League" page heading. */
  createTitle(sport: Sport = 'baseball'): Locator {
    return this.page.getByRole('heading', {
      name:
        sport === 'football'
          ? /Create Football League/i
          : /Create Baseball League/i,
    });
  }

  /** The league-name text input. */
  get leagueNameInput(): Locator {
    return this.page.getByPlaceholder('Enter your league name');
  }

  /** The "Create League" submit button. */
  get createButton(): Locator {
    return this.page.getByRole('button', { name: /create league/i });
  }

  /** The submit button while it shows its in-flight "Creating…" label. */
  get creatingButton(): Locator {
    return this.page.getByRole('button', { name: /creating/i });
  }

  /** A sport tab in the SportSwitcher (`sport-tab-baseball` / `-football`). */
  sportTab(sport: Sport): Locator {
    return this.page.getByTestId(`sport-tab-${sport}`);
  }

  /** The football "beta" status banner (only rendered in football mode). */
  get footballBetaBanner(): Locator {
    return this.page.getByTestId('football-beta-banner');
  }

  /** The premium-feature gate overlay (free-tier gated controls). */
  get premiumGate(): Locator {
    return this.page.getByTestId('premium-feature-gate');
  }

  // ── Reads: named detail getters ──────────────────────────────────

  /** The league name rendered as the detail page `<h1>`. */
  leagueNameHeading(name: string): Locator {
    return this.page.getByRole('heading', { name, level: 1 });
  }

  /** The team-settings name input (stable `#team-name-input`). */
  get teamNameSettingInput(): Locator {
    return this.page.locator('#team-name-input');
  }

  /** The "Rename team?" confirmation dialog. */
  get renameConfirmDialog(): Locator {
    return this.page.getByTestId('rename-team-confirm');
  }

  /** The QR-code loading skeleton (shown until the invite code resolves). */
  get qrCodeSkeleton(): Locator {
    return this.page.getByTestId('qr-code-skeleton');
  }

  /** The rendered QR-code SVG. */
  get qrCodeSvg(): Locator {
    return this.page.getByTestId('qr-code-svg');
  }

  /** The league-chat message composer input. */
  get chatInput(): Locator {
    return this.page.getByPlaceholder(/message/i).first();
  }

  // ── Reads: named discovery getters ───────────────────────────────

  /** The discovery page `<h1>` ("Browse Public Leagues"). */
  get discoveryHeading(): Locator {
    return this.page.getByRole('heading', {
      name: /Browse Public Leagues/i,
      level: 1,
    });
  }

  /** The discovery search input. */
  get discoverySearch(): Locator {
    return this.page.getByPlaceholder('Search leagues by name…');
  }

  /** The discovery results-count badge. */
  get discoveryResultsCount(): Locator {
    return this.page.getByTestId('discovery-results-count');
  }

  /** The discovery "Refresh" button. */
  get discoveryRefreshButton(): Locator {
    return this.page.getByRole('button', { name: /Refresh/i });
  }

  /** The discovery "No public leagues found" empty-state heading. */
  get discoveryEmptyHeading(): Locator {
    return this.page.getByRole('heading', {
      name: /No public leagues found/i,
    });
  }

  /** The discovery footer CTA ("Can't find the right league?"). */
  get discoveryFooterCta(): Locator {
    return this.page.getByText(/Can't find the right league\?/i);
  }

  // ── Reads: named join getters ────────────────────────────────────

  /** The join page `<h1>` ("Join League"). */
  get joinHeading(): Locator {
    return this.page.getByRole('heading', { name: /Join League/i, level: 1 });
  }

  /** The invite-code text input. */
  get inviteCodeInput(): Locator {
    return this.page.getByPlaceholder('Enter 8-character code');
  }

  /** The join-form team-name input. */
  get teamNameInput(): Locator {
    return this.page.getByPlaceholder('Enter your team name');
  }

  /** The "Join League" submit button on the join-by-code form. */
  get joinButton(): Locator {
    return this.page.getByRole('button', { name: /join league/i });
  }

  /** The "Cancel" button (join + create forms share the label). */
  get cancelButton(): Locator {
    return this.page.getByRole('button', { name: /cancel/i });
  }

  /** The deep-link "Invite code loaded from link" confirmation banner. */
  get deepLinkBanner(): Locator {
    return this.page.getByText(/Invite code loaded from link/i);
  }

  /** The inline join-form error card. */
  get formErrorCard(): Locator {
    return this.page.getByTestId('join-form-error');
  }

  // ── Reads: discovery card composition ────────────────────────────

  /** Scope a {@link LeagueCard} by its league id (`league-card-<id>`). */
  cardById(id: number): LeagueCard {
    return new LeagueCard(this.page.getByTestId(`league-card-${id}`));
  }

  /** Scope a {@link LeagueCard} by the league name it displays. */
  cardByName(name: string): LeagueCard {
    return new LeagueCard(
      this.page
        .locator('[data-testid^="league-card-"]')
        .filter({ hasText: name })
        .first(),
    );
  }

  // ── Actions: navigation ──────────────────────────────────────────

  /**
   * Navigate to the league creation page for `sport` and wait for it.
   *
   * Gate on the league-name input — it is sport-agnostic and present on both
   * the baseball and football forms, unlike the per-sport heading copy
   * (ADR-0015 Context: never `networkidle`).
   */
  async gotoCreate(sport: Sport = 'baseball'): Promise<void> {
    await this.page.goto(`/${sport}/league/create`);
    await expect(this.leagueNameInput).toBeVisible({ timeout: 30000 });
  }

  /**
   * Navigate to a league detail tab and wait for the document to load.
   *
   * `networkidle` is defeated by the league activity/chat long-poll; gate on
   * the `load` event instead (ADR-0015 Context).
   */
  async gotoDetail(leagueId: number, tab?: string): Promise<void> {
    const path = tab
      ? `/baseball/league/${leagueId}/${tab}`
      : `/baseball/league/${leagueId}`;
    await this.page.goto(path);
    await this.page.waitForLoadState('load');
  }

  /** Navigate to the league discovery page and wait for its heading. */
  async gotoDiscovery(): Promise<void> {
    await this.page.goto('/baseball/leagues');
    await expect(this.discoveryHeading).toBeVisible({ timeout: 30000 });
  }

  /** Navigate to the join-by-code page (optionally with a deep-link code). */
  async gotoJoin(inviteCode?: string): Promise<void> {
    const path = inviteCode
      ? `/baseball/league/join/${inviteCode}`
      : '/baseball/league/join';
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
  }

  // ── Actions: create form ─────────────────────────────────────────

  /**
   * Expand a collapsible create-form section by its id (e.g. `draft`,
   * `roster-schedule`, `era-history`, `waiver-budget`). No-op if already open.
   */
  async expandSection(sectionId: string): Promise<void> {
    const toggle = this.page.getByTestId(`section-toggle-${sectionId}`);
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    }
  }

  /** Type into the league-name input. */
  async fillLeagueName(name: string): Promise<void> {
    await this.leagueNameInput.fill(name);
  }

  /** Submit the create-league form. */
  async submitCreate(): Promise<void> {
    await this.createButton.click();
  }

  /** Switch the active sport via the SportSwitcher tab. */
  async switchSport(sport: Sport): Promise<void> {
    await this.sportTab(sport).click();
  }

  /** Click a labelled choice button (team count, roster size, pool, …). */
  async clickButton(
    name: string | RegExp,
    opts?: { exact?: boolean },
  ): Promise<void> {
    await this.button(name, opts).click();
  }

  /** Click a text affordance (toggle, era card, visibility pill, …). */
  async clickText(
    value: string | RegExp,
    opts?: { exact?: boolean; first?: boolean },
  ): Promise<void> {
    const target = this.text(value, { exact: opts?.exact });
    await (opts?.first ? target.first() : target).click();
  }

  // ── Actions: detail tabs ─────────────────────────────────────────

  /** Click a detail-page tab/sub-tab by its visible label. */
  async openTab(label: string, opts?: { exact?: boolean }): Promise<void> {
    await this.page.getByText(label, { exact: opts?.exact }).first().click();
  }

  /** Click "Save Name" on the team-settings panel. */
  async saveTeamName(): Promise<void> {
    await this.page.getByRole('button', { name: /save name/i }).click();
  }

  /** Open the invite QR-code dialog. */
  async showQrCode(): Promise<void> {
    await this.page
      .getByRole('button', { name: /show qr code to invite/i })
      .click();
  }

  /** Confirm the "Rename team?" dialog (clicks its "Rename" button). */
  async confirmRename(): Promise<void> {
    await this.renameConfirmDialog
      .getByRole('button', { name: /^rename$/i })
      .click();
  }

  /** Cancel the "Rename team?" dialog (clicks its "Cancel" button). */
  async cancelRename(): Promise<void> {
    await this.renameConfirmDialog
      .getByRole('button', { name: /cancel/i })
      .click();
  }

  // ── Actions: join form ───────────────────────────────────────────

  /** Fill the invite-code + team-name fields and submit the join form. */
  async fillAndSubmitJoinForm(
    inviteCode: string,
    teamName: string,
  ): Promise<void> {
    await this.inviteCodeInput.fill(inviteCode);
    await this.teamNameInput.fill(teamName);
    await this.joinButton.click();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the creation form is loaded (heading + name input visible). */
  async expectCreateFormVisible(sport: Sport = 'baseball'): Promise<void> {
    await expect(this.createTitle(sport)).toBeVisible({ timeout: 30000 });
    await expect(this.leagueNameInput).toBeVisible();
  }

  /** Assert the detail page is loaded (V2 renders the league name as `<h1>`). */
  async expectDetailLoaded(name: string): Promise<void> {
    await expect(this.leagueNameHeading(name)).toBeVisible({ timeout: 15000 });
  }

  /** Assert the discovery page is loaded (heading + search visible). */
  async expectDiscoveryLoaded(): Promise<void> {
    await expect(this.discoveryHeading).toBeVisible({ timeout: 15000 });
    await expect(this.discoverySearch).toBeVisible();
  }

  /** Assert the join form is fully rendered. */
  async expectJoinFormVisible(): Promise<void> {
    await expect(this.joinHeading).toBeVisible({ timeout: 15000 });
    await expect(this.inviteCodeInput).toBeVisible();
    await expect(this.teamNameInput).toBeVisible();
  }

  /** Assert the page did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await expect(this.page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  }
}
