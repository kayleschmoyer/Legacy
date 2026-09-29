import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the league free-agents surface (LS-1605).
 *
 * The `LeagueFreeAgents` table (`apps/web/src/features/baseball/LeagueFreeAgents.tsx`)
 * renders on the free-agents tab of the league detail page
 * (`/baseball/league/:id/free-agents`). It owns the browse table, the
 * Hitters/Pitchers toggle, the search box, the position-filter chips, the
 * pagination footer, and the "No players found" / "Unable to Load Players"
 * states. Claiming a player opens the `WaiverClaimModal`
 * (`apps/web/src/features/baseball/WaiverClaimModal.tsx`), whose header,
 * submit button, and post-submit success card this object also covers so the
 * whole browse → claim → confirm flow is one selector-free surface.
 *
 * Migrated to the platform-neutral driver interface (ADR-0016): the object is a
 * screen (extends {@link BaseScreen}, holds an {@link AppDriver}) and every read
 * getter returns a {@link UIElement}, so specs assert via the element's retrying
 * `expect*` surface and never touch a selector. Locators stay PRIVATE to the
 * getters; the public API is the three semantic surfaces — navigation + browse
 * verbs, element reads, and their retrying assertions.
 *
 * The object carries no mocking, identity, or seed data (ADR-0015 §6) — the
 * GraphQL `page.route` mocks stay in the spec. Every flow here is portable
 * (text/role/testid selectors that map onto both platforms), so there is no
 * web-only remainder: the same object drives the hermetic suite today and (once
 * the native mock server replaces `page.route`) the native suite.
 */
export class FreeAgentsPage extends BaseScreen {
  // ── Reads: table + toolbar getters ───────────────────────────────
  // These centralise element construction so specs never build a raw selector.

  /**
   * A player's "First Last" name as rendered in the table (and, in the claim
   * modal, its player card). Chain `.last()` in a spec to target the modal's
   * copy when the same name also appears in the underlying row.
   */
  playerName(name: string): UIElement {
    return this.driver.byText(name);
  }

  /** The "Hitters" player-type toggle. */
  get hittersToggle(): UIElement {
    return this.driver.byText('Hitters');
  }

  /** The "Pitchers" player-type toggle. */
  get pitchersToggle(): UIElement {
    return this.driver.byText('Pitchers');
  }

  /**
   * A position-filter chip by position code, resolved by its `data-testid`
   * (`position-filter-<pos>`, e.g. `ALL`, `C`) — for asserting the chips render.
   * Use {@link filterByPosition} to click one (it resolves the chip by its
   * accessible name to avoid the Silver-Slugger "SS" text collision).
   */
  positionChip(pos: string): UIElement {
    return this.driver.byTestId(`position-filter-${pos}`);
  }

  /**
   * The pagination "Showing <from>–<to>" range label (en dash, matching the
   * component's `Showing 1–3` output).
   */
  showingRange(from: number, to: number): UIElement {
    return this.driver.byText(new RegExp(`Showing ${from}–${to}`));
  }

  /** The player-search input (placeholder "Search players…"). */
  get searchInput(): UIElement {
    return this.driver.byPlaceholder(/Search players/i);
  }

  /** The claim ("Add <player>") button for a player's table row. */
  addButton(playerName: string): UIElement {
    return this.driver.byRole('button', {
      name: new RegExp(`Add ${playerName}`, 'i'),
    });
  }

  /** The `WaiverClaimModal` header ("Claim Free Agent"). */
  get claimModalHeader(): UIElement {
    return this.driver.byText('Claim Free Agent');
  }

  /** The modal's "Submit Claim" button. */
  get submitClaimButton(): UIElement {
    return this.driver.byRole('button', { name: /Submit Claim/i });
  }

  /** The post-submit success header ("Waiver Claim Submitted!"). */
  get successHeader(): UIElement {
    return this.driver.byText('Waiver Claim Submitted!');
  }

  /** The success-card body confirming the claim for a specific player. */
  successMessage(playerName: string): UIElement {
    return this.driver.byText(
      new RegExp(`Your claim for ${playerName} has been submitted`, 'i'),
    );
  }

  /** The success-card "Done" button (closes the modal). */
  get doneButton(): UIElement {
    return this.driver.byRole('button', { name: /Done/i });
  }

  /**
   * The claim modal's roster-status line, rendered once the claiming team's
   * roster has loaded: "Roster full (n/max) — select a player to drop" or
   * "Roster has space (n/max)".
   */
  get claimRosterStatus(): UIElement {
    return this.driver.byText(/select a player to drop|Roster has space/i);
  }

  /** The full-roster prompt requiring a drop before the claim can submit. */
  get dropPrompt(): UIElement {
    return this.driver.byText(/select a player to drop/i);
  }

  /**
   * The first drop-candidate row in the full-roster list. Resolved by role +
   * accessible name ("Drop <player>"), not its `drop-player-<id>` testID —
   * Tamagui drops testIDs on styled elements that carry a11y props.
   */
  get firstDropCandidate(): UIElement {
    return this.driver.byRole('option', { name: /^Drop / }).first();
  }

  /** The "Dropping" badge on the selected drop-candidate row. */
  get droppingBadge(): UIElement {
    return this.driver.byText('Dropping');
  }

  /** The "No players found" empty-state heading. */
  get emptyStateHeading(): UIElement {
    return this.driver.byText('No players found');
  }

  /** The empty-state hint ("Try adjusting your search or position filter"). */
  get emptyStateHint(): UIElement {
    return this.driver.byText(/Try adjusting your search or position filter/i);
  }

  /**
   * The player-load error message, scoped to the `main-content` region (the
   * failure copy "Unable to Load Players" renders inside the table's empty
   * state).
   */
  get loadError(): UIElement {
    return this.driver
      .byTestId('main-content')
      .byText('Unable to Load Players');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Navigate to a league's free-agents tab and wait for the content region.
   * Gate on the stable `main-content` region (present across the list, empty,
   * and error states), never on `networkidle` (ADR-0015 Context).
   */
  async goto(leagueId: number): Promise<void> {
    await this.open(`/baseball/league/${leagueId}/free-agents`, 'main-content');
  }

  /** Type into the player-search box (debounced server-side refetch follows). */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
  }

  /**
   * Click a position-filter chip by code. Resolves the chip by its accessible
   * name ("Filter by position: <pos>", exact) rather than its testid to avoid
   * colliding with the Silver-Slugger "SS" accolade text in player rows.
   */
  async filterByPosition(pos: string): Promise<void> {
    await this.driver
      .byRole('button', { name: `Filter by position: ${pos}`, exact: true })
      .tap();
  }

  /** Open the waiver-claim modal for a player (clicks its "Add <player>" button). */
  async openClaimModal(playerName: string): Promise<void> {
    await this.addButton(playerName).tap();
  }

  /**
   * In the open waiver-claim modal, pick a player to drop when the roster is
   * full (e.g. right after a live draft, where rounds = max roster size);
   * does nothing when the roster has space. Mirrors
   * `integration/helpers/waiver-claim-drop.ts` on the driver interface
   * (LS-10228). Waits for the roster-status line first so the "has space"
   * branch isn't taken while the roster is still loading. Returns whether a
   * drop was selected.
   */
  async selectDropIfRosterFull(): Promise<boolean> {
    await this.claimRosterStatus.expectVisible({ timeout: 15_000 });
    if (!(await this.dropPrompt.isVisible())) {
      return false;
    }
    await this.firstDropCandidate.tap();
    await this.droppingBadge.expectVisible({ timeout: 5_000 });
    return true;
  }

  /** Submit the open waiver-claim modal. */
  async submitClaim(): Promise<void> {
    await this.submitClaimButton.tap();
  }

  /** Close the success card via its "Done" button. */
  async closeSuccess(): Promise<void> {
    await this.doneButton.tap();
  }
}
