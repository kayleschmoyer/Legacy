import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the web forgot-password page (`/forgot-password`, LS-8461).
 *
 * ADR-0016 driver-migrated screen: written against the platform-neutral
 * {@link AppDriver}, so it holds no Playwright `Page`/`Locator`. The page ships
 * no `data-testid`s, so every element is resolved through the portable
 * role/label/text vocabulary — there is no web-only surface here.
 *
 * Carries no mocking or data setup (ADR-0015 §6): the hermetic `route.fulfill`
 * handlers for the `POST /forgot-password` request live in the spec's mock
 * helper (`../mocks/password-reset.mocks`), never in this object.
 */
export class ForgotPasswordPage extends BaseScreen {
  // ── Private elements ─────────────────────────────────────────────
  readonly #heading: UIElement;
  readonly #emailInput: UIElement;
  readonly #submitButton: UIElement;
  readonly #successMessage: UIElement;
  readonly #errorMessage: UIElement;

  constructor(driver: AppDriver) {
    super(driver);

    this.#heading = driver.byRole('heading', {
      name: /forgot your password/i,
    });
    this.#emailInput = driver.byLabel('Email address');
    this.#submitButton = driver.byRole('button', { name: /send reset link/i });
    // The confirmation copy is "…you'll receive a password reset link
    // shortly." — match the stable fragment, apostrophe-independent.
    this.#successMessage = driver.byText(/receive a password reset link/i);
    this.#errorMessage = driver.byText(/something went wrong/i);
  }

  // ── Actions ──────────────────────────────────────────────────────

  /** Navigate to `/forgot-password` and wait for the form to render. */
  async goto(): Promise<void> {
    await this.open('/forgot-password');
    await this.#heading.expectVisible({ timeout: 30000 });
  }

  /** Enter an email and submit the reset-link request. */
  async submitEmail(email: string): Promise<void> {
    await this.#emailInput.fill(email);
    await this.#submitButton.tap();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the "check your inbox" success confirmation is shown. */
  async expectSuccessMessage(): Promise<void> {
    await this.#successMessage.expectVisible({ timeout: 10000 });
  }

  /** Assert the generic "something went wrong" API-error state is shown. */
  async expectErrorMessage(): Promise<void> {
    await this.#errorMessage.expectVisible({ timeout: 10000 });
  }
}
