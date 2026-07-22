import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the League Trades tab (/baseball/league/:id/trades).
 *
 * Covers the three surfaces the shared `TradingCenter` renders for a league
 * member (ADR-0015 §1):
 *   • the Trades tab overview — Incoming / Outgoing offers, Trade History, and
 *     the per-offer Accept / Reject / Cancel actions;
 *   • the multi-step "Propose Trade" dialog (Team → Your Players → Their
 *     Players → Confirm → Send);
 *   • the Trade Block — the "AVAILABLE" list, the count badge, per-player
 *     Set Price / Edit Price / Remove controls, and its empty / error states.
 *
 * Migrated to the platform-neutral driver interface (ADR-0016): it extends
 * {@link BaseScreen}, holds an {@link AppDriver}, and every read getter returns
 * a {@link UIElement}. Locators stay PRIVATE (built inline in getters/verbs via
 * `this.driver.byX(...)`) and the only public API is the three semantic surfaces
 * — actions (verbs), reads (element getters specs assert against), and retrying
 * assertions. Specs call these and never touch a selector, so a UI-mechanism
 * change is a one-object edit. The object carries no mocking, identity, or seed
 * data — that stays in the specs (ADR-0015 §6), so the same object drives the
 * hermetic and (future) integration suites.
 *
 * ── Web-only remainder (AC3 / LS-8448) ──────────────────────────────────────
 * The real-time trade-refresh flow is driven by a WebSocket: the web
 * `TradingCenter` wrapper subscribes to `LeagueWebSocket` and refetches
 * `GetTeamTradeOffers` when a `TRADE_OFFER` notification arrives (BLD-033 /
 * LS-5966). The specs exercise this with Playwright's `page.routeWebSocket()` +
 * `injectWebSocketUrl` — an in-process web-only mechanism. It CANNOT be
 * expressed portably on native until the per-worker mock server speaks WS
 * (LS-8448), so this page object deliberately owns NO WebSocket verb: the
 * WS setup, event injection, and refetch assertion stay in the web spec. When
 * LS-8448 lands and the native platform/driver fixture (LS-8449) is merged, a
 * capability-gated `expectRealtimeRefresh`-style verb can move here. Until then
 * the flow is documented here (not silently dropped) and the spec keeps its
 * `page.routeWebSocket` block; navigation and the pre/post reads still go
 * through this object's verbs. Per AC3 there is intentionally NO runtime
 * `test.skip` gate — no injected native `driver` exists yet to gate on.
 */
export class TradesPage extends BaseScreen {
  // No own fields to initialise — TradesPage inherits BaseScreen's
  // `constructor(driver: AppDriver)`, matching LeaguePage (locators are built
  // lazily in getters/verbs, so nothing is captured in the constructor).

  // ── Reads: propose-trade dialog ──────────────────────────────────

  /** The "Propose Trade" button in the Trading Center header (opens the dialog). */
  get proposeTradeButton(): UIElement {
    return this.driver.byRole('button', { name: /propose trade/i }).first();
  }

  /** The multi-step "Propose Trade" dialog. */
  get proposeTradeDialog(): UIElement {
    return this.driver.byRole('dialog', { name: /propose trade/i });
  }

  /** The "Next — Select Their Players" button (offer step → request step). */
  get nextSelectTheirPlayersButton(): UIElement {
    return this.driver.byRole('button', {
      name: /next.*select their players/i,
    });
  }

  /** The "Review Trade" button (request step → confirm step). */
  get reviewTradeButton(): UIElement {
    return this.driver.byRole('button', { name: /review trade/i });
  }

  /** The "Send Trade Offer" button (confirm step). */
  get sendTradeOfferButton(): UIElement {
    return this.driver.byRole('button', { name: /send trade offer/i });
  }

  // ── Reads: per-offer trade-card actions ──────────────────────────

  /** The "Accept" action on an incoming pending offer. */
  get acceptButton(): UIElement {
    return this.driver.byRole('button', { name: 'Accept' });
  }

  /** The "Reject" action on an incoming pending offer. */
  get rejectButton(): UIElement {
    return this.driver.byRole('button', { name: 'Reject' });
  }

  /** The "Withdraw" action (never shown to the receiving team). */
  get withdrawButton(): UIElement {
    return this.driver.byRole('button', { name: 'Withdraw' });
  }

  /** The "Cancel" action on an outgoing pending offer. */
  get cancelButton(): UIElement {
    return this.driver.byRole('button', { name: 'Cancel' });
  }

  // ── Reads: trade-block controls ──────────────────────────────────

  /** The "Remove" action on an own-team trade-block player. */
  get removeButton(): UIElement {
    return this.driver.byRole('button', { name: 'Remove' });
  }

  /** The "Set Price" action (own player with no asking price). */
  get setPriceButton(): UIElement {
    return this.driver.byRole('button', { name: 'Set Price' });
  }

  /** The "Edit Price" action (own player with an asking price already set). */
  get editPriceButton(): UIElement {
    return this.driver.byRole('button', { name: 'Edit Price' });
  }

  /** The "Save" action in the Set/Edit Price inline editor. */
  get savePriceButton(): UIElement {
    return this.driver.byRole('button', { name: 'Save' });
  }

  /** The asking-price text input in the Set/Edit Price inline editor. */
  get priceInput(): UIElement {
    return this.driver.byRole('textbox');
  }

  /** The "Show more" toggle (trade block with more than 5 players). */
  get showMoreButton(): UIElement {
    return this.driver.byRole('button', { name: /show.*more/i });
  }

  // ── Actions: navigation ──────────────────────────────────────────

  /**
   * Navigate to a league's Trades tab and wait for the Trading Center to
   * render. Gate on the header "Propose Trade" button — it is present for every
   * member regardless of trade/offer/team state (`networkidle` is defeated by
   * the league chat long-poll and the trades WebSocket; ADR-0015 Context).
   */
  async gotoTrades(leagueId: number): Promise<void> {
    await this.driver.open(`/baseball/league/${leagueId}/trades`);
    await this.proposeTradeButton.expectVisible({ timeout: 15000 });
  }

  // ── Actions: trade history ───────────────────────────────────────

  /**
   * Expand the collapsible "Trade History" section (fires the
   * GetLeagueTradeOffers query for completed trades).
   */
  async openTradeHistory(): Promise<void> {
    await this.driver.byRole('button', { name: /Trade History/ }).tap();
  }

  // ── Actions: propose-trade flow ──────────────────────────────────

  /** Open the "Propose Trade" dialog and wait for it to render. */
  async openProposeTradeDialog(): Promise<void> {
    await this.proposeTradeButton.tap();
    await this.proposeTradeDialog.expectVisible({ timeout: 10000 });
  }

  /** Pick the team to trade with in the dialog's team-selection step. */
  async selectTradeTeam(name: string | RegExp): Promise<void> {
    await this.driver.byText(name, { exact: false }).first().tap();
  }

  /** Select one of your roster players to offer (offer step). */
  async selectOfferPlayer(name: string): Promise<void> {
    await this.driver.byText(name).first().tap();
  }

  /** Advance from the offer step to the request step. */
  async goToRequestStep(): Promise<void> {
    await this.nextSelectTheirPlayersButton.tap();
  }

  /** Select one of the target team's players to request (request step). */
  async selectRequestPlayer(name: string): Promise<void> {
    await this.driver.byText(name).first().tap();
  }

  /** Advance from the request step to the confirm step. */
  async reviewTrade(): Promise<void> {
    await this.reviewTradeButton.tap();
  }

  /** Submit the trade from the confirm step. */
  async sendTradeOffer(): Promise<void> {
    await this.sendTradeOfferButton.tap();
  }

  /**
   * Click through the full four-step Propose Trade flow:
   * Team → offer player → Their Players → request player → Review → Send.
   * Assumes the page is on the Trades tab with the dialog not yet open;
   * gates on each step's readiness copy before acting.
   */
  async proposeTrade(opts: {
    team: string | RegExp;
    offerPlayer: string;
    requestPlayer: string;
  }): Promise<void> {
    await this.openProposeTradeDialog();

    await this.expectTeamSelectionStep();
    await this.selectTradeTeam(opts.team);

    await this.expectOfferStep();
    await this.selectOfferPlayer(opts.offerPlayer);
    await this.goToRequestStep();

    await this.expectRequestStep();
    await this.selectRequestPlayer(opts.requestPlayer);
    await this.reviewTrade();

    await this.sendTradeOfferButton.expectVisible({ timeout: 10000 });
    await this.sendTradeOffer();
  }

  // ── Actions: trade block ─────────────────────────────────────────

  /** Open the inline asking-price editor for an own-team player. */
  async startSetPrice(): Promise<void> {
    await this.setPriceButton.tap();
  }

  /** Type an asking price into the inline editor. */
  async fillAskingPrice(price: string): Promise<void> {
    await this.priceInput.fill(price);
  }

  /** Confirm the asking price in the inline editor. */
  async saveAskingPrice(): Promise<void> {
    await this.savePriceButton.tap();
  }

  /** Full Set-Price flow: open the editor, type `price`, and save. */
  async setAskingPrice(price: string): Promise<void> {
    await this.startSetPrice();
    await this.fillAskingPrice(price);
    await this.saveAskingPrice();
  }

  /** Remove an own-team player from the trade block. */
  async removeFromTradeBlock(): Promise<void> {
    await this.removeButton.tap();
  }

  /** Expand the trade-block list beyond the first 5 players. */
  async showMoreTradeBlock(): Promise<void> {
    await this.showMoreButton.tap();
  }

  // ── Assertions: page-level ───────────────────────────────────────

  /** Assert the tab did not crash into the global error boundary. */
  async expectNoAppError(): Promise<void> {
    await this.driver.byText('Unexpected Application Error').expectCount(0);
  }

  /** Assert an error alert / message matching `pattern` is surfaced. */
  async expectErrorMessage(pattern: string | RegExp): Promise<void> {
    await this.driver.byText(pattern).first().expectVisible({ timeout: 10000 });
  }

  // ── Assertions: sections & empty states ──────────────────────────

  /** Assert the "Incoming Offers" section heading is visible. */
  async expectIncomingOffersSection(): Promise<void> {
    await this.driver
      .byText('Incoming Offers', { exact: true })
      .expectVisible();
  }

  /** Assert the "Trade History" section label is visible. */
  async expectTradeHistorySection(): Promise<void> {
    await this.driver.byText('Trade History', { exact: true }).expectVisible();
  }

  /** Assert the empty "no incoming offers" message is shown. */
  async expectNoIncomingOffers(): Promise<void> {
    await this.driver.byText('No incoming trade offers').expectVisible();
  }

  /** Assert the empty "no trade history" message is shown. */
  async expectNoTradeHistory(): Promise<void> {
    await this.driver.byText('No trade history yet.').expectVisible();
  }

  /** Assert the "Trade Block" section heading is visible. */
  async expectTradeBlockHeading(): Promise<void> {
    await this.driver.byText('Trade Block', { exact: true }).expectVisible();
  }

  /** Assert the empty "no players on the trade block" message is shown. */
  async expectTradeBlockEmpty(): Promise<void> {
    await this.driver.byText('No players on the trade block').expectVisible();
  }

  /** Assert the trade-block empty-state helper copy is shown. */
  async expectTradeBlockEmptyHelp(): Promise<void> {
    await this.driver
      .byText('Use the roster page to list players for trade.')
      .expectVisible();
  }

  /** Assert the trade-block query-failure error state is shown. */
  async expectTradeBlockError(): Promise<void> {
    await this.driver.byText('Failed to load trade block.').expectVisible();
  }

  // ── Assertions: propose-trade dialog steps ───────────────────────

  /** Assert the dialog's team-selection step is showing. */
  async expectTeamSelectionStep(): Promise<void> {
    await this.driver
      .byText(/select the team you want to trade with/i)
      .expectVisible({ timeout: 10000 });
  }

  /** Assert the dialog's offer ("you will give") step is showing. */
  async expectOfferStep(): Promise<void> {
    await this.driver
      .byText(/you will give/i)
      .first()
      .expectVisible({ timeout: 10000 });
  }

  /** Assert the dialog's request ("give you") step is showing. */
  async expectRequestStep(): Promise<void> {
    await this.driver
      .byText(/give you/i)
      .first()
      .expectVisible({ timeout: 10000 });
  }

  /** Assert the "Propose Trade" dialog is closed. */
  async expectProposeDialogClosed(): Promise<void> {
    await this.proposeTradeDialog.expectHidden({ timeout: 15000 });
  }

  // ── Assertions: trade cards & players ────────────────────────────

  /** Assert an incoming offer card labelled "From: <team>" is visible. */
  async expectIncomingFrom(team: string): Promise<void> {
    await this.driver.byText(`From: ${team}`).expectVisible();
  }

  /** Assert an outgoing offer card labelled "To: <team>" is visible. */
  async expectOutgoingTo(team: string): Promise<void> {
    await this.driver
      .byText(`To: ${team}`, { exact: false })
      .expectVisible({ timeout: 10000 });
  }

  /** Assert a player name is visible (roster list, trade card, or block). */
  async expectPlayerVisible(name: string): Promise<void> {
    await this.driver.byText(name).first().expectVisible({ timeout: 10000 });
  }

  /** Assert a player name is not visible (e.g. hidden behind "Show more"). */
  async expectPlayerHidden(name: string): Promise<void> {
    await this.driver.byText(name).first().expectHidden();
  }

  /** Assert a team is listed in the dialog's team-selection step. */
  async expectTeamListed(name: string): Promise<void> {
    await this.driver
      .byText(name, { exact: false })
      .first()
      .expectVisible({ timeout: 10000 });
  }

  // ── Assertions: trade-block details ──────────────────────────────

  /** Assert the "AVAILABLE" badge is visible on a trade-block player. */
  async expectAvailableBadge(): Promise<void> {
    await this.driver.byText('AVAILABLE').first().expectVisible();
  }

  /** Assert the trade-block count badge reads "<n> available". */
  async expectAvailableCount(count: number): Promise<void> {
    await this.driver.byText(`${count} available`).expectVisible();
  }

  /** Assert an "Asking: <price>" label is visible on a trade-block player. */
  async expectAskingPrice(price: string): Promise<void> {
    await this.driver.byText(`Asking: ${price}`).expectVisible();
  }
}
