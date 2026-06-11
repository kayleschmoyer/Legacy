# Feature: Google OAuth Login (Mobile)

**Jira:** LS-7583
**Page:** `login` (Epic LS-5280)

## Description

Google Sign-In on the native mobile app via `@react-native-google-signin/google-signin@^16.1.2`.
Configured in `apps/app/src/common/auth/mobileOAuthConfig.ts` with a `webClientId` resolved from
the env var `GOOGLE_OAUTH_CLIENT_ID` / `expo extra.googleClientId`, with a placeholder-sentinel
guard (`PLACEHOLDER_GOOGLE_CLIENT_ID`) that falls back to the hardcoded project default
(`1025244625243-dpatg6bbda3g86sipjr6eis4olnp6rc3.apps.googleusercontent.com`). The OAuth proxy
URL is supplied via `config.oauthProxy` (defaults to `http://localhost:5001/oauth` when unset).

## Platforms

- `mobile-web` (limited — Google Sign-In is primarily a native flow)
- `android` (primary — built-in via Google Play Services)
- `iOS` (secondary — same SDK works on iOS with Google Play Services available)

## Entitlement

`all` — auth surface, no entitlement variant.

## Configuration Details

| Field              | Source                                                                                      | Notes                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `webClientId`      | `config.googleClientId` → `PLACEHOLDER_GOOGLE_CLIENT_ID` guard → `DEFAULT_GOOGLE_CLIENT_ID` | Placeholder sentinel prevents DEVELOPER_ERROR when `app.json` ships non-empty placeholder |
| `oauthProxyUrl`    | `config.oauthProxy`                                                                         | Defaults to `http://localhost:5001/oauth`                                                 |
| `additionalScopes` | hardcoded                                                                                   | `['openid', 'profile', 'email']`                                                          |
| `offlineAccess`    | hardcoded                                                                                   | `true`                                                                                    |

Source of truth: `apps/app/src/common/auth/mobileOAuthConfig.ts` — `getMobileOAuthConfig()` and `resolveGoogleClientId()`.

## Why This Feature Was Filed Retroactively

The original feature-extraction QA pass on the Login page (Round 1, June 2 2026) enumerated only
Discord OAuth, email/password, and forgot-password flows. Google Sign-In was not enumerated
despite being fully wired in the codebase. Every subsequent QA agent inherited that gap and never
tested Google Sign-In. This Feature Story exists to retroactively give the Google flow a parent
for finding tickets.

## Source / Discovery

Discovered via direct codebase grep (`grep -rl "GoogleSignin|google-signin"`) and
`apps/app/package.json` dependency audit after a user reported that tapping "Login with Google"
puts them in a redirect loop.
