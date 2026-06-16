import { expect, type Locator } from '@playwright/test';

import { BaseComponent } from '../base/base.component';

/**
 * Reusable component for the transient toast notifications used across the app —
 * "scoring saved", "undo remove", Apollo error toasts, etc. (ADR-0015 §2). It is
 * scoped to a root `Locator` — the toast element — so a page object composes it
 * by passing whichever container the route renders:
 *   • a testid toast   — `page.getByTestId('scoring-saved-toast')`
 *   • a role-based one  — `page.getByRole('alert')` / `page.getByRole('status')`
 *
 * Today these locators are duplicated raw across specs
 * (`getByTestId('scoring-saved-toast')`, `getByTestId('undo-remove-toast')`,
 * `role="alert"`); this component owns the mechanism so a markup/testid change
 * is a one-object edit.
 *
 * Locators are private; the component exposes the three semantic surfaces:
 *   • action  — `dismiss()`
 *   • reads   — `message()`
 *   • asserts — `expectVisible()` / `expectMessage(text)` / `expectDismissed()`
 *
 * It carries no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6), and it gates on the toast element, never on
 * `networkidle`.
 */
export class Toast extends BaseComponent {
  readonly #dismissButton: Locator;

  constructor(root: Locator) {
    super(root);
    // Toasts that are user-dismissable render a close/dismiss control; resolved
    // within the toast so it never collides with page-level close buttons.
    this.#dismissButton = root.getByRole('button', {
      name: /dismiss|close/i,
    });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Click the toast's dismiss/close control. */
  async dismiss(): Promise<void> {
    await this.#dismissButton.click();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** The toast's visible text, as a plain string. */
  async message(): Promise<string> {
    return this.root.innerText();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the toast is visible (it has appeared). */
  async expectVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: 15000 });
  }

  /** Assert the toast contains `text` (auto-retries). */
  async expectMessage(text: string | RegExp): Promise<void> {
    await expect(this.root).toContainText(text, { timeout: 15000 });
  }

  /**
   * Assert the toast is gone — either auto-dismissed after its timeout or after
   * an explicit `dismiss()`. Mirrors the spec pattern of waiting for the toast
   * locator to reach `toHaveCount(0)` / `toBeHidden`.
   */
  async expectDismissed(): Promise<void> {
    await expect(this.root).toBeHidden({ timeout: 15000 });
  }
}
