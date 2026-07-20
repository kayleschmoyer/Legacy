import { expect } from '@playwright/test';

import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';
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
 * Migrated to the platform-neutral driver interface (ADR-0016): the object is
 * a screen (extends {@link BaseScreen}, holds an {@link AppDriver}) and every
 * read getter returns a {@link UIElement} instead of a Playwright `Locator`.
 * Getter names are unchanged from the pre-migration object, so specs keep the
 * same vocabulary — they assert via the element's retrying `expect*` surface
 * (`leaguePage.createButton.expectVisible()`) rather than wrapping a locator
 * in `expect()`.
 *
 * The object exposes the three semantic surfaces:
 *   • actions  — navigation + form/control verbs (`gotoCreate`, `expandSection`,
 *                `submitCreate`, `openTab`, `saveTeamName`, …)
 *   • reads    — element getters specs assert against (`leagueNameInput`,
 *                `createButton`, plus the parameterised `button` / `text` /
 *                `heading` / `testId` getters that centralise element
 *                construction so specs stay selector-free)
 *   • asserts  — retrying wrappers (`expectCreateFormVisible`,
 *                `expectDiscoveryLoaded`, `expectNoAppError`, …)
 *
 * The discovery card's filter/join mechanism lives in the `LeagueCard`
 * component (ADR-0015 §2), composed via `cardById` / `cardByName`. The object
 * carries no mocking or seed data — that stays in the specs (ADR-0015 §6), so
 * the same object drives both the hermetic and integration suites.
 */
export class LeaguePage extends BaseScreen {
  // ── Reads: parameterised element getters ─────────────────────────
  // These centralise element construction so specs never build a raw selector.
  // Mechanism-level interactions have dedicated actions below; these cover the
  // long tail of content/control assertions (helper copy, option buttons, …).

  /** A button anywhere on the page, by accessible name. */
  button(name: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.driver.byRole('button', { name, ...opts });
  }

  /** A heading, by accessible name (optionally pinned to a level). */
  heading(
    name: string | RegExp,
    opts?: { level?: number; exact?: boolean },
  ): UIElement {
    return this.driver.byRole('heading', { name, ...opts });
  }

  /** A visible text node, by string or pattern. */
  text(value: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.driver.byText(value, opts);
  }

  /** An input/textarea, by its placeholder. */
  placeholder(value: string | RegExp): UIElement {
    return this.driver.byPlaceholder(value);
  }

  /** An element by its stable `data-testid`. */
  testId(id: string): UIElement {
    return this.driver.byTestId(id);
  }

  /** The one-line collapsed summary for a create-form section (visible only when collapsed). */
  sectionSummary(sectionId: string): UIElement {
    return this.driver.byTestId(`section-summary-${sectionId}`);
  }

  /** The current `role="alert"` (validation / error surface). */
  get alert(): UIElement {
    return this.driver.byRole('alert');
  }

  // ── Reads: named create-form getters ─────────────────────────────

  /** The create-form readiness testid (`create-league-heading`). */
  get createHeading(): UIElement {
    return this.driver.byTestId('create-league-heading');
  }

  /** The sport-specific "Create {Sport} League" page heading. */
  createTitle(sport: Sport = 'baseball'): UIElement {
    return this.driver.byRole('heading', {
      name:
        sport === 'football'
          ? /Create Football League/i
          : /Create Baseball League/i,
    });
  }

  /** The league-name text input. */
  get leagueNameInput(): UIElement {
    return this.driver.byPlaceholder('Enter your league name');
  }

  /** The "Create League" submit button. */
  get createButton(): UIElement {
    return this.driver.byRole('button', { name: /create league/i });
  }

  /** The submit button while it shows its in-flight "Creating…" label. */
  get creatingButton(): UIElement {
    return this.driver.byRole('button', { name: /creating/i });
  }

  /** A sport tab in the SportSwitcher (`sport-tab-baseball` / `-football`). */
  sportTab(sport: Sport): UIElement {
    return this.driver.byTestId(`sport-tab-${sport}`);
  }

  /** The football "beta" status banner (only rendered in football mode). */
  get footballBetaBanner(): UIElement {
    return this.driver.byTestId('football-beta-banner');
  }

  /** The premium-feature gate overlay (free-tier gated controls). */
  get premiumGate(): UIElement {
    return this.driver.byTestId('premium-feature-gate');
  }

  /**
   * The `UpgradeModal` dialog (`apps/web/src/components/UpgradeModal.tsx`) —
   * opened by any premium-gated control's upgrade CTA, including create-form
   * fields (FAAB waivers, historical eras, salary cap) and the {@link premiumGate}
   * overlay's own CTA.
   */
  get upgradeModal(): UIElement {
    return this.driver.byRole('dialog', { name: /upgrade to premium/i });
  }

  /** The salary-cap amount input (visible once the salary cap toggle is on). */
  get salaryCapAmountInput(): UIElement {
    return this.driver.byTestId('create-league-salary-cap-input');
  }

  /** The FAAB custom-budget amount input (visible once "Custom" is selected). */
  get faabBudgetCustomInput(): UIElement {
    return this.driver.byTestId('create-league-faab-budget-custom-input');
  }

  /**
   * The "Number of Teams" field (Basic Settings). Scopes team-count option
   * buttons so their labels don't collide with the Number of Divisions
   * button group, which can render an identical numeral (LS-5365).
   */
  get numberOfTeamsField(): UIElement {
    return this.driver.byTestId('numberOfTeams-field');
  }

  /**
   * The "Number of Divisions" field (Basic Settings). Scopes division-count
   * option buttons — see {@link numberOfTeamsField} (LS-5365).
   */
  get numberOfDivisionsField(): UIElement {
    return this.driver.byTestId('numberOfDivisions-field');
  }

  // ── Reads: named detail getters ──────────────────────────────────

  /** The league name rendered as the detail page `<h1>`. */
  leagueNameHeading(name: string): UIElement {
    return this.driver.byRole('heading', { name, level: 1 });
  }

  /**
   * The team-settings name input. Resolved by its form label ("Team Name",
   * `<label for="team-name-input">` in Team.tsx) — the platform-neutral
   * selector for a labelled input that carries no test id (ADR-0016).
   */
  get teamNameSettingInput(): UIElement {
    return this.driver.byLabel('Team Name', { exact: true });
  }

  /** The "Rename team?" confirmation dialog. */
  get renameConfirmDialog(): UIElement {
    return this.driver.byTestId('rename-team-confirm');
  }

  /**
   * The "Discard" confirm button inside the "Discard this league?" dialog
   * shown when Cancel is clicked on the league-create form with unsaved
   * changes (LS-6108).
   */
  get discardConfirmButton(): UIElement {
    return this.driver.byRole('button', { name: /^discard$/i });
  }

  /** The QR-code loading skeleton (shown until the invite code resolves). */
  get qrCodeSkeleton(): UIElement {
    return this.driver.byTestId('qr-code-skeleton');
  }

  /** The rendered QR-code SVG. */
  get qrCodeSvg(): UIElement {
    return this.driver.byTestId('qr-code-svg');
  }

  /** The league-chat message composer input. */
  get chatInput(): UIElement {
    return this.driver.byPlaceholder(/message/i).first();
  }

  /** The History tab season selector combobox. */
  get seasonSelector(): UIElement {
    return this.driver.byRole('combobox', { name: /select season/i });
  }

  /** A standings table column header by its accessible name. */
  standingsColumnHeader(name: string | RegExp): UIElement {
    return this.driver.byRole('columnheader', { name });
  }

  // ── Reads: named discovery getters ───────────────────────────────

  /** The discovery page `<h1>` ("Browse Public Leagues"). */
  get discoveryHeading(): UIElement {
    return this.driver.byRole('heading', {
      name: /Browse Public Leagues/i,
      level: 1,
    });
  }

  /** The discovery search input. */
  get discoverySearch(): UIElement {
    return this.driver.byPlaceholder('Search leagues by name…');
  }

  /** The discovery results-count badge. */
  get discoveryResultsCount(): UIElement {
    return this.driver.byTestId('discovery-results-count');
  }

  /** The discovery "Refresh" button. */
  get discoveryRefreshButton(): UIElement {
    return this.driver.byRole('button', { name: /Refresh/i });
  }

  /** The discovery "No public leagues found" empty-state heading. */
  get discoveryEmptyHeading(): UIElement {
    return this.driver.byRole('heading', {
      name: /No public leagues found/i,
    });
  }

  /** The discovery footer CTA ("Can't find the right league?"). */
  get discoveryFooterCta(): UIElement {
    return this.driver.byText(/Can't find the right league\?/i);
  }

  // ── Reads: named join getters ────────────────────────────────────

  /** The join page `<h1>` ("Join League"). */
  get joinHeading(): UIElement {
    return this.driver.byRole('heading', { name: /Join League/i, level: 1 });
  }

  /** The invite-code text input. */
  get inviteCodeInput(): UIElement {
    return this.driver.byPlaceholder('Enter 8-character code');
  }

  /** The join-form team-name input. */
  get teamNameInput(): UIElement {
    return this.driver.byPlaceholder('Enter your team name');
  }

  /** The "Join League" submit button on the join-by-code form. */
  get joinButton(): UIElement {
    return this.driver.byRole('button', { name: /join league/i });
  }

  /** The "Cancel" button (join + create forms share the label). */
  get cancelButton(): UIElement {
    return this.driver.byRole('button', { name: /cancel/i });
  }

  /** The deep-link "Invite code loaded from link" confirmation banner. */
  get deepLinkBanner(): UIElement {
    return this.driver.byText(/Invite code loaded from link/i);
  }

  /** The inline join-form error card. */
  get formErrorCard(): UIElement {
    return this.driver.byTestId('join-form-error');
  }

  // ── Reads: discovery card composition ────────────────────────────

  /** Scope a {@link LeagueCard} by its league id (`league-card-<id>`). */
  cardById(id: number): LeagueCard {
    return new LeagueCard(this.driver.byTestId(`league-card-${id}`));
  }

  /** Scope a {@link LeagueCard} by the league name it displays. */
  cardByName(name: string): LeagueCard {
    return new LeagueCard(
      this.driver.byTestIdPrefix('league-card-').filterByText(name).first(),
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
    await this.driver.open(`/${sport}/league/create`);
    await this.leagueNameInput.expectVisible({ timeout: 30000 });
  }

  /**
   * Navigate to the league creation page with a `?name=` query param
   * pre-filling the league name (LS-5372).
   */
  async gotoCreateWithName(
    name: string,
    sport: Sport = 'baseball',
  ): Promise<void> {
    await this.driver.open(
      `/${sport}/league/create?name=${encodeURIComponent(name)}`,
    );
    await this.leagueNameInput.expectVisible({ timeout: 30000 });
  }

  /**
   * Navigate to a league detail tab. The driver's `open` resolves once the
   * document has loaded (`networkidle` is defeated by the league activity/chat
   * long-poll — ADR-0015 Context); specs gate on the element they need next.
   */
  async gotoDetail(leagueId: number, tab?: string): Promise<void> {
    const path = tab
      ? `/baseball/league/${leagueId}/${tab}`
      : `/baseball/league/${leagueId}`;
    await this.driver.open(path);
  }

  /** Navigate to the league discovery page and wait for its heading. */
  async gotoDiscovery(): Promise<void> {
    await this.driver.open('/baseball/leagues');
    await this.discoveryHeading.expectVisible({ timeout: 30000 });
  }

  /** Navigate to the join-by-code page (optionally with a deep-link code). */
  async gotoJoin(inviteCode?: string): Promise<void> {
    const path = inviteCode
      ? `/baseball/league/join/${inviteCode}`
      : '/baseball/league/join';
    await this.driver.open(path);
  }

  // ── Actions: create form ─────────────────────────────────────────

  /**
   * Expand a collapsible create-form section by its id (e.g. `draft`,
   * `roster-schedule`, `era-history`, `waiver-budget`). No-op if already open.
   */
  async expandSection(sectionId: string): Promise<void> {
    const toggle = this.driver.byTestId(`section-toggle-${sectionId}`);
    await toggle.expectVisible();
    if ((await toggle.attribute('aria-expanded')) !== 'true') {
      await toggle.tap();
      await toggle.expectAttribute('aria-expanded', 'true');
    }
  }

  /**
   * Collapse a collapsible create-form section by its id, revealing its
   * collapsed one-line summary. No-op if already collapsed.
   */
  async collapseSection(sectionId: string): Promise<void> {
    const toggle = this.driver.byTestId(`section-toggle-${sectionId}`);
    await toggle.expectVisible();
    if ((await toggle.attribute('aria-expanded')) === 'true') {
      await toggle.tap();
      await toggle.expectAttribute('aria-expanded', 'false');
    }
  }

  /** Type into the league-name input. */
  async fillLeagueName(name: string): Promise<void> {
    await this.leagueNameInput.fill(name);
  }

  /** Submit the create-league form. */
  async submitCreate(): Promise<void> {
    await this.createButton.tap();
  }

  /**
   * Confirm the post-create "League created!" dialog (LS-6067), which shows
   * the invite code and gates navigation to the new league page.
   */
  async continueToLeague(): Promise<void> {
    await this.button(/continue to league/i).tap();
  }

  /** Type an amount into the salary-cap input (only visible when enabled). */
  async fillSalaryCapAmount(amount: number): Promise<void> {
    await this.salaryCapAmountInput.fill(String(amount));
  }

  /** Type an amount into the FAAB custom-budget input (only visible in Custom mode). */
  async fillFaabBudgetAmount(amount: number): Promise<void> {
    await this.faabBudgetCustomInput.fill(String(amount));
  }

  /** Click the {@link premiumGate}'s "Upgrade to Premium" CTA. */
  async clickPremiumGateUpgrade(): Promise<void> {
    await this.premiumGate
      .byRole('button', { name: /upgrade to premium/i })
      .tap();
  }

  /** Close the currently-open {@link upgradeModal}. */
  async closeUpgradeModal(): Promise<void> {
    await this.upgradeModal.byRole('button', { name: 'Close' }).tap();
  }

  /** Switch the active sport via the SportSwitcher tab. */
  async switchSport(sport: Sport): Promise<void> {
    await this.sportTab(sport).tap();
  }

  /** Click a labelled choice button (team count, roster size, pool, …). */
  async clickButton(
    name: string | RegExp,
    opts?: { exact?: boolean },
  ): Promise<void> {
    await this.button(name, opts).tap();
  }

  /**
   * Select a team-count option, scoped to the Number of Teams field so the
   * numeral can't match an identically-labelled Number of Divisions button
   * (LS-5365).
   */
  async selectTeamCount(count: number): Promise<void> {
    await this.numberOfTeamsField
      .byRole('button', { name: String(count), exact: true })
      .tap();
  }

  /**
   * Select a division-count option, scoped to the Number of Divisions field
   * — see {@link selectTeamCount} (LS-5365).
   */
  async selectDivisionCount(count: number): Promise<void> {
    await this.numberOfDivisionsField
      .byRole('button', { name: String(count), exact: true })
      .tap();
  }

  /** Click a text affordance (toggle, era card, visibility pill, …). */
  async clickText(
    value: string | RegExp,
    opts?: { exact?: boolean; first?: boolean },
  ): Promise<void> {
    const target = this.text(value, { exact: opts?.exact });
    await (opts?.first ? target.first() : target).tap();
  }

  /** The draft date/time picker trigger (Draft Settings section). */
  get draftDatePickerTrigger(): UIElement {
    return this.driver.byTestId('date-time-picker-trigger');
  }

  /** The "Apply" button inside the open draft date/time picker popover. */
  get draftDatePickerApply(): UIElement {
    return this.driver.byTestId('date-time-picker-apply');
  }

  /**
   * Open the Draft Settings date/time picker, select `date` on the calendar
   * (must be the currently-displayed month), and apply it.
   */
  async selectDraftDate(date: Date): Promise<void> {
    await this.draftDatePickerTrigger.tap();
    const dayId = `date-time-picker-day-${date.toISOString().slice(0, 10)}`;
    await this.testId(dayId).tap();
    await this.draftDatePickerApply.tap();
  }

  // ── Actions: detail tabs ─────────────────────────────────────────

  /** Click a detail-page tab/sub-tab by its visible label. */
  async openTab(label: string, opts?: { exact?: boolean }): Promise<void> {
    await this.driver.byText(label, { exact: opts?.exact }).first().tap();
  }

  /** Click "Save Name" on the team-settings panel. */
  async saveTeamName(): Promise<void> {
    await this.driver.byRole('button', { name: /save name/i }).tap();
  }

  /** Open the invite QR-code dialog. */
  async showQrCode(): Promise<void> {
    await this.driver
      .byRole('button', { name: /show qr code to invite/i })
      .tap();
  }

  /** Confirm the "Rename team?" dialog (clicks its "Rename" button). */
  async confirmRename(): Promise<void> {
    await this.renameConfirmDialog
      .byRole('button', { name: /^rename$/i })
      .tap();
  }

  /** Cancel the "Rename team?" dialog (clicks its "Cancel" button). */
  async cancelRename(): Promise<void> {
    await this.renameConfirmDialog.byRole('button', { name: /cancel/i }).tap();
  }

  // ── Actions: join form ───────────────────────────────────────────

  /** Fill the invite-code + team-name fields and submit the join form. */
  async fillAndSubmitJoinForm(
    inviteCode: string,
    teamName: string,
  ): Promise<void> {
    await this.inviteCodeInput.fill(inviteCode);
    await this.teamNameInput.fill(teamName);
    await this.joinButton.tap();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the creation form is loaded (heading + name input visible). */
  async expectCreateFormVisible(sport: Sport = 'baseball'): Promise<void> {
    await this.createTitle(sport).expectVisible({ timeout: 30000 });
    await this.leagueNameInput.expectVisible();
  }

  /** Assert the detail page is loaded (V2 renders the league name as `<h1>`). */
  async expectDetailLoaded(name: string): Promise<void> {
    await this.leagueNameHeading(name).expectVisible({ timeout: 15000 });
  }

  /** Assert the discovery page is loaded (heading + search visible). */
  async expectDiscoveryLoaded(): Promise<void> {
    await this.discoveryHeading.expectVisible({ timeout: 15000 });
    await this.discoverySearch.expectVisible();
  }

  /** Assert the join form is fully rendered. */
  async expectJoinFormVisible(): Promise<void> {
    await this.joinHeading.expectVisible({ timeout: 15000 });
    await this.inviteCodeInput.expectVisible();
    await this.teamNameInput.expectVisible();
  }

  /**
   * Assert the {@link upgradeModal} is open and shows the given feature's
   * "Unlock <featureName> and more" subtitle.
   */
  async expectUpgradeModalVisible(featureName: string): Promise<void> {
    await this.upgradeModal.expectVisible();
    await this.text(`Unlock ${featureName} and more`).expectVisible();
  }

  /** Assert no upgrade modal is currently open. */
  async expectNoUpgradeModal(): Promise<void> {
    await this.upgradeModal.expectHidden();
  }

  /** Assert the page did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await this.driver.byText('Unexpected Application Error').expectCount(0);
  }

  /**
   * Assert the create flow surfaced an error to the user — an ARIA alert, an
   * inline error card, or error copy all satisfy the contract. Poll both
   * shapes rather than pinning one implementation (`expect.poll` is
   * runner-level, so it stays valid over driver reads on every platform —
   * mirrors DraftPage.expectCannotDraft).
   */
  async expectCreateErrorSurfaced(): Promise<void> {
    const alert = this.alert.first();
    const errorText = this.text(/error|failed|server error/i).first();
    await expect
      .poll(
        async () => (await alert.isVisible()) || (await errorText.isVisible()),
        { timeout: 5000 },
      )
      .toBe(true);
  }
}
