# Feature: Forgot Password Flow

**Jira:** LS-5521
**Page:** `login` (Epic LS-5280)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Entry point to the password reset / recovery flow from the login page.
When the email/password form is visible, a "Forgot password?" link appears
below the password field. Tapping it opens the oauth-proxy's self-contained
password-reset request page (`GET /oauth/forgot-password`), where the user
enters their email and receives a single-use reset link.

## Flow

1. User navigates to the login page.
2. Email/password form is visible (web and mobile-web; not shown on the
   native app OAuth-only screen).
3. User taps "Forgot password?" (right-aligned, below the password field).
4. A new browser tab opens at `<oauthProxyUrl>/forgot-password` (the
   lambda-served HTML form).
5. User enters their registered email and submits the form.
6. A reset email is sent (if the address matches a local-auth account);
   the page shows the uniform "If an account exists for that email, a reset
   link is on its way" message regardless (no account enumeration).
7. User clicks the reset link in the email → `GET /oauth/reset-password?token=...`
8. User enters and confirms a new password → `POST /oauth/reset-password`
9. On success the token is consumed (single-use) and the user may log in
   with the new password.

## Platforms

### web / mobile-web

- "Forgot password?" link is shown in the shared `LoginPage` component
  (`lib/shared-components/src/features/auth/LoginPage.tsx`) when both
  `onEmailPasswordSignIn` and `onForgotPassword` props are provided.
- Web wiring: `apps/web/src/pages/login/LoginPage.tsx` passes
  `onForgotPassword` that calls `window.open(<oauthProxyUrl>/forgot-password,
'_blank', 'noopener,noreferrer')`.
- Link is hidden when `oauthProxyUrl` is not configured.

### android (native app)

- The native app login screen is OAuth-only (Google, Discord, Apple); no
  email/password form is shown, so the "Forgot password?" link is not
  rendered.
- Related open issue: LS-7574 — reset email link does not deep-link back
  into the native app after password reset.

## Backend

All reset infrastructure was pre-built before this story:

| Endpoint                 | Method | Handler                      |
| ------------------------ | ------ | ---------------------------- |
| `/oauth/forgot-password` | GET    | `handleForgotPasswordPage()` |
| `/oauth/forgot-password` | POST   | `handleForgotPassword()`     |
| `/oauth/reset-password`  | GET    | `handleResetPasswordPage()`  |
| `/oauth/reset-password`  | POST   | `handleResetPassword()`      |

Token design: 256-bit CSPRNG base64url, hashed (SHA-256) at rest,
single-use (`used_at`), 1-hour expiry.

## Security

- POST endpoints are rate-limited (5 req / 60 s per IP).
- Uniform 200 response for POST `/oauth/forgot-password` regardless of
  whether the email is registered (prevents account enumeration).
- Reset token is never stored raw — only the SHA-256 hash is persisted.
- `onForgotPassword` is only passed when `oauthProxyUrl` is set, preventing
  a broken link when the proxy is not configured.
- Link opens in a new tab with `noopener,noreferrer`.
