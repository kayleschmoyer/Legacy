# Feature: Overview Tab

**Jira:** LS-5345
**Page:** `baseball-league-detail` (Epic LS-5259)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The Overview Tab is the default landing tab on the Baseball League Detail page
(`/baseball/league/:id/overview`). It presents a full league dashboard with
contextual banners, a snapshot bar, an activity/chat/scoring sub-tab panel,
a sidebar with quick standings and commissioner tools, and an invite-friends
card.

### Layout (in order)

1. **Draft In Progress Banner** — shown when `league.draftStatus === 'in-progress'`
   or `'drafting'`. Displays a "Draft Is Live" alert with a Zap icon and a
   "Join Draft Room" button that fires `onJoinDraft()`.

2. **Commissioner Announcement Banner** — shown when `isCommissioner && league.lmNotes`
   is set. Displays the `lmNotes` text with a gold bell banner.

3. **Commissioner Announcements Panel** — `CommissionerAnnouncementsPanel`
   component; hides itself when there are no announcements and the viewer is
   not the commissioner.

4. **League Snapshot Bar** — `Snapshot` component; six stat tiles in a horizontal
   glass panel: Teams, Roster Size, Games/Matchup (baseball) or Weeks/Season
   (football), Matchup Length / Weekly Format, My Starters.

5. **Two-Column Dashboard**
   - **Left — Activity / Chat / Scoring sub-tabs** (default: Activity)
     - `LeagueActivityFeed` — trades, waivers, draft picks, lineup changes,
       roster moves, commissioner actions, matchups; empty state "No activity yet".
     - `LeagueChatTab` — real-time WebSocket chat; message grouping, @mention
       autocomplete, GIF picker, system messages.
     - `LeagueScoringSummary` — batting/pitching/fielding scoring rules via
       `useLeagueScoringSettings()`.
   - **Right — Sidebar**
     - `QuickStandings` — top 6 teams ranked by win-pct then points; user's own
       team highlighted gold; "+X more teams" link if > 6; "View" button
       navigates to Standings tab.
     - `DuesCompact` — league dues payment status (paid/total + collected $,
       outstanding members); hidden when dues are disabled or no member rows exist.
     - `InviteCard` — copyable invite link + code, QR code toggle; rendered
       inside `#invite-section` and shown only when `isCommissioner`.

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/tabs/overview.md`

## Implementation

**Primary component:** `apps/web/src/pages/baseball/league-detail-v2/tabs/Overview.tsx`

Exported symbols: `OverviewTab` (default tab component), `DuesCompact`
(commissioner dues widget), `Snapshot` (league stat bar).

| Sub-component                    | File                                                                  |
| -------------------------------- | --------------------------------------------------------------------- |
| `CommissionerAnnouncementsPanel` | `apps/web/src/features/baseball/CommissionerAnnouncementsPanel.tsx`   |
| `LeagueActivityFeed`             | `apps/web/src/features/baseball/LeagueActivityFeed.tsx`               |
| `LeagueChatTab`                  | `apps/web/src/features/baseball/LeagueChatTab.tsx`                    |
| `LeagueScoringSummary`           | `lib/shared-components/src/features/leagues/LeagueScoringSummary.tsx` |
| `AwardVotingPanel`               | `lib/shared-components/src/features/leagues/AwardVotingPanel.tsx`     |

**Mobile (Android / mobile-web):** `apps/app/src/features/leagues/LeagueOverviewTab.tsx`

**GraphQL queries used:**

- `useGetLeagueByIdQuery` — league data (draftStatus, maxRosterSize, inviteCode, …)
- `useGetLeagueTeamsLazyQuery` — team list for Snapshot + standings fallback
- `useGetLeagueStandingsQuery` — ranked standings data
- `useGetLeagueDuesStatusQuery` — dues settings + per-member payment status
- `useGetTeamMembersQuery` — roster (starter count for Snapshot)
- `useGetLeagueActivityQuery` — activity feed events
- `useLeagueScoringSettings()` — scoring profile (Scoring sub-tab)

## Test Coverage

### Unit tests

File: `apps/web/src/pages/baseball/league-detail-v2/tabs/Overview.spec.tsx`

`describe('DuesCompact')`:

- Renders nothing when dues are disabled
- Renders nothing when there are no member rows
- Renders paid / total headline and collected dollar total
- Renders the Outstanding list with unpaid members only
- Hides the Outstanding list when every member has paid

`describe('OverviewTab — Invite section anchor (LS-7968)')`:

- Renders `#invite-section` anchor when `isCommissioner` is true
- Does not render `#invite-section` anchor when `isCommissioner` is false

`describe('OverviewTab — Join Draft Room (LS-4916)')`:

- Calls `onJoinDraft` when the "Join Draft Room" button is clicked
- Does not render the "Join Draft Room" banner when no draft is in progress

`describe('Snapshot')`:

- Renders football-specific labels ("Weeks / Season", "Weekly Format") when `isFootball` is true
- Renders baseball-specific label ("Games / Matchup", "Matchup Length") when `isFootball` is false

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/overview-tab.spec.ts`

`describe('Overview Tab — Layout (LS-5345) @regression')`:

- Overview tab is the default landing tab on `/baseball/league/:id`
- Navigating to `/overview` renders without application error
- League name heading is visible on the overview tab
- League Snapshot Bar displays team count ("Teams" label) and roster size ("Roster Size" label)
- Activity sub-tab is active by default and shows the activity feed
- Switching to the Chat sub-tab shows the chat section
- Switching to the Scoring sub-tab shows scoring rules section
- Quick Standings section is visible in the sidebar

`describe('Overview Tab — Draft In Progress Banner (LS-5345) @regression')`:

- "Draft Is Live" banner appears when `draftStatus` is `'in-progress'`
- "Join Draft Room" button is present in the banner
- Draft banner is absent when `draftStatus` is not in-progress

`describe('Overview Tab — Commissioner features (LS-5345) @regression')`:

- `#invite-section` is rendered for commissioner users
- Invite link input is visible in the invite card
- Invite code input is visible in the invite card
- "Show QR Code to Invite" button toggles the QR code panel (shows QR on click, hides on second click)

## Related

- **Epic:** LS-5259 — QA — Page: Baseball League Detail
- **Implementation ref:** `docs/agents/pages/baseball/league/detail/tabs/overview.md`
- **Existing smoke/regression coverage:** `apps/web-e2e/src/tests/league-detail-tabs.spec.ts`
  (Overview Tab navigation @smoke, Activity Feed @regression, League Chat @regression)
