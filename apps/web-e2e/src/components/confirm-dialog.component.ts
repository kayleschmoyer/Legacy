import { expect, type Locator } from '@playwright/test';

import { BaseComponent } from '../base/base.component';

/**
 * Reusable component for the confirmation dialogs used across the app —
 * commissioner destructive actions, rename-team, start-new-season, advance-week,
 * draft-pick confirms, etc. (ADR-0015 §2). It is scoped to a root `Locator` —
 * the dialog region — so a page object composes it by passing whichever
 * container the route renders:
 *   • a role-based dialog   — `page.getByRole('alertdialog')`
 *   • a testid container    — `page.getByTestId('rename-team-confirm')`
 *
 * Today these locators are duplicated raw across specs
 * (`page.getByRole('alertdialog')`, `page.locator('div[role="alertdialog"] input')`,
 * `getByRole('button', { name: /confirm/i })`); this component owns the
 * interaction mechanism so a markup/role change is a one-object edit.
 *
 * Locators are private; the component exposes the three semantic surfaces:
 *   • actions — `confirm()` / `cancel()` / `fillInput(value)` / `confirmWith(value)`
 *   • reads   — `message()`
 *   • asserts — `expectOpen()` / `expectClosed()` / `expectMessage(text)`
 *
 * It carries no mocking or data setup — that stays in fixtures and route
 * handlers (ADR-0015 §6), and it gates on the dialog element, never on
 * `networkidle`.
 */
export class ConfirmDialog extends BaseComponent {
  readonly #confirmButton: Locator;
  readonly #cancelButton: Locator;
  readonly #input: Locator;

  constructor(root: Locator) {
    super(root);
    // Resolve the action buttons by accessible name within the dialog. The
    // confirm label varies by flow ("Confirm", "Confirm New Season",
    // "Confirm Pick", …) — all share the `confirm` stem.
    this.#confirmButton = root.getByRole('button', { name: /confirm/i });
    this.#cancelButton = root.getByRole('button', { name: /cancel/i });
    // Type-to-confirm dialogs (e.g. commissioner destructive actions) render a
    // text input the user must fill before confirming. Scope to the textbox
    // role so a non-text control in the dialog (checkbox, etc.) can't be picked
    // up by accident.
    this.#input = root.getByRole('textbox');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Click the confirm button. */
  async confirm(): Promise<void> {
    await this.#confirmButton.click();
  }

  /** Click the cancel button. */
  async cancel(): Promise<void> {
    await this.#cancelButton.click();
  }

  /**
   * Fill the dialog's confirmation input (type-to-confirm flows). Asserts the
   * value landed so the subsequent `confirm()` acts on the settled input.
   */
  async fillInput(value: string): Promise<void> {
    await this.#input.fill(value);
    await expect(this.#input).toHaveValue(value);
  }

  /** Fill the confirmation input then click confirm — the common combined flow. */
  async confirmWith(value: string): Promise<void> {
    await this.fillInput(value);
    await this.confirm();
  }

  // ── Reads ────────────────────────────────────────────────────────

  /** The dialog's visible text, as a plain string. */
  async message(): Promise<string> {
    return this.root.innerText();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the dialog is open (its root is visible). */
  async expectOpen(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: 15000 });
  }

  /** Assert the dialog is closed (its root is no longer visible). */
  async expectClosed(): Promise<void> {
    await expect(this.root).toBeHidden({ timeout: 15000 });
  }

  /** Assert the dialog contains `text` (auto-retries). */
  async expectMessage(text: string | RegExp): Promise<void> {
    await expect(this.root).toContainText(text, { timeout: 15000 });
  }
}
