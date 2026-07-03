import type { UIElement } from '../driver';

/**
 * Reusable component for a public-league discovery card (ADR-0015 §2).
 *
 * A discovery card carries the league's summary (name, draft status, player
 * pool, spots) plus the inline join affordance — a "Join League →" button that
 * expands a "Choose a team name" prompt, or a "View League →" button for
 * leagues the user has already joined. The card is keyed by a
 * `data-testid="league-card-<id>"` root, so a page object scopes one by id or
 * by displayed name and hands the root element here.
 *
 * Migrated to the platform-neutral driver interface (ADR-0016) alongside its
 * composing `LeaguePage`: the root is a driver {@link UIElement} rather than
 * a Playwright `Locator`. Retry semantics are unchanged — the element's
 * `expect*` surface delegates to Playwright's web-first assertions on web.
 *
 * Locators are private; the component exposes the three semantic surfaces:
 *   • actions — `clickJoin()`, `joinWithTeamName(name)`, `cancelJoin()`
 *   • reads   — `text(value)`, `button(name)` (root-scoped element getters)
 *   • asserts — `expectVisible()`, `expectTeamNamePrompt()`,
 *               `expectAlreadyMember()`, `expectJoinDisabled()`
 *
 * It carries no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6). The `[data-testid^="league-card-"]` filter/join logic
 * lived inline on LeaguePage before LS-8092; it moved here so a single edit
 * tracks the card's interaction mechanism.
 */
export class LeagueCard {
  readonly #root: UIElement;
  readonly #joinButton: UIElement;
  readonly #teamNameInput: UIElement;
  readonly #teamNamePrompt: UIElement;
  readonly #cancelButton: UIElement;
  readonly #alreadyMemberBanner: UIElement;

  constructor(root: UIElement) {
    this.#root = root;
    // The discovery card reuses the "Join League →" label for both the
    // collapsed affordance and the expanded inline-form submit, so callers
    // scope to `.first()` / `.last()` via the dedicated actions below.
    this.#joinButton = root.byRole('button', { name: /Join League/i });
    this.#teamNameInput = root.byPlaceholder('e.g. Shortstop Stars');
    this.#teamNamePrompt = root.byText(/Choose a team name/i);
    this.#cancelButton = root.byRole('button', { name: /Cancel/i });
    this.#alreadyMemberBanner = root.byTestId('already-member-banner');
  }

  // ── Reads (root-scoped element getters) ──────────────────────────

  /** A text node within this card (e.g. the league name, status, or spots). */
  text(value: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.#root.byText(value, opts);
  }

  /** A button within this card, by accessible name. */
  button(name: string | RegExp, opts?: { exact?: boolean }): UIElement {
    return this.#root.byRole('button', { name, ...opts });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Click the card's "Join League →" affordance to expand the inline form. */
  async clickJoin(): Promise<void> {
    await this.#joinButton.first().tap();
  }

  /** Expand the inline join form, enter a team name, and submit. */
  async joinWithTeamName(teamName: string): Promise<void> {
    await this.#teamNameInput.fill(teamName);
    // After the team name is filled the submit button is the inline-form one.
    await this.#joinButton.first().tap();
  }

  /** Cancel the expanded inline join form. */
  async cancelJoin(): Promise<void> {
    await this.#cancelButton.tap();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the card is mounted (its team-name prompt or join button shows). */
  async expectVisible(): Promise<void> {
    await this.#joinButton.first().expectVisible({ timeout: 15000 });
  }

  /** Assert the "Choose a team name" prompt is showing (inline form open). */
  async expectTeamNamePrompt(): Promise<void> {
    await this.#teamNamePrompt.expectVisible({ timeout: 15000 });
    await this.#teamNameInput.expectVisible();
  }

  /** Assert the "Choose a team name" prompt is hidden (inline form closed). */
  async expectTeamNamePromptHidden(): Promise<void> {
    await this.#teamNamePrompt.expectHidden();
  }

  /** Assert the join submit button is disabled (e.g. empty team name). */
  async expectJoinDisabled(): Promise<void> {
    await this.#joinButton.last().expectDisabled();
  }

  /** Assert the "you're already in this league" banner is showing. */
  async expectAlreadyMember(): Promise<void> {
    await this.#alreadyMemberBanner.expectVisible({ timeout: 15000 });
  }
}
