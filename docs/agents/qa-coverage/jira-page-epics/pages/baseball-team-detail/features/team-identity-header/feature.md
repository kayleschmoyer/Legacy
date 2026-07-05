# Feature: Team Identity Header

**Jira:** LS-5364
**Page:** `baseball-team-detail` (Epic LS-5261)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Avatar (72×72 with letter fallback), team name, league ID, optional banner image, and a
visitor note for non-owner/non-commissioner viewers.

## Source

Extracted from: `docs/agents/pages/baseball/teams/detail.md`

## Implementation

### Web (route: `/baseball/teams/:teamId`)

**File:** `apps/web/src/pages/baseball/TeamDetailPage.tsx`

Renders (in order): a conditional full-width banner, then the identity `XStack`:

- **Avatar** — 72×72px rounded `YStack` with a navy gradient background. Shows
  `team.avatarUrl` when set and not errored; otherwise falls back to the first letter of
  `team.name`, uppercased.
- **Team name** — large bold `Text`, sourced from `team.name`.
- **League ID** — small gray `Text`, rendered only when `leagueId` is resolved
  (`membersData.teamMembers[0].leagueId` falling back to `teamByIdData.team.leagueId`).
- **Banner image** — full-width, 160px desktop / 100px mobile (`$sm` breakpoint), shown only
  when `team.bannerUrl` is set and hasn't errored (`onError` flips `bannerImgError`).
- **Visitor note** — italic gray text, shown only when `!isOwner && !isCommissioner`.

Mobile-web parity is handled via the same component's `$sm` Tamagui breakpoints (smaller
gaps, smaller banner height, smaller name font size) — there is no separate mobile-web
implementation.

### Android

**File:** `apps/app/src/app/(app)/baseball/team/[teamId].tsx`

The native app renders team identity only as a navigation header title:
`TeamIdHeader()` fetches `useGetTeamByIdQuery` and renders a bare `<Text>{team.name}</Text>`,
wired up as `headerTitle` in `apps/app/src/app/(app)/_layout.tsx`. There is **no avatar, no
league ID, no banner, and no visitor note** on Android — only the team name string. This is a
parity gap relative to web/mobile-web (see [Related](#related)).

## Test Coverage

### E2E tests (hermetic, web)

**`apps/web-e2e/src/tests/team-detail.spec.ts`** (LS-602)

`describe('Team Detail Page – team identity @regression')`:

- Displays the team name
- Displays a Back button
- Shows the first letter of team name as avatar fallback

**`apps/web-e2e/src/tests/team-detail-info-roster-branding.spec.ts`** (LS-680)

`describe('Team Detail – team info display @regression')`:

- Displays the league ID below the team name
- Shows custom avatar image when `avatarUrl` is set (asserts `img[alt="<Team> avatar"]` src)
- Shows letter fallback when no avatar URL is set
- Displays banner image when `bannerUrl` is set (asserts `img[alt="<Team> banner"]` src)
- Does not show banner section when `bannerUrl` is null
- Shows "Team not found" for invalid team ID in URL

`describe('Team Detail – owner info & permissions @regression')`:

- Visitor sees the "viewing this team as a visitor" notice
- Owner does not see the visitor notice
- Commissioner does not see the visitor notice

No dedicated unit test exists for the identity section specifically —
`apps/web/src/pages/baseball/TeamDetailPage.spec.tsx` (LS-4063) covers the branding-clear
confirmation dialog only.

### Android

No automated coverage exists for `TeamIdHeader` beyond incidental exercise via
`apps/app/src/app/(app)/baseball/team/[teamId].spec.tsx`, which mocks `useGetTeamByIdQuery`
and asserts lineup-editor projection gating — it does not render or assert on `TeamIdHeader`
itself. `apps/app/src/app/(app)/_layout.spec.tsx` mocks `TeamIdHeader` out entirely (returns
the literal string `'Team'`), so it provides no coverage either.

## Related

- **Epic:** LS-5261 — QA — Page: Baseball Team Detail
- **Page doc:** `docs/agents/pages/baseball/teams/detail.md`
- **Web component:** `apps/web/src/pages/baseball/TeamDetailPage.tsx`
- **Android component:** `apps/app/src/app/(app)/baseball/team/[teamId].tsx` (`TeamIdHeader`)
- **Follow-up:** Android identity header parity gap (missing avatar/league ID/banner/visitor
  note) filed as a follow-up ticket under LS-5261 — see Jira for the tracking key.
