# League Detail Page — Reference

**Route**: `/baseball/league/:id` · `/baseball/league/:id/:tab` · `/baseball/league/:id/:tab/:matchupId`  
**File**: `apps/web/src/pages/baseball/LeagueDetailPage.tsx`

> Each tab has its own detailed reference document in [`tabs/`](tabs/):
>
> - [Overview](tabs/overview.md)
> - [Matchup](tabs/matchup.md)
> - [Roster](tabs/roster.md)
> - [Free Agents](tabs/free-agents.md)
> - [Standings](tabs/standings.md)
> - [Trades](tabs/trades.md)
> - [History](tabs/history.md)
> - [My Team](tabs/my-team.md)
> - [Commissioner](tabs/commissioner.md)

---

## Persistent Top-Level Elements

### Hero Header (always visible)

- Back button → leagues list
- League name (Big Shoulders Display typography)
- Team count badge
- Draft status badge: Pre-Draft (gray) · Queued (amber) · Drafting (navy/gold) · Season Active (green)
- Current week number
- Invite button (quick-share)

**Data**: `league.name`, `teamCount`, `league.draftStatus` (via `formatDraftStatus()`), `currentWeek`  
**Queries**: `useGetLeagueByIdQuery`, `useGetLeagueTeamsLazyQuery`, `useCurrentWeek()`

### Spectator Banner (non-members, public leagues only)

- Join button with team name input
- Error/success messages
- **Mutation**: `useJoinPublicLeagueMutation`

### Tab Navigation Bar

Tabs visible based on membership/commissioner status:

| Tab          | Key             | Visibility        |
| ------------ | --------------- | ----------------- |
| Overview     | `overview`      | All               |
| Matchup      | `matchup`       | All               |
| My Roster    | `roster`        | Members           |
| Free Agents  | `free-agents`   | All               |
| Standings    | `standings`     | All               |
| Trades       | `trades`        | All               |
| History      | `history`       | All               |
| My Team      | `team-settings` | Members           |
| Commissioner | `commissioner`  | Commissioner only |

Features: active tab gold underline, keyboard navigation (arrow keys, Home, End), lucide icons.

---

## Overview Tab

### Draft In Progress Banner

- Visible when `league.draftStatus === 'in-progress'`
- "Draft Is Live!" alert with Zap icon → "Join Draft Room" button → `/baseball/league/{id}/draft`

### Commissioner Announcements Panel

- `CommissionerAnnouncementsPanel` component
- Visible to commissioners or when announcements exist

### Award Voting Panel

- `AwardVotingPanel` component
- Visible during open voting periods; allows voting on seasonal awards

### Current Matchup Card

- `MatchupScoreboard` for user's current week matchup
- "View Details" button; click team → `handleViewTeamRoster(teamId)`
- **Queries**: `useMatchupsForLeague()`, `useCurrentWeek()`

### League Snapshot Bar

Six stats in horizontal glass panel:

| Stat        | Source                                     |
| ----------- | ------------------------------------------ |
| Teams       | `leagueTeams.length`                       |
| Roster Size | `league.maxRosterSize`                     |
| My Starters | count of assigned starters                 |
| On Bench    | count of bench players                     |
| Positions   | count from `useGetPositionsForLeagueQuery` |

**Queries**: `useGetLeagueTeamsLazyQuery`, `useGetPositionsForLeagueQuery`, `useGetTeamMembersQuery`

### Two-Column Dashboard

#### Left Column — Activity/Chat/Scoring Sub-tabs

**Activity** (default)

- `LeagueActivityFeed` — chronological league events
- Event types: trades, waivers, draft picks, lineup changes, roster moves, commissioner actions, matchups
- Each event: icon, title, detail, relative timestamp, optional link
- Max height 480px with scroll
- **Query**: `useGetLeagueActivityQuery`

**Chat**

- `LeagueChatTab` — real-time league chat
- Message grouping, @mention autocomplete, GIF picker, system messages
- **WebSocket**: `useLeagueChat()` hook

**Scoring**

- `LeagueScoringSummary` — batting/pitching/fielding scoring rules
- **Hook**: `useLeagueScoringSettings()`

#### Right Column — Sidebar

- **Commissioner Badge** (commissioner-only) — amber "COMMISSIONER" badge
- **Quick Standings** — first 6 teams: rank badge, team logo, team name, record; gold highlight for user's team; "+X more" link; "View Details" → Standings tab
- **League Dues Status Dashboard** (commissioner-only) — `LeagueDuesStatusDashboard`
- **Invite Friends Card** — copyable invite link, invite code, QR code toggle

---

## Matchup Tab

### Matchup Navigation Controls

- `MatchupNavigationControls` — week/matchup selector, Previous/Next buttons
- **Queries**: `useMatchupsForLeague()`, `useCurrentWeek()`

### Matchup Scoreboard

- `MatchupScoreboard` — Team 1 vs Team 2, actual score, projected score, games remaining
- **Query**: `useGetMatchupPlayersQuery`

### Games Remaining Indicator

- `GamesRemaining` — progress bar, percentage, count

### Roster Comparison

- `MatchupRosterComparison` — side-by-side lineups with matchup scoring
- **Query**: `useGetMatchupPlayersQuery`

### Matchup Schedule Card

- Start/end times, localized to user timezone

**Empty States**: Loading spinner · Error card · "No Active Matchup" (with commissioner link if applicable)  
**Queries**: `useMatchupById()`, `useMatchupsForLeague()`

---

## Roster Tab (My Roster)

### Other Team Viewing Banner

- "Viewing {teamName}'s roster" with back button
- **Query**: `useGetTeamMembersLazyQuery`

### Week Selector Banner (multi-week leagues)

- Previous/Next week arrows, week label, vs opponent, "Current" reset

### Status Banners

- **Historical Mode**: frozen lineup, no editing
- **Future Week**: changes apply to all future matchups

### Pending Waiver Claims (current week only)

- `PendingWaiverClaims` component

### Pending Trade Offers (current week only)

- `PendingTradeOffers` component

### League Roster Management

- `LeagueRosterManagement` — drag-and-drop roster editing
- Two-column layout: positions + bench
- Actions: assign to position, remove, swap, set nickname

**Data fields per player**:

| Field                    | Description                          |
| ------------------------ | ------------------------------------ |
| Name                     | Player full name                     |
| Position(s)              | Eligible positions                   |
| MLB Team                 | Current MLB team                     |
| Actual Score             | Points earned from games played      |
| Projected Remaining      | Estimated remaining score            |
| Games Played / Remaining | Progress through matchup             |
| Lock Status              | Whether player is locked for the day |
| Position Label           | Assigned roster slot                 |

**Queries**: `useGetTeamMembersQuery`, `useGetTeamMembersLazyQuery`, `useGetPositionsForLeagueQuery`, `useGetMatchupPlayersQuery`  
**Mutations**: `useUpdateTeamMemberPositionMutation`, `useSwapTeamMemberPositionsMutation`, `useSetNicknameMutation`

---

## Free Agents Tab

### League Free Agents Panel

- `LeagueFreeAgents` — available players not on any roster
- Two sub-tabs: **Hitters** / **Pitchers**
- Position filters: Hitters (C, 1B, 2B, 3B, SS, OF, DH) · Pitchers (SP, RP)
- Name search, 50 players per page

**Hitter columns**: G, R, HR, RBI, SB, oWAR, AVG, OBP, SLG  
**Pitcher columns**: G, GS, IP, W, L, ERA, K/9, WHIP, K, SV

**Query**: `useGetPlayersWithStatsQuery`

---

## Standings Tab

### League Standings Table

- `LeagueStandings` — full team rankings
- Columns: Rank, Team Logo/Name, W, L, T, Win%, Points For, Points Against, Waiver Order (if applicable)
- Rank badges: gold (1st/3rd), silver (2nd), gray (others)
- Highlights user's team; click team → `handleViewTeamRoster(teamId)`
- **Queries**: `useStandings()`, `useGetLeagueTeamsQuery`

### Playoff Bracket (conditional)

- `PlayoffBracketDisplay` — only when `playoffEnabled` and active tab is Standings
- **Query**: `useGetPlayoffBracketQuery`

---

## Trades Tab

### Non-Member Empty State

- "Join this league to view and submit trade offers"

### Trading Center (members)

- `TradingCenter` — pending offers, submit new offers, completed trades
- Team selection dropdown, player swap interface, Accept/Reject controls
- Real-time updates via WebSocket

---

## History Tab

### Season Selector

- Dropdown of past seasons (year + frozen status); defaults to most recent

### Season Standings

- Columns: Team, W, L, T, Win%, Points For, Points Against

### All-Time Records

Cards for:

- Highest Single-Matchup Score
- Most Wins in a Season
- Most Points in a Season
- Longest Win Streak

Each shows: record holder, value, date achieved.

**Queries**: `useGetLeagueHistoryQuery`, `useGetLeagueStandingsQuery`, `useGetAllTimeRecordsQuery`

---

## My Team Tab (team-settings)

### Team Name Editor

- Current name, Edit button → text input + Save/Cancel
- **Mutation**: `useRenameTeamMutation`

### Team Branding Card

- **Logo**: avatar picker, upload/select, preview
- **Colors**: primary + secondary hex color pickers with validation (#RRGGBB)
- **Mutation**: `useUpdateTeamBrandingMutation`

---

## Commissioner Tab (commissioner-only)

Accordion sections — "Next Step" open by default:

| Section                  | Component                        | Purpose                                             |
| ------------------------ | -------------------------------- | --------------------------------------------------- |
| Next Step                | `NextStepControl`                | Advance draft/matchup workflow                      |
| Draft Settings           | `DraftSettingsControl`           | Player pool, era filter                             |
| Draft Pick Order         | `DraftOrderControl`              | Reorder teams, randomize                            |
| League Branding          | `LeagueBrandingControl`          | Name, logo, banner, colors                          |
| League Settings          | `LeagueSettingsControl`          | Games/matchup, playoff format, roster rules         |
| League Dues              | `LeagueDuesControl`              | Amount, due date, payment tracking                  |
| Tiebreaker Rules         | `TiebreakerConfig`               | Primary/secondary/tertiary tiebreakers              |
| Season Awards            | `SeasonAwardsControl`            | Award definitions, voting period                    |
| Achievement Restrictions | `AchievementRestrictionsControl` | Toggle/restrict achievements                        |
| Waiver Processing        | `WaiverProcessControl`           | Waiver period, FAAB settings                        |
| Scoring                  | `LeagueScoringEditor`            | Point values for batting/pitching/fielding stats    |
| New Season               | `SeasonRenewalControl`           | Create next season (carries over settings)          |
| Danger Zone              | `DeleteLeagueControl`            | Delete league (irreversible, confirmation required) |

### Next Step Control — Status-Based UI

| Draft Status | Controls Shown                             |
| ------------ | ------------------------------------------ |
| Pre-Draft    | "Start Draft" button                       |
| In Progress  | "Join Draft Room" button                   |
| Post-Draft   | "Create Week 1 Matchups" or "Advance Week" |

### League Settings Fields

- Games per matchup
- SP starts per matchup
- Min career games filter
- Min career seasons filter
- Total matchups (season length)
- Playoff enabled toggle
- Playoff format (4 / 6 / 8 team)
- Multi-week playoff toggle

---

## WebSocket & Real-Time

**Provider**: `LeagueWebSocketContext` wraps entire page via `useLeagueWebSocketLifecycle()`

| Event                    | Refetch Triggered                            |
| ------------------------ | -------------------------------------------- |
| `DRAFT_COMPLETED`        | league, team members, matchups, current week |
| `DRAFT_STARTED`          | league                                       |
| `ROSTER_UPDATE`          | league                                       |
| `MATCHUP_STATS_COMPLETE` | league, matchups, current week               |
| `PLAYER_STATS_LOADING`   | matchups, current week                       |
| Trade notifications      | trading data                                 |
| Chat messages            | streamed via WebSocket hook                  |

---

## Conditional Rendering Summary

| UI Element                   | Condition                                     |
| ---------------------------- | --------------------------------------------- |
| Commissioner badge           | `isCommissioner`                              |
| Dues Status Dashboard        | `isCommissioner`                              |
| Commissioner tab             | `isCommissioner`                              |
| "Go to Commissioner" btn     | `isCommissioner` + empty matchup state        |
| Spectator banner             | `isSpectator` (public league, not member)     |
| Draft Live banner            | `draftStatus === 'in-progress'`               |
| Historical mode banner       | viewing past week                             |
| Future week banner           | viewing future week                           |
| Playoff bracket              | `playoffEnabled && activeTab === 'standings'` |
| Roster editor (vs read-only) | viewing own team                              |

---

## Full GraphQL Inventory

### Queries

| Hook                            | Data                          |
| ------------------------------- | ----------------------------- |
| `useGetLeagueByIdQuery`         | Main league data              |
| `useGetLeagueTeamsLazyQuery`    | All teams                     |
| `useGetTeamMembersQuery`        | User's roster                 |
| `useGetTeamMembersLazyQuery`    | Other team's roster           |
| `useGetPositionsForLeagueQuery` | League positions              |
| `useGetUserTeamIdLazyQuery`     | Current user's team ID        |
| `useGetMatchupPlayersQuery`     | Matchup player data + scoring |
| `useGetPlayoffBracketQuery`     | Playoff bracket               |
| `useGetLeagueActivityQuery`     | Activity feed                 |
| `useGetLeagueHistoryQuery`      | Past seasons                  |
| `useGetLeagueStandingsQuery`    | Season standings              |
| `useGetAllTimeRecordsQuery`     | All-time records              |
| `useGetPlayersWithStatsQuery`   | Free agent pool               |

### Mutations

| Hook                                  | Action                    |
| ------------------------------------- | ------------------------- |
| `useRenameTeamMutation`               | Update team name          |
| `useUpdateTeamBrandingMutation`       | Logo, colors              |
| `useUpdateTeamMemberPositionMutation` | Assign player to position |
| `useSwapTeamMemberPositionsMutation`  | Swap two players          |
| `useSetNicknameMutation`              | Set player nickname       |
| `useJoinPublicLeagueMutation`         | Spectator join            |
| `useDeleteLeagueMutation`             | Delete league             |
| `useSeasonRenewalMutation`            | Create next season        |

### Key Custom Hooks

| Hook                         | Purpose                     |
| ---------------------------- | --------------------------- |
| `useCurrentWeek()`           | Current league week         |
| `useMatchupsForLeague()`     | All matchups                |
| `useMatchupById()`           | Specific matchup            |
| `useStandings()`             | Calculated standings        |
| `useLeagueScoringSettings()` | Scoring rules               |
| `useLeagueWebSocket()`       | WebSocket subscriptions     |
| `useLeagueChat()`            | Chat messages via WebSocket |
| `useLeagueTakenPlayers()`    | Players on any roster       |
