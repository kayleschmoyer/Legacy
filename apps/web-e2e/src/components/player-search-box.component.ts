import type { UIElement } from '../driver';

/**
 * Reusable component for the debounced player search box used on the draft
 * board and the players-stats page (ADR-0015 §2). It is scoped to a root
 * {@link UIElement} — the container that holds the search input and its
 * result rows — so a page object composes it by passing the relevant region.
 *
 * Migrated to the platform-neutral driver interface (ADR-0016) alongside its
 * composing `DraftPage`: the root is a driver element rather than a Playwright
 * `Locator`, so the component drives web today and native once an Appium
 * driver lands. Retry semantics are unchanged — the driver's `expect*`
 * surface delegates to Playwright's web-first assertions on web.
 *
 * Locators are private; the component exposes the three semantic surfaces:
 *   • action  — `fill(term)` / `filterTo(term)` / `clear()`
 *   • reads   — `results()`, `resultCount()`
 *   • asserts — `expectVisible()`, `expectResult(name)`, `expectNoResults()`
 *
 * It carries no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6).
 */
export class PlayerSearchBox {
  readonly #input: UIElement;
  readonly #results: UIElement;

  constructor(root: UIElement) {
    // Matches both the draft pool search ("Search player…") and the
    // players-stats search ("Search players…").
    this.#input = root.byPlaceholder(/search.*player/i);
    this.#results = root.byTestIdPrefix('player-row-');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Type `term` into the search input and confirm it registered, WITHOUT
   * asserting any result rows. The deterministic signal is the input reflecting
   * the value; the consuming surface owns the "results filtered" assertion.
   *
   * Use this when the composing page renders results the component cannot see —
   * e.g. the draft board, whose filtered players are `PlayerCard`s (`role=group`)
   * rather than `player-row-*` rows (ADR-0015 §2; mirrors the old
   * DraftPage.searchPlayer fill-and-confirm behavior).
   */
  async fill(term: string): Promise<void> {
    await this.#input.fill(term);
    await this.#input.expectValue(term);
  }

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
    await this.fill(term);
    await this.#results.first().expectContainsText(term, { timeout: 15000 });
  }

  /** Clear the search input. */
  async clear(): Promise<void> {
    await this.#input.fill('');
    await this.#input.expectValue('');
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** The visible result-row texts, as plain strings. */
  async results(): Promise<string[]> {
    return this.#results.allTexts();
  }

  /** How many result rows are currently rendered. */
  async resultCount(): Promise<number> {
    return this.#results.count();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the search input is visible (the box is mounted). */
  async expectVisible(): Promise<void> {
    await this.#input.expectVisible({ timeout: 15000 });
  }

  /** Assert a result row matching `name` is present (auto-retries). */
  async expectResult(name: string): Promise<void> {
    await this.#results
      .filterByText(name)
      .first()
      .expectVisible({ timeout: 15000 });
  }

  /** Assert no result rows are rendered (e.g. a no-match search). */
  async expectNoResults(): Promise<void> {
    await this.#results.expectCount(0, { timeout: 15000 });
  }
}
