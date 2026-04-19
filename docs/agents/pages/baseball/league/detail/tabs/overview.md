# League Detail — Overview Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `overview`  
**Visibility**: All users (members, spectators, commissioners)

---

## Layout (in order)

1. Draft In Progress Banner (conditional)
2. Commissioner Announcements Panel (conditional)
3. Award Voting Panel (conditional)
4. Current Matchup Card (conditional)
5. League Snapshot Bar
6. Two-Column Dashboard (left: activity/chat/scoring sub-tabs · right: sidebar)

---

## Draft In Progress Banner

**Condition**: `league.draftStatus === 'in-progress'`

- "Draft Is Live!" alert with Zap icon
- "Join Draft Room" button → `/baseball/league/{id}/draft`

---

## Commissioner Announcements Panel

**Component**: `CommissionerAnnouncementsPanel`  
**Condition**: `isCommissioner` OR announcements exist

---

## Award Voting Panel

**Component**: `AwardVotingPanel`  
**Condition**: Voting period is currently open  
**Action**: Vote on seasonal awards

---

## Current Matchup Card

**Condition**: `userCurrentMatchup` exists

- `MatchupScoreboard` for user's current week matchup
- "View Details" button → matchup detail page
- Click team name → `handleViewTeamRoster(teamId)`

**Queries**: `useMatchupsForLeague()`, `useCurrentWeek()`

---

## League Snapshot Bar

Six stats in a horizontal glass panel:

| Stat        | Source                                     |
| ----------- | ------------------------------------------ |
| Teams       | `leagueTeams.length`                       |
| Roster Size | `league.maxRosterSize`                     |
| My Starters | Count of assigned starters                 |
| On Bench    | Count of bench players                     |
| Positions   | Count from `useGetPositionsForLeagueQuery` |

**Queries**: `useGetLeagueTeamsLazyQuery`, `useGetPositionsForLeagueQuery`, `useGetTeamMembersQuery`

---

## Left Column — Activity / Chat / Scoring Sub-tabs

### Activity Sub-tab (default active)

**Component**: `LeagueActivityFeed`

Event types rendered: trades · waivers · draft picks · lineup changes · roster moves · commissioner actions · matchups

Per event: icon · title · detail · relative timestamp · optional link

Max height: 480px with scroll

**Query**: `useGetLeagueActivityQuery`

### Chat Sub-tab

**Component**: `LeagueChatTab`

Features: message grouping · @mention autocomplete · GIF picker · system messages  
Height: 420px  
**WebSocket**: `useLeagueChat()` hook (real-time)

### Scoring Sub-tab

**Component**: `LeagueScoringSummary`

Displays batting / pitching / fielding scoring rules for the league.

**Hook**: `useLeagueScoringSettings()`

---

## Right Column — Sidebar

### Commissioner Badge

**Condition**: `isCommissioner`  
Amber "COMMISSIONER" badge with Info icon.

### Quick Standings

First 6 teams ranked by wins/points:

- Rank badge
- Team logo
- Team name
- Team record (W-L-T)

Gold accent highlight on user's own team.  
"+X more teams" link if > 6 teams.  
"View Details" → Standings tab.  
Click team → `handleViewTeamRoster(teamId)`

### League Dues Status Dashboard

**Component**: `LeagueDuesStatusDashboard`  
**Condition**: `isCommissioner` only

Shows dues payment status across all teams.

### Invite Friends Card

- Copyable invite link + copy button
- Invite code display + copy button
- QR code toggle (shows QR for mobile sharing)
- Success/error messages on copy

**Data**: `league.inviteCode`
