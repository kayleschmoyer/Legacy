# Feature: Join Football League CTA

**Jira:** LS-6288 (FBH-034)
**Page:** `football-home` (`/football`)
**Platforms:** web, mobile-web, android, ios
**Entitlement:** all

## Description

The Join Football League CTA is the primary entry point on the Football Home
page (`/football`) for users who want to enter an existing league via invite
code. It is rendered by the shared `NFLHome` component
(`lib/shared-components/src/features/football/NFLHome.tsx`), which both the
web hub page and the native home screen wrap — so the CTA's copy ("Join
League"), placement, and behavior are identical across platforms by
construction rather than by convention.

Historically (pre-LS-7819), web served this page via a standalone
`FootballLandingPage` that did not expose a Join CTA at all, diverging from
native's `NFLHome`-based "Join League" button (LS-6288 / FBH-034). The
LS-7819 rewrite retired `FootballLandingPage` and moved web onto the same
shared `NFLHome` component native already used, which closed the gap: both
platforms now render the same "Join League" button, wired to the same
`onJoinLeague` callback.

**Web entry point:** `apps/web/src/pages/football/FootballHubPage.tsx`
— `onJoinLeague` prop navigates to `/football/league/join`

**Native entry point:** `apps/app/src/screens/FootballHomeScreen.tsx`
— `onJoinLeague` prop navigates to `/football/league/join`

**Join-by-code page:** `apps/web/src/pages/football/` join route (`/football/league/join`)

**Shared hub component:** `lib/shared-components/src/features/football/NFLHome`
— renders a single "Join League" hero button (`data-testid="join-league-button"`,
`accessibilityLabel="Join a football league"`) in **both** the with-leagues and
empty-state layouts. Unlike `MLBHome`, there is no separate compact "Join"
variant — one CTA label covers both layouts.

## Test Coverage

### Unit tests

**File:** `lib/shared-components/src/features/football/NFLHome.spec.tsx`
— `describe('NFLHome — Join League CTA (LS-6288)')`

- CTA is omitted when `onJoinLeague` is not supplied
- CTA renders (`join-league-button` testid, "Join League" text) and invokes
  `onJoinLeague` when pressed
- CTA is present in the empty-state layout, confirming native/web parity

### E2E tests (hermetic — web only)

**File:** `apps/web-e2e/src/tests/football-join-league-cta.spec.ts`

#### `describe('Join Football League CTA — hub with active leagues @critical')`

- `'Join League CTA is visible when user has active leagues'`
- `'Join League CTA is enabled when user has active leagues'`
- `'clicking Join League CTA navigates to /football/league/join'`

#### `describe('Join Football League CTA — hub empty state @critical')`

- `'Join League CTA is visible in the empty-state layout'`
- `'clicking Join League CTA in empty state navigates to /football/league/join'`

#### `describe('Join Football League CTA — join form accepts invite code input @critical')`

- Invite code + team name inputs, uppercase auto-formatting, disabled-until-filled join button

#### `describe('Join Football League CTA — end-to-end flow @regression')`

- Full mocked flow: hub → click CTA → fill invite code → fill team name →
  submit → redirect to the joined league's detail page under `/football`

## Related

- **Ticket:** LS-6288 (FBH-034) — Join CTA copy/label diverges across platforms
- **Prior parity fix:** LS-7819 — retired the standalone `FootballLandingPage`
  in favor of the shared `NFLHome` component
- **Baseball counterpart:** [`../../baseball-home/features/join-baseball-league-cta/feature.md`](../../baseball-home/features/join-baseball-league-cta/feature.md)
- **Shared hub component:** `lib/shared-components/src/features/football/NFLHome.tsx`
