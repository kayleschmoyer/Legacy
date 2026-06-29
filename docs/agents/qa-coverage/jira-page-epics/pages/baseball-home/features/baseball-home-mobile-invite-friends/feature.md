# Feature: Baseball Home — Mobile Invite Friends

**Jira:** LS-7623
**Page:** `baseball-home` (Epic LS-5258)
**Platforms:** android (mobile-only)
**Entitlement:** all

## Description

The Invite Friends modal lets mobile users share a league-specific invite link with
contacts outside the app. Tapping "Invite Friends" on the Baseball Home screen opens a
native modal that lists the user's leagues. Selecting a league triggers the OS-level
share sheet (`Share.share()`) with a pre-composed invite link containing the league's
invite code. This is a mobile-only feature — no equivalent exists on the web platform.

**Note:** A previous stub implementation used `setTimeout` + `Alert.alert('Success', …)`
to simulate a send without making any network call (LS-7623 GAP-001). The stub was
replaced with the native `Share.share()` flow described below.

## Implementation

**Mobile data wrapper:** `apps/app/src/app/(app)/baseball/index.tsx`

| Concern              | Detail                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modal visibility     | `inviteModalVisible` state; opened by `onInviteFriends` prop on `MLBHome`                                                                                                                                                                 |
| League list source   | `useGetUserLeaguesQuery` result as `rawLeagues` — **all sports, unfiltered** (the filtered `leagues` variable is only passed to `MLBHome` for the hub list; the invite modal uses `rawLeagues` directly so the server-side count matches) |
| Share mechanism      | `Share.share({ message, title, url })` from `react-native`                                                                                                                                                                                |
| Invite URL shape     | `${APP_BASE_URL}/baseball/league/join/${inviteCode}`                                                                                                                                                                                      |
| Dismissal handling   | `Share.dismissedAction` keeps modal open so the user can retry or pick another league                                                                                                                                                     |
| Error handling       | `LOGGER.error(…)` on share failure; no silent swallow                                                                                                                                                                                     |
| Empty / error states | Spinner while loading; error message on query failure; "no leagues" message when list is empty                                                                                                                                            |
| Close                | "Cancel" button always visible; `onRequestClose` for Android back gesture                                                                                                                                                                 |

### State Flow

1. User taps **Invite Friends** → `inviteModalVisible = true`
2. Modal renders league list from `rawLeagues` (all leagues, not filtered by sport, matching server count)
3. User taps a league button → `shareLeagueInvite({ name, inviteCode })` called
4. If `inviteCode` is absent → `LOGGER.warn` and bail out (no share sheet shown)
5. OS share sheet opens with invite URL
6. On share completion → `inviteModalVisible = false`
7. On dismissal → modal stays open

### Invite Link Format

```
https://legacysports.app/baseball/league/join/<inviteCode>
```

The `APP_BASE_URL` is read from `@legacy-sports/app-config/native` (`config.appBaseUrl`),
falling back to `https://legacysports.app`.

## Validation / Error States

| State                      | Behavior                                                   |
| -------------------------- | ---------------------------------------------------------- |
| League has no invite code  | `LOGGER.warn`; share sheet not opened                      |
| Query loading              | Spinner shown in place of league list                      |
| Query failed               | "We couldn't load your leagues. Please try again." message |
| No leagues                 | "You don't have any leagues yet." (i18n key `0uDEd6`)      |
| Share API error            | `LOGGER.error`; no user-visible success message shown      |
| User dismisses share sheet | Modal stays open                                           |

## Test Coverage

No automated tests exist for this mobile-native flow (the `Share` API is not accessible
in the web E2E suite, and there are no native unit tests for this wrapper).

Manual verification steps:

1. Open mobile app on Android
2. Navigate to Baseball Home
3. Tap **Invite Friends**
4. Verify modal opens and lists user's leagues
5. Tap a league → verify OS share sheet opens with a link containing the league's invite code
6. Dismiss share sheet → verify modal remains open
7. Tap **Cancel** → verify modal closes
8. Tap a league with no invite code → verify no share sheet appears (check logs for warn)

## Related

- **Epic:** LS-5258 — QA — Page: Baseball Home
- **Bug ticket:** LS-7623 — GAP-001: stub removed, native share implemented
- **Mobile data wrapper:** `apps/app/src/app/(app)/baseball/index.tsx`
- **Shared hub component:** `lib/shared-components/src/features/baseball/MLBHome.tsx`
- **App config:** `lib/app-config/src/native.ts` (`appBaseUrl`)
- **League invite code flow:** `apps/app/src/app/(app)/baseball/league/join/index.tsx`
