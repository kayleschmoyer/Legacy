# Feature: Apple Sign-In (iOS — App Store Compliance)

**Jira:** LS-7582
**Page:** `login` (Epic LS-5280)
**Platform:** Native App (iOS)
**Compliance:** Apple App Store guideline 4.8

## Description

iOS App Store guideline 4.8 mandates that any app offering third-party social login (Discord,
Google, etc.) **must** also offer Sign in with Apple. The Legacy Sports iOS app currently offers
Discord OAuth and email/password authentication but no Sign in with Apple button. Without this
feature, the next App Store submission will be rejected.

## Missing Flow

1. User opens the iOS app and reaches the login screen
2. App displays Discord OAuth + email/password — **no "Sign in with Apple" button present**
3. Expected: a "Sign in with Apple" button using the native AuthenticationServices framework

## What Needs to Be Built

- Add `expo-apple-authentication` (or `@invertase/react-native-apple-authentication`) to `apps/app`
- Add a "Sign in with Apple" button to the login screen (`apps/app/src/app/login.tsx` or equivalent)
- Wire the Apple identity token to a server-side endpoint that exchanges it for a Legacy Sports JWT
- Ensure the button follows Apple's required UI guidelines (black button on light, white on dark)

## Related Bugs

| Key     | Summary                                                           | Severity |
| ------- | ----------------------------------------------------------------- | -------- |
| LS-7569 | Missing "Sign in with Apple" on iOS — App Store rejection trigger | Critical |

## Why This Feature Story Was Filed

The original QA feature-extraction pass did not enumerate Apple Sign-In separately from the
Discord OAuth flow (same root cause as `google-oauth-login`). A mobile-as-a-user audit caught
it. This Feature Story was filed retroactively to provide a proper Jira parent for LS-7569 and
to document the compliance gap for future sprints.
