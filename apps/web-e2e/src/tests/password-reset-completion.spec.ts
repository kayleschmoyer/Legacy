/**
 * Password-reset flow E2E tests (LS-8461).
 *
 * `forgot-password.spec.ts` only covers the "Forgot password?" link on the
 * login page. This suite covers the two pages the link leads to:
 *
 *   • `/forgot-password`         — email submission (success + API error)
 *   • `/reset-password?token=…`  — token completion (valid token → form →
 *                                  success/sign-in; invalid/expired token;
 *                                  password-validation errors)
 *
 * Hermetic throughout (`route.fulfill()` only, via `../mocks/password-reset`)
 * and run under the unauthenticated fixture — a user resetting a password is
 * signed out. Spec bodies speak page-object verbs only; the `/reset-password`
 * and `/forgot-password` page objects are driver-typed (ADR-0015/0016).
 */

import { unauthTest } from '../fixtures/pages';
import {
  mockForgotPasswordError,
  mockForgotPasswordSuccess,
  mockResetPasswordError,
  mockResetPasswordSuccess,
} from '../mocks/password-reset.mocks';

// A password that satisfies the 12-character minimum the reset form enforces.
const VALID_PASSWORD = 'sup3r-secret-passw0rd';

unauthTest.describe(
  'Forgot password submission — /forgot-password (LS-8461)',
  () => {
    unauthTest(
      'submitting an email shows the "check your inbox" confirmation (AC1)',
      async ({ page, forgotPasswordPage }) => {
        await mockForgotPasswordSuccess(page);

        await forgotPasswordPage.goto();
        await forgotPasswordPage.submitEmail('user@example.com');

        await forgotPasswordPage.expectSuccessMessage();
      },
    );

    unauthTest(
      'an API error surfaces the "something went wrong" state (AC2)',
      async ({ page, forgotPasswordPage }) => {
        await mockForgotPasswordError(page);

        await forgotPasswordPage.goto();
        await forgotPasswordPage.submitEmail('user@example.com');

        await forgotPasswordPage.expectErrorMessage();
      },
    );
  },
);

unauthTest.describe(
  'Password reset completion — /reset-password (LS-8461)',
  () => {
    unauthTest(
      'a valid token yields the new-password form, then success + a sign-in link to /login (AC3)',
      async ({ page, resetPasswordPage }) => {
        await mockResetPasswordSuccess(page);

        await resetPasswordPage.goto('valid-reset-token');
        await resetPasswordPage.expectFormVisible();
        await resetPasswordPage.submitNewPassword(
          VALID_PASSWORD,
          VALID_PASSWORD,
        );

        await resetPasswordPage.expectSuccessAndSignInLink();
      },
    );

    unauthTest(
      'an expired/invalid token surfaces the server error message (AC4)',
      async ({ page, resetPasswordPage }) => {
        await mockResetPasswordError(page, {
          status: 400,
          error: 'This reset link has expired.',
        });

        await resetPasswordPage.goto('expired-token');
        await resetPasswordPage.expectFormVisible();
        await resetPasswordPage.submitNewPassword(
          VALID_PASSWORD,
          VALID_PASSWORD,
        );

        await resetPasswordPage.expectError(/expired/i);
      },
    );

    unauthTest(
      'a missing token shows the invalid-link state with a recovery link (AC4)',
      async ({ resetPasswordPage }) => {
        await resetPasswordPage.goto();

        await resetPasswordPage.expectInvalidLinkState();
      },
    );

    unauthTest(
      'a too-short password is rejected before any request (AC5)',
      async ({ resetPasswordPage }) => {
        await resetPasswordPage.goto('valid-reset-token');
        await resetPasswordPage.expectFormVisible();
        await resetPasswordPage.submitNewPassword('short', 'short');

        await resetPasswordPage.expectError(
          /password must be at least 12 characters/i,
        );
      },
    );

    unauthTest(
      'mismatched passwords are rejected before any request (AC5)',
      async ({ resetPasswordPage }) => {
        await resetPasswordPage.goto('valid-reset-token');
        await resetPasswordPage.expectFormVisible();
        await resetPasswordPage.submitNewPassword(
          VALID_PASSWORD,
          `${VALID_PASSWORD}-different`,
        );

        await resetPasswordPage.expectError(/do not match/i);
      },
    );

    unauthTest(
      'a server error containing HTML is rendered as escaped text, not live markup (AC4, XSS-safe)',
      async ({ page, resetPasswordPage }) => {
        // A malicious/compromised backend could return HTML in the error body.
        // React renders the message as text, so the literal <script> string is
        // shown verbatim — asserting it is *visible as text* proves it was
        // escaped rather than parsed into live markup (a parsed <script> tag
        // would not be a visible text node).
        const xssPayload = "<script>alert('reset-xss')</script>";
        await mockResetPasswordError(page, { status: 400, error: xssPayload });

        await resetPasswordPage.goto('malicious-token');
        await resetPasswordPage.expectFormVisible();
        await resetPasswordPage.submitNewPassword(
          VALID_PASSWORD,
          VALID_PASSWORD,
        );

        await resetPasswordPage.expectError(xssPayload);
      },
    );
  },
);
