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

  /**
   * Navigate straight to a TEAM's detail page — the other surface that renders
   * the same `RosterBoard` lineup editor (LS-9657). Unlike {@link goto} this is
   * addressed by TEAM, so it can render a team the viewer does not own; the
   * board comes up read-only when it does.
   *
   * Native's Team Detail puts the board on a non-default tab, which the driver
   * route-parity seam resolves (`driver/native-route-map.ts`) — callers pass
   * the web-shaped path either way.
   */
  async gotoTeamDetail(
    teamId: number,
    sport: Sport = 'baseball',
  ): Promise<void> {
    await this.open(`/${sport}/teams/${teamId}`);
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
   * The occupied, LOCKED slot button for `fullName` at `positionType` —
   * `"<Player> at <POS> — locked"` (LS-6441 lock-window scenario). A locked
   * occupant's row disables `onPress` entirely (`RosterBoard.tsx`), so this
   * is both the "communicates why" assertion target and proof the row can't
   * be tapped into a selection.
   */
  lockedSlot(fullName: string, positionType: string): UIElement {
    return this.slotButton(
      new RegExp(`${fullName} at ${positionType} — locked`, 'i'),
    );
  }

  /**
   * The LOCKED bench row for `fullName` — `"<Player> — bench, locked"`
   * (LS-6441 lock-window scenario). Bench rows share the slot buttons'
   * `role="button"` vocabulary, so this is a thin `slotButton` wrapper like
   * {@link lockedSlot}.
   */
  lockedBenchRow(fullName: string): UIElement {
    return this.slotButton(new RegExp(`${fullName} — bench, locked`, 'i'));
  }

  /**
   * The occupied slot button for `fullName` at `positionType`, flagged as on
   * a bye week — `"<Player> at <POS> — on bye week"` (LS-6441 bye-week
   * scenario, `RosterBoard`'s `onBye`/`ByeWeekChip`, LS-6430).
   */
  byeSlot(fullName: string, positionType: string): UIElement {
    return this.slotButton(
      new RegExp(`${fullName} at ${positionType} — on bye week`, 'i'),
    );
  }

  /**
   * The BENCH row for `fullName` — `"<Player> — bench"`. The start of every
   * bench→slot assignment: tapping it is what puts the board into a selection
   * (`RosterBoard`'s `BenchRow`).
   */
  benchRow(fullName: string): UIElement {
    return this.slotButton(new RegExp(`${fullName} — bench`, 'i'));
  }

  /**
   * The open slot's action label once `fullName` is selected — `"Assign
   * <Player> to <POS>"`. An empty slot renames itself to this only while an
   * eligible player is selected, so its presence is also the proof that the
   * selection landed.
   */
  assignAction(fullName: string, positionType: string): UIElement {
    return this.slotButton(
      new RegExp(`assign ${fullName} to ${positionType}`, 'i'),
    );
  }

  /**
   * The "Move <Player> to bench" action offered for a SELECTED starter — the
   * starter→bench half of the lineup journey. Absent whenever the board is
   * read-only, since nothing can be selected there.
   */
  moveToBenchAction(fullName: string): UIElement {
    return this.slotButton(new RegExp(`move ${fullName} to bench`, 'i'));
  }

  /**
   * An EMPTY slot by its position type — `"<Position label> — open slot"`,
   * e.g. `"Quarterback — open slot"` (label from `rosterEligibility.ts`'s
   * `getPositionLabel`). The post-condition of moving a starter back to the
   * bench.
   */
  openSlot(positionLabel: string): UIElement {
    return this.slotButton(new RegExp(`${positionLabel} — open slot`, 'i'));
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
