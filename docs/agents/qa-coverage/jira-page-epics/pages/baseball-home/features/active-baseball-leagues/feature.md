# Feature: Active Baseball Leagues List

**Jira:** LS-5332
**Page:** `baseball-home` (Epic LS-5258)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The "Your Leagues" section on the Baseball Home page (`/baseball`) lists every
fantasy baseball league the authenticated user belongs to. Each league card
displays the league name, a color-coded status badge reflecting the league's
current draft/season state, and a "View" action that navigates to the league
detail page.

### Status Badges

| draftStatus value       | Badge label       | Color cue      |
| ----------------------- | ----------------- | -------------- |
| `not-started`, `queued` | Draft Scheduled   | Amber / orange |
| `in-progress`           | Drafting          | Navy / gold    |
| `completed` + week      | Week N            | Green          |
| `completed` (no week)   | In Season         | Green          |
| other / unknown         | Title-cased value | Grey           |

A secondary badge appears when `weekAdvanceStatus` is `processing` or `queued`
("Advancing") or `failed` ("Advance failed").

### Empty and Loading States

| Condition                     | Display                                    |
| ----------------------------- | ------------------------------------------ |
| `loading: true`               | Full-screen spinner; no league list        |
| `leagues: []`, `error: false` | "No leagues yet" placeholder + CTA buttons |
| `leagues: []`, search active  | "No leagues match your search" placeholder |
| `error: true`                 | Error notice with optional Retry button    |
| `isAuthenticated: false`      | Sign-in notice; league list is hidden      |

### Search

When the user has at least one league, a search field filters the list
client-side by league name (case-insensitive, trimmed).

## Source

Extracted from: `inferred from docs/agents/pages/my-leagues-overview.md`

## Implementation

**Shared component:** `lib/shared-components/src/features/baseball/MLBHome.tsx`

The `MLBHome` component is purely presentational (no GraphQL, LS-7716 AC1).
Data is supplied by platform-specific wrappers:

| Platform | Wrapper                                               | Query                    |
| -------- | ----------------------------------------------------- | ------------------------ |
| Web      | `apps/web/src/components/baseball/BaseballScreen.tsx` | `useGetUserLeaguesQuery` |
| Mobile   | `apps/app/src/app/(app)/baseball/index.tsx`           | `useGetUserLeaguesQuery` |

Badge logic lives in `getLeagueBadge()` inside `MLBHome.tsx`. Advance-status
badges render inline on each league row when `weekAdvanceStatus` is set.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/baseball/MLBHome.spec.tsx`

`describe('MLBHome')`:

- Shows the full hero and empty state when the user has no leagues
- Shows the compact hero and league list when the user has leagues
- Renders "Drafting" badge for `draftStatus: 'in-progress'`
- Renders "Week N" badge for `draftStatus: 'completed'` with a week number
- Renders "Draft Scheduled" badge for `draftStatus: 'queued'`
- Renders "In Season" badge for `draftStatus: 'completed'` without a week number
- Renders "Advancing" badge when `weekAdvanceStatus` is `'processing'`
- Renders "Advancing" badge when `weekAdvanceStatus` is `'queued'`
- Renders "Advance failed" badge when `weekAdvanceStatus` is `'failed'`
- Renders a title-cased badge for an unknown `draftStatus` value
- Filters the league list via search
- Shows "No leagues match your search" when search yields no results
- Shows the error notice (not the empty state) when `error` is set
- Shows only a spinner while `loading` is set
- Invokes `onViewLeague` when a league "View" button is pressed
- Renders the league-cap indicator and disables Create at the cap
- Renders an Invite Friends action only when `onInviteFriends` is provided
- Renders the sign-in notice when unauthenticated

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/active-baseball-leagues.spec.ts`

`describe('Active Baseball Leagues List (LS-5332) @regression')`:

- "Your Leagues" heading is visible on the baseball home page
- League cards are rendered for each mocked user league
- "Draft Scheduled" badge appears for a pre-draft league
- "Drafting" badge appears for a league in the draft phase
- "Week N" badge appears for an active in-season league
- "In Season" badge appears for a completed league with no week number
- Title-cased badge appears for an unknown `draftStatus` value
- "Advancing" badge appears when `weekAdvanceStatus` is `'processing'`
- "Advancing" badge appears when `weekAdvanceStatus` is `'queued'`
- "Advance failed" badge appears when `weekAdvanceStatus` is `'failed'`
- Error notice is shown when the GraphQL query returns errors
- Search field filters the league list by name
- Clicking "View" on a league card navigates to the league detail page
- Empty state "No leagues yet" is shown when the user has no leagues
- Sign-in notice is shown when the user is not authenticated
