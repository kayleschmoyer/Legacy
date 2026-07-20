import type { Sport } from './league.page';
import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the matchup detail page
 * (`/:sport/league/:leagueId/matchups/:matchupId`) — scoreboard, roster
 * comparison, the in-context roster editor, week-navigation stepper, and the
 * premium win-probability panel.
 *
 * Written against the platform-neutral driver interface (ADR-0016): the object
 * is a screen (extends {@link BaseScreen}, holds an {@link AppDriver}) and every
 * read getter returns a {@link UIElement}, so the same object drives web today
 * and native once an Appium driver lands. Selectors stay in the portable
 * vocabulary — heading/text/role-name, associated labels, and stable `testID`s.
 *
 * The document `<title>`/`<meta>` assertions in the matchup-detail spec are a
 * web-only surface with no portable expression (ADR-0016 §4 "what page objects
 * still may not do"); those stay on the raw Playwright `page` in the spec,
 * documented there, rather than being faked behind this interface. The object
 * carries no mocking or seed data — that stays in the specs (ADR-0015 §6).
 */
export class MatchupPage extends BaseScreen {
  // ── Actions: navigation ──────────────────────────────────────────

  /**
   * Navigate to a matchup detail page. The driver's `open` resolves on document
   * load; specs gate on the element they need next via the retrying `expect*`
   * surface. (The loading-state spec, which must catch the spinner before the
   * gated query resolves, drives navigation itself with `waitUntil: 'commit'` —
   * a web-only timing lever outside the portable navigation contract.)
   */
  async goto(
    leagueId: number,
    matchupId: number,
    sport: Sport = 'baseball',
  ): Promise<void> {
    await this.open(`/${sport}/league/${leagueId}/matchups/${matchupId}`);
  }

  /** Click "Back to League" to return to the league detail page. */
  async goBackToLeague(): Promise<void> {
    await this.button(/back to league/i).tap();
  }

  // ── Actions: week navigation stepper ─────────────────────────────

  /** Step the week stepper back one week. */
  async goPrevWeek(): Promise<void> {
    await this.prevWeekButton.tap();
  }

  /** Step the week stepper forward one week. */
  async goNextWeek(): Promise<void> {
    await this.nextWeekButton.tap();
  }

  // ── Actions: in-context roster editor ────────────────────────────

  /** Select a matchup roster row (bench or starter) by its player id. */
  async selectPlayerRow(matchupPlayerId: number | string): Promise<void> {
    await this.playerRow(matchupPlayerId).tap();
  }

  /**
   * Assign the currently-selected player to a league position slot. The assign
   * affordance is keyed `roster-assign-<playerId>-<positionId>` and is revealed
   * once the player row is selected.
   */
  async assignPlayerToPosition(
    matchupPlayerId: number | string,
    positionId: number | string,
  ): Promise<void> {
    await this.assignButton(matchupPlayerId, positionId).tap();
  }

  // ── Reads: parameterised getters ─────────────────────────────────

  /** A heading by its accessible name (e.g. "Matchup Details", "Edit Lineup"). */
  heading(name: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.driver.byRole('heading', { name, ...opts });
  }

  /** A button anywhere on the page, by accessible name. */
  button(name: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.driver.byRole('button', { name, ...opts });
  }

  /** A visible text node, by string or pattern. */
  text(value: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.driver.byText(value, opts);
  }

  /** An element by its stable `data-testid`. */
  testId(id: string): UIElement {
    return this.driver.byTestId(id);
  }

  /** The main matchup content region (`role="main"`, labelled "Matchup details"). */
  get mainRegion(): UIElement {
    return this.driver.byRole('main', { name: 'Matchup details' });
  }

  // ── Reads: week navigation ───────────────────────────────────────

  /** The "Previous week" stepper button. */
  get prevWeekButton(): UIElement {
    return this.driver.byLabel('Previous week');
  }

  /** The "Next week" stepper button. */
  get nextWeekButton(): UIElement {
    return this.driver.byLabel('Next week');
  }

  /** The stepper's current-week label ("Week N"); collides with card copy, so `.first()`. */
  weekLabel(weekNumber: number): UIElement {
    return this.driver.byText(`Week ${weekNumber}`).first();
  }

  /** A navigation matchup card by its accessible label ("<Team A> vs <Team B>"). */
  matchupCard(name: string): UIElement {
    return this.driver.byLabel(name, { exact: true });
  }

  /** The scoreboard region by its accessible name (contains both team names). */
  scoreboardRegion(name: string | RegExp): UIElement {
    return this.driver.byRole('region', { name });
  }

  // ── Reads: roster editor ─────────────────────────────────────────

  /** A matchup roster row by player id (`matchup-player-row-<id>`). */
  playerRow(matchupPlayerId: number | string): UIElement {
    return this.driver.byTestId(`matchup-player-row-${matchupPlayerId}`);
  }

  /** The assign-to-slot affordance for a player + position (`roster-assign-<p>-<pos>`). */
  assignButton(
    matchupPlayerId: number | string,
    positionId: number | string,
  ): UIElement {
    return this.driver.byTestId(
      `roster-assign-${matchupPlayerId}-${positionId}`,
    );
  }

  // ── Reads: win-probability panel ─────────────────────────────────

  /** The premium win-probability panel (`win-probability-panel`). */
  get winProbabilityPanel(): UIElement {
    return this.driver.byTestId('win-probability-panel');
  }

  /** The PremiumGate "Upgrade to Premium" CTA shown to free users. */
  get upgradeButton(): UIElement {
    return this.driver.byRole('button', { name: /upgrade to premium/i });
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the page did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await this.driver.byText('Unexpected Application Error').expectCount(0);
  }
}
