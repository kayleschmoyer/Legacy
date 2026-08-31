import type { UIElement } from '../driver';

/**
 * Semantic component object for the profile "Two-Factor Authentication" section
 * (ADR-0015 §2 / ADR-0016). Scoped to a root {@link UIElement} — the
 * `profile-2fa-section` card on `/profile/settings` — so a screen composes it by
 * passing that region.
 *
 * The 2FA UI is the shared `TwoFactorSection` component (rendered on web through
 * the profile page); driving it through the platform-neutral driver keeps the
 * verbs reusable when native auth surfaces get covered (ADR-0016 native
 * blueprint). Buttons are located by ACCESSIBLE ROLE + NAME, not testID: they
 * are Tamagui `styled()` nodes that forward `role`/`aria-label` but drop
 * `testID`/`data-testid` (LS-8275-class Tamagui behavior), so role+name is the
 * portable, reliable locator. The plain `2fa-*` region ids ARE real
 * `data-testid`s and are used directly.
 *
 * Locators are private; the component exposes the two semantic surfaces it needs:
 *   • actions — `startEnrollment` / `enterCode` / `verify` / `cancelEnrollment` /
 *               `disable`
 *   • asserts — `expectDisabledState` / `expectEnabledState` / `expectEnrollFlow` /
 *               `expectSecretShown` / `expectError`
 *
 * It carries no mocking or data setup — the `/mfa/*` REST stubs stay in the spec
 * (ADR-0015 §6; those endpoints are web-hermetic-specific, ADR-0016 §4).
 */
export class TwoFactorSection {
  readonly #enableButton: UIElement;
  readonly #disableButton: UIElement;
  readonly #verifyButton: UIElement;
  readonly #cancelButton: UIElement;
  readonly #enrollFlow: UIElement;
  readonly #codeInput: UIElement;
  readonly #error: UIElement;

  constructor(root: UIElement) {
    this.#enableButton = root.byRole('button', { name: /enable 2fa/i });
    this.#disableButton = root.byRole('button', { name: /disable 2fa/i });
    // Visible label is "Verify & Enable"; aria-label is "Verify and Enable 2FA".
    this.#verifyButton = root.byRole('button', { name: /verify/i });
    this.#cancelButton = root.byRole('button', {
      name: /cancel 2fa enrollment/i,
    });
    this.#enrollFlow = root.byTestId('2fa-enroll-flow');
    this.#codeInput = root.byTestId('2fa-code-input');
    // The enroll error and the status error both render on an ARIA alert; only
    // one is mounted at a time.
    this.#error = root.byRole('alert');
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Click "Enable 2FA" and wait for the enrollment flow to render. */
  async startEnrollment(): Promise<void> {
    await this.#enableButton.tap();
    await this.#enrollFlow.expectVisible({ timeout: 10000 });
  }

  /** Type a confirmation code into the 6-digit authenticator input. */
  async enterCode(code: string): Promise<void> {
    await this.#codeInput.fill(code);
  }

  /** Submit the confirmation code ("Verify & Enable"). */
  async verify(): Promise<void> {
    await this.#verifyButton.tap();
  }

  /** Abandon the in-progress enrollment. */
  async cancelEnrollment(): Promise<void> {
    await this.#cancelButton.tap();
  }

  /**
   * Click "Disable 2FA". The `window.confirm()` dialog it raises is a web-only
   * surface outside the driver vocabulary — the spec MUST register a dialog
   * handler (`page.once('dialog', (d) => d.accept())`) BEFORE calling this.
   */
  async disable(): Promise<void> {
    await this.#disableButton.tap();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert 2FA is off — the "Enable 2FA" button is shown. */
  async expectDisabledState(): Promise<void> {
    await this.#enableButton.expectVisible({ timeout: 10000 });
  }

  /** Assert 2FA is on — the "Disable 2FA" button is shown. */
  async expectEnabledState(): Promise<void> {
    await this.#disableButton.expectVisible({ timeout: 10000 });
  }

  /** Assert the enrollment flow (QR/secret + code input) is rendered. */
  async expectEnrollFlow(): Promise<void> {
    await this.#enrollFlow.expectVisible({ timeout: 10000 });
    await this.#codeInput.expectVisible();
  }

  /** Assert the mocked enrollment secret is displayed (grouped 4-char form). */
  async expectSecretShown(text: string): Promise<void> {
    await this.#enrollFlow.expectContainsText(text, { timeout: 10000 });
  }

  /** Assert an error alert with `message` is surfaced (e.g. a wrong code). */
  async expectError(message: string | RegExp): Promise<void> {
    await this.#error.expectVisible({ timeout: 5000 });
    await this.#error.expectContainsText(message);
  }
}
