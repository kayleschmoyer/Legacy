import type { AppDriver, UIElement } from '../driver';
import { BaseScreen } from '../base/base.screen';

/**
 * Page object for the web reset-password completion page
 * (`/reset-password?token=…`, LS-8461).
 *
 * ADR-0016 driver-migrated screen: written against the platform-neutral
 * {@link AppDriver}, so it holds no Playwright `Page`/`Locator`. The page ships
 * no `data-testid`s, so every element is resolved through the portable
 * role/label/text vocabulary — there is no web-only surface here. The
 * success-state "redirect to login" is asserted through the sign-in link's
 * `href` (portable attribute read) rather than a web-only URL assertion.
 *
 * Carries no mocking or data setup (ADR-0015 §6): the hermetic `route.fulfill`
 * handlers for the `POST /reset-password` request live in the spec's mock
 * helper (`../mocks/password-reset.mocks`), never in this object.
 */
export class ResetPasswordPage extends BaseScreen {
  // ── Private elements ─────────────────────────────────────────────
  readonly #heading: UIElement;
  readonly #invalidLinkHeading: UIElement;
  readonly #requestNewLink: UIElement;
  readonly #passwordInput: UIElement;
  readonly #confirmInput: UIElement;
  readonly #submitButton: UIElement;
  readonly #successMessage: UIElement;
  readonly #signInLink: UIElement;

  constructor(driver: AppDriver) {
    super(driver);

    this.#heading = driver.byRole('heading', {
      name: /choose a new password/i,
    });
    this.#invalidLinkHeading = driver.byRole('heading', {
      name: /invalid link/i,
    });
    this.#requestNewLink = driver.byRole('link', {
      name: /request a new one/i,
    });
    // "New password" and "Confirm new password" both contain "new password";
    // exact labels keep the two inputs distinct.
    this.#passwordInput = driver.byLabel('New password', { exact: true });
    this.#confirmInput = driver.byLabel('Confirm new password', {
      exact: true,
    });
    this.#submitButton = driver.byRole('button', { name: /update password/i });
    this.#successMessage = driver.byText(/your password has been updated/i);
    // Scoped to the page body: signed-out visitors also get the header's own
    // "Sign in" link (LS-10767), which goes to / rather than /login.
    this.#signInLink = driver
      .byTestId('main-content')
      .byRole('link', { name: /sign in/i });
  }

  // ── Actions ──────────────────────────────────────────────────────

  /**
   * Navigate to the reset page. Pass a `token` to exercise the completion form;
   * omit it to exercise the missing-token "invalid link" state.
   */
  async goto(token?: string): Promise<void> {
    const path = token
      ? `/reset-password?token=${encodeURIComponent(token)}`
      : '/reset-password';
    await this.open(path);
  }

  /** Fill both password fields and submit the new password. */
  async submitNewPassword(password: string, confirm: string): Promise<void> {
    await this.#passwordInput.fill(password);
    await this.#confirmInput.fill(confirm);
    await this.#submitButton.tap();
  }

  // ── Assertions ───────────────────────────────────────────────────

  /** Assert the new-password form (with a valid token) has rendered. */
  async expectFormVisible(): Promise<void> {
    await this.#heading.expectVisible({ timeout: 30000 });
    await this.#passwordInput.expectVisible();
  }

  /**
   * Assert the success state: the confirmation copy plus a "Sign in" link that
   * routes back to `/login` (the AC's "redirect to login").
   */
  async expectSuccessAndSignInLink(): Promise<void> {
    await this.#successMessage.expectVisible({ timeout: 10000 });
    await this.#signInLink.expectVisible();
    await this.#signInLink.expectAttribute('href', /\/login$/);
  }

  /** Assert the missing-token "invalid link" state with a recovery link. */
  async expectInvalidLinkState(): Promise<void> {
    await this.#invalidLinkHeading.expectVisible({ timeout: 30000 });
    await this.#requestNewLink.expectVisible();
  }

  /**
   * Assert a surfaced error message — server-rejected token (e.g. expired) or a
   * client-side password-validation failure. Both render in the same inline
   * error paragraph, so callers match on the message text.
   */
  async expectError(text: string | RegExp): Promise<void> {
    await this.driver.byText(text).expectVisible({ timeout: 10000 });
  }
}
