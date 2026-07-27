import type { Sport } from './league.page';
import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the Standings tab of the league detail page
 * (`/:sport/league/:id/standings`).
 *
 * Written against the platform-neutral driver interface (ADR-0016): the object
 * is a screen (extends {@link BaseScreen}, holds an {@link AppDriver}) and every
 * read getter returns a {@link UIElement}, so the same object drives web today
 * and native once an Appium driver lands. Selectors stay in the portable
 * vocabulary — text and role/name only (ADR-0016 §capability model).
 *
 * The league detail page's tab NAVIGATION lives on `LeaguePage`
 * (`openTab`/`gotoDetail`); this object owns the standings surface itself so a
 * spec that lands directly on `/…/standings` speaks a dedicated vocabulary.
 * It carries no mocking or seed data — that stays in the specs (ADR-0015 §6).
 */
export class StandingsPage extends BaseScreen {
  // ── Actions: navigation ──────────────────────────────────────────

  /**
   * Navigate straight to a league's standings tab. The driver's `open` resolves
   * on document load (`networkidle` is defeated by the league activity/chat
   * long-poll — ADR-0015 Context); specs gate on the element they need next via
   * the retrying `expect*` surface.
   */
  async goto(leagueId: number, sport: Sport = 'baseball'): Promise<void> {
    await this.open(`/${sport}/league/${leagueId}/standings`);
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** A team's row/name anywhere in the standings table, by its display name. */
  team(name: string): UIElement {
    return this.driver.byText(name);
  }

  /**
   * A standings stat cell by its rendered value (win/loss totals, etc.).
   * Values collide across rows, so specs pin the match with `.first()`.
   */
  statCell(value: string): UIElement {
    return this.driver.byText(value);
  }

  /** The full table row for a team, scoped by its display name. */
  row(teamName: string): UIElement {
    return this.driver.byRole('row').filterByText(teamName);
  }

  /**
   * The "You" tag on the current user's team row (unique — at most one row is
   * tagged). Scoped to a table cell so it doesn't collide with unrelated "You"
   * text elsewhere on the page (e.g. the mobile bottom nav's "You" profile link).
   */
  youTag(): UIElement {
    return this.driver.byRole('cell').filterByText('You');
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the page did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await this.driver.byText('Unexpected Application Error').expectCount(0);
  }
}
