import type { Sport } from './league.page';
import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the Roster tab of the league detail page
 * (`/:sport/league/:id/roster`) — the RosterBoardV2 lineup surface.
 *
 * Written against the platform-neutral driver interface (ADR-0016): the object
 * is a screen (extends {@link BaseScreen}, holds an {@link AppDriver}) and every
 * read getter returns a {@link UIElement}. Selectors stay in the portable
 * vocabulary — heading/text/role-name and stable `testID`s only — so the same
 * object drives web today and native once an Appium driver lands.
 *
 * Tab NAVIGATION from within a mounted league detail page lives on `LeaguePage`
 * (`openTab('My Roster')`); this object owns the roster surface itself so a spec
 * that lands directly on `/…/roster` speaks a dedicated vocabulary. It carries
 * no mocking or seed data — that stays in the specs (ADR-0015 §6).
 */
export class RosterPage extends BaseScreen {
  // ── Actions: navigation ──────────────────────────────────────────

  /**
   * Navigate straight to a league's roster tab. The driver's `open` resolves on
   * document load (`networkidle` never settles on the league surfaces — ADR-0015
   * Context); specs gate on the element they need next via the retrying
   * `expect*` surface.
   */
  async goto(leagueId: number, sport: Sport = 'baseball'): Promise<void> {
    await this.open(`/${sport}/league/${leagueId}/roster`);
  }

  // ── Reads: parameterised getters ─────────────────────────────────

  /** A section/card heading by its accessible name (e.g. "Starting Hitters", "Bench"). */
  heading(name: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.driver.byRole('heading', { name, ...opts });
  }

  /** A visible text node, by string or pattern (roster labels, empty-state copy). */
  text(value: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.driver.byText(value, opts);
  }

  /**
   * A lineup-slot button by its accessible name — occupied slots read
   * "<Player> at <POS>", empty slots read "open slot".
   */
  slotButton(name: string | RegExp): UIElement {
    return this.driver.byRole('button', { name });
  }

  /**
   * The occupied slot button for `fullName` assigned at `positionType` —
   * `"<Player> at <POS>"`. A thin, case-insensitive wrapper over
   * {@link slotButton} for the dual-mode lineup-assignment assertion
   * (`football-lineup.dual.spec.ts`), shared by both the "assignment landed"
   * check and the post-reload persistence check.
   */
  assignedSlot(fullName: string, positionType: string): UIElement {
    return this.slotButton(new RegExp(`${fullName} at ${positionType}`, 'i'));
  }

  /**
   * The Starting Pitchers section card (`roster-section-pitchers`). Scope
   * position-abbreviation reads to it so an "SP" label never collides with the
   * same text elsewhere on the page.
   */
  get pitchersSection(): UIElement {
    return this.driver.byTestId('roster-section-pitchers');
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the page did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await this.driver.byText('Unexpected Application Error').expectCount(0);
  }
}
