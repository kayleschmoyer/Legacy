import type { ElementScope, UIElement } from '../driver';

/**
 * Semantic component object for the step-up re-authentication challenge
 * (`StepUpModal`, LGN-022 / LS-7834) — the post-authentication challenge a user
 * hits before a sensitive action. For a 2FA-enrolled user the modal opens in
 * TOTP mode (a 6-digit authenticator code); for everyone else it falls back to a
 * password prompt. This object drives the TOTP path.
 *
 * Scoped to a root {@link ElementScope} rather than a `UIElement`: the modal is a
 * fixed full-page overlay with no stable container test id, so it is scoped to
 * the page (an {@link import('../driver').AppDriver} is itself an `ElementScope`).
 * Both a page-level scope (pass the driver) and a region scope (pass a driver
 * element) satisfy the contract.
 *
 * The challenge is a shared-components auth surface driven here through the web
 * app; the verbs are the reusable piece when native auth-challenge surfaces get
 * covered (ADR-0016). Locators are private; the component exposes:
 *   • actions — `enterCode` / `submit`
 *   • asserts — `expectPrompt` / `expectError` / `expectDismissed`
 *
 * It carries no mocking — the `/step-up/verify` REST stub stays in the spec
 * (ADR-0015 §6; web-hermetic-specific, ADR-0016 §4).
 */
export class StepUpChallenge {
  readonly #root: ElementScope;
  readonly #heading: UIElement;
  readonly #codeInput: UIElement;
  readonly #verifyButton: UIElement;

  constructor(root: ElementScope) {
    this.#root = root;
    this.#heading = root.byText('Confirm your identity');
    this.#codeInput = root.byPlaceholder('6-digit code');
    // The submit button reads "Verify" (and "Verifying…" while in flight);
    // `exact` keeps it from matching the loading label.
    this.#verifyButton = root.byRole('button', { name: 'Verify', exact: true });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Type the authenticator code into the challenge input. */
  async enterCode(code: string): Promise<void> {
    await this.#codeInput.fill(code);
  }

  /** Submit the challenge ("Verify"). */
  async submit(): Promise<void> {
    await this.#verifyButton.tap();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the TOTP challenge is prompting (title + code input visible). */
  async expectPrompt(): Promise<void> {
    await this.#heading.expectVisible({ timeout: 10000 });
    await this.#codeInput.expectVisible();
  }

  /** Assert the challenge surfaced `message` (e.g. a rejected code). */
  async expectError(message: string | RegExp): Promise<void> {
    await this.#root.byText(message).expectVisible({ timeout: 10000 });
  }

  /** Assert the challenge closed (verification succeeded or was dismissed). */
  async expectDismissed(): Promise<void> {
    await this.#heading.expectHidden({ timeout: 10000 });
  }
}
