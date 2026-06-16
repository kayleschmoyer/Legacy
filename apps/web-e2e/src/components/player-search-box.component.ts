import { expect, type Locator } from '@playwright/test';

import { BaseComponent } from '../base/base.component';

/**
 * Reusable component for the debounced player search box used on the draft
 * board and the players-stats page (ADR-0015 §2). It is scoped to a root
 * `Locator` — the container that holds the search input and its result rows —
 * so a page object composes it by passing the relevant region.
 *
 * Locators are private; the component exposes the three semantic surfaces:
 *   • action  — `filterTo(term)` / `clear()`
 *   • reads   — `results()`, `resultCount()`
 *   • asserts — `expectVisible()`, `expectResult(name)`, `expectNoResults()`
 *
 * It carries no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6).
 */
export class PlayerSearchBox extends BaseComponent {
  readonly #input: Locator;
  readonly #results: Locator;

  constructor(root: Locator) {
    super(root);
    // Matches both the draft pool search ("Search player…") and the
    // players-stats search ("Search players…").
    this.#input = root.getByPlaceholder(/search.*player/i);
    this.#results = root.locator('[data-testid^="player-row-"]');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Type `term` into the search input and wait for the debounced filter to
   * flush. The search is debounced (~350ms) and filters client-side without a
   * network request, so the deterministic "flushed" signal is the first result
   * row reflecting the term — asserting it auto-retries until the debounce
   * settles (ADR-0015 §1; mirrors DraftPage.searchPlayer).
   *
   * Pass `term` as it appears in the rendered rows (substring, case-sensitive).
   * For the no-match case, fill via the spec's own flow and use
   * `expectNoResults()` instead — `filterTo` expects at least one match.
   */
  async filterTo(term: string): Promise<void> {
    await this.#input.fill(term);
    await expect(this.#input).toHaveValue(term);
    await expect(this.#results.first()).toContainText(term, { timeout: 15000 });
  }

  /** Clear the search input. */
  async clear(): Promise<void> {
    await this.#input.fill('');
    await expect(this.#input).toHaveValue('');
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** The visible result-row texts, as plain strings. */
  async results(): Promise<string[]> {
    return this.#results.allInnerTexts();
  }

  /** How many result rows are currently rendered. */
  async resultCount(): Promise<number> {
    return this.#results.count();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the search input is visible (the box is mounted). */
  async expectVisible(): Promise<void> {
    await expect(this.#input).toBeVisible({ timeout: 15000 });
  }

  /** Assert a result row matching `name` is present (auto-retries). */
  async expectResult(name: string): Promise<void> {
    await expect(this.#results.filter({ hasText: name }).first()).toBeVisible({
      timeout: 15000,
    });
  }

  /** Assert no result rows are rendered (e.g. a no-match search). */
  async expectNoResults(): Promise<void> {
    await expect(this.#results).toHaveCount(0, { timeout: 15000 });
  }
}
