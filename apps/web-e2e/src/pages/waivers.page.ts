import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the pending waiver claims surface (LS-611).
 *
 * The `PendingWaiverClaims` panel
 * (`lib/shared-components/src/features/roster/PendingWaiverClaims.tsx`) is not a
 * standalone route — it renders inline on the league **roster tab**
 * (`/baseball/league/:id/roster`) whenever the viewing team has at least one
 * pending claim (or a load error to surface). The panel returns `null` when the
 * claim list is empty, so the empty state is expressed as the panel {@link header}
 * being hidden rather than a dedicated empty-state element.
 *
 * Migrated to the platform-neutral driver interface (ADR-0016): the object is a
 * screen (extends {@link BaseScreen}, holds an {@link AppDriver}) and every read
 * getter returns a {@link UIElement}, so specs assert via the element's retrying
 * `expect*` surface and never touch a selector. All locators stay PRIVATE to the
 * getters below; the only public API is the three semantic surfaces — navigation
 * + cancel actions, element reads, and their retrying assertions.
 *
 * The object carries no mocking, identity, or seed data (ADR-0015 §6) — the
 * GraphQL `page.route` mocks stay in the spec, so the same object drives the
 * hermetic suite today and (once the native mock server lands) the native suite.
 * Every flow here is portable: claim rows, the cancel button, the FAAB/drop
 * badges, the footer summary, and the error alert all resolve by text/role/testid
 * that map onto both platforms — there is no web-only remainder.
 */
export class WaiversPage extends BaseScreen {
  // ── Reads: panel + claim-row getters ─────────────────────────────
  // These centralise element construction so specs never build a raw selector.

  /**
   * The panel header ("Pending Waiver Claims"). Present only when the panel
   * renders — assert `expectVisible()` when claims exist and `expectHidden()`
   * for the empty state (the component returns `null` with no claims).
   */
  get header(): UIElement {
    return this.driver.byText('Pending Waiver Claims');
  }

  /**
   * A claim's player name (or the drop-player name) by its rendered text.
   * Covers both the real name and the `Player #<id>` fallback the row renders
   * when `playerName` is null.
   */
  playerName(name: string): UIElement {
    return this.driver.byText(name);
  }

  /**
   * The footer summary line for `count` pending claims
   * ("N pending claim(s) — processed hourly"), pluralised to match the
   * component so a spec asserts the exact singular/plural copy.
   */
  footerSummary(count: number): UIElement {
    const noun = count === 1 ? 'claim' : 'claims';
    return this.driver.byText(
      new RegExp(`${count} pending ${noun} — processed hourly`, 'i'),
    );
  }

  /** The cancel button for a specific claim, by its accessible name. */
  cancelButtonFor(playerName: string): UIElement {
    return this.driver.byRole('button', {
      name: new RegExp(`cancel waiver claim for ${playerName}`, 'i'),
    });
  }

  /** The FAAB-bid badge for a claim ("$<amount> FAAB"), shown when a bid is set. */
  faabBadge(amount: number): UIElement {
    return this.driver.byText(`$${amount} FAAB`);
  }

  /**
   * Any FAAB label on the panel. For asserting a claim with no bid renders no
   * FAAB copy at all (`expectHidden`).
   */
  get faabLabel(): UIElement {
    return this.driver.byText(/FAAB/);
  }

  /** The "Drop:" label a claim renders when it also drops a roster player. */
  get dropLabel(): UIElement {
    return this.driver.byText(/Drop:/i);
  }

  /**
   * The claim-load failure message, scoped to the `alert` role. V2 renders the
   * message twice (the assistive `alert` region plus visible body text); scoping
   * to the alert avoids the strict-mode collision.
   */
  get loadError(): UIElement {
    return this.driver.byRole('alert').byText('Failed to load waiver claims');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Navigate to a league's roster tab (where the pending-waivers panel renders)
   * and wait for the content region. Gate on the stable `main-content` region
   * rather than the panel itself — the panel is absent in the empty state — and
   * never on `networkidle` (ADR-0015 Context: the league chat/activity long-poll
   * defeats it).
   */
  async goto(leagueId: number): Promise<void> {
    await this.open(`/baseball/league/${leagueId}/roster`, 'main-content');
  }

  /** Cancel the pending claim for `playerName` (clicks its cancel button). */
  async cancelClaim(playerName: string): Promise<void> {
    await this.cancelButtonFor(playerName).tap();
  }
}
