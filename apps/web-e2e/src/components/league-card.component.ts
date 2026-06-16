import { expect, type Locator } from '@playwright/test';

import { BaseComponent } from '../base/base.component';

/**
 * Reusable component for a public-league discovery card (ADR-0015 §2).
 *
 * A discovery card carries the league's summary (name, draft status, player
 * pool, spots) plus the inline join affordance — a "Join League →" button that
 * expands a "Choose a team name" prompt, or a "View League →" button for
 * leagues the user has already joined. The card is keyed by a
 * `data-testid="league-card-<id>"` root, so a page object scopes one by id or
 * by displayed name and hands the root `Locator` here.
 *
 * Locators are private; the component exposes the three semantic surfaces:
 *   • actions — `clickJoin()`, `joinWithTeamName(name)`, `cancelJoin()`
 *   • reads   — `text(value)`, `button(name)` (root-scoped locator getters)
 *   • asserts — `expectVisible()`, `expectTeamNamePrompt()`,
 *               `expectAlreadyMember()`, `expectFull()`
 *
 * It carries no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6). The `[data-testid^="league-card-"]` filter/join logic
 * lived inline on LeaguePage before LS-8092; it moved here so a single edit
 * tracks the card's interaction mechanism.
 */
export class LeagueCard extends BaseComponent {
  readonly #joinButton: Locator;
  readonly #teamNameInput: Locator;
  readonly #teamNamePrompt: Locator;
  readonly #cancelButton: Locator;
  readonly #alreadyMemberBanner: Locator;

  constructor(root: Locator) {
    super(root);
    // The discovery card reuses the "Join League →" label for both the
    // collapsed affordance and the expanded inline-form submit, so callers
    // scope to `.first()` / `.last()` via the dedicated actions below.
    this.#joinButton = root.getByRole('button', { name: /Join League/i });
    this.#teamNameInput = root.getByPlaceholder('e.g. Shortstop Stars');
    this.#teamNamePrompt = root.getByText(/Choose a team name/i);
    this.#cancelButton = root.getByRole('button', { name: /Cancel/i });
    this.#alreadyMemberBanner = root.getByTestId('already-member-banner');
  }

  // ── Reads (root-scoped locator getters) ──────────────────────────

  /** A text node within this card (e.g. the league name, status, or spots). */
  text(value: string | RegExp, opts?: { exact?: boolean }): Locator {
    return this.root.getByText(value, opts);
  }

  /** A button within this card, by accessible name. */
  button(name: string | RegExp, opts?: { exact?: boolean }): Locator {
    return this.root.getByRole('button', { name, ...opts });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Click the card's "Join League →" affordance to expand the inline form. */
  async clickJoin(): Promise<void> {
    await this.#joinButton.first().click();
  }

  /** Expand the inline join form, enter a team name, and submit. */
  async joinWithTeamName(teamName: string): Promise<void> {
    await this.#teamNameInput.fill(teamName);
    // After the team name is filled the submit button is the inline-form one.
    await this.#joinButton.first().click();
  }

  /** Cancel the expanded inline join form. */
  async cancelJoin(): Promise<void> {
    await this.#cancelButton.click();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the card is mounted (its team-name prompt or join button shows). */
  async expectVisible(): Promise<void> {
    await expect(this.#joinButton.first()).toBeVisible({ timeout: 15000 });
  }

  /** Assert the "Choose a team name" prompt is showing (inline form open). */
  async expectTeamNamePrompt(): Promise<void> {
    await expect(this.#teamNamePrompt).toBeVisible({ timeout: 15000 });
    await expect(this.#teamNameInput).toBeVisible();
  }

  /** Assert the "Choose a team name" prompt is hidden (inline form closed). */
  async expectTeamNamePromptHidden(): Promise<void> {
    await expect(this.#teamNamePrompt).not.toBeVisible();
  }

  /** Assert the join submit button is disabled (e.g. empty team name). */
  async expectJoinDisabled(): Promise<void> {
    await expect(this.#joinButton.last()).toBeDisabled();
  }

  /** Assert the "you're already in this league" banner is showing. */
  async expectAlreadyMember(): Promise<void> {
    await expect(this.#alreadyMemberBanner).toBeVisible({ timeout: 15000 });
  }
}
