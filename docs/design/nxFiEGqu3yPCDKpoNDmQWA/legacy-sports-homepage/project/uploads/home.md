# Home Page — Reference

**Route**: `/`  
**File**: `apps/web/src/pages/home/HomePage.tsx`

---

## Variants

The home page renders two distinct views based on whether the user has any leagues:

| Condition              | View Rendered              |
| ---------------------- | -------------------------- |
| `hasLeagues === true`  | Returning User Dashboard   |
| `hasLeagues === false` | Getting Started (new user) |

---

## Loading & Error States (top-level)

- **Loading**: Full-page spinner (large, gold) while `auth.isLoading` or `summariesLoading`
- **Error**: Error card with warning icon, title "Unable to load your leagues", description, and Retry button

---

## Returning User Dashboard

### Compact Header

- User's name (greeting)
- League count + overall W-L aggregate
- **Buttons**: "My Dashboard" → `/baseball` · "Browse Stats" → `/players/stats`

### Your Leagues Section

League summary cards, sorted by urgency. Each card displays:

| Field                        | Source                                           | Notes                                                                  |
| ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| League name                  | `leagueName`                                     | H3 heading                                                             |
| Phase badge                  | `leaguePhase` + `draftStatus`                    | Draft Live (gold), Active (green), Pre-Draft (navy), Offseason (muted) |
| Draft status detail          | `draftStatus`, `draftMode`, `selectionMethod`    | Shown when draft in progress                                           |
| User score vs Opponent score | `userScore`, `opponentScore`, `opponentTeamName` | Shown when active matchup exists                                       |
| Record + Rank                | `wins`, `losses`, `ties`, `rank`, `totalTeams`   | Shown when no active matchup                                           |
| Week number                  | `currentWeekNumber`, `totalMatchups`             | Footer: "Week X/Y"                                                     |
| Draft date                   | `draftScheduledAt`                               | Footer: "Draft: [date]" when pre-draft                                 |
| Team count                   | `teamCount`                                      | Footer: "X teams"                                                      |

**Score zone logic** (mutually exclusive):

1. Draft live → show draft mode + selection method
2. Active matchup → show score vs opponent
3. Active/pre-draft, no matchup → show record + rank
4. Offseason → show final record

**Actions on league card**: Click → `/baseball/league/{leagueId}`

**Archived leagues**:

- "Show archived leagues" toggle → lazy-fetches via `useGetArchivedUserLeagueSummariesLazyQuery`
- Loading: spinner + "Loading archived leagues…"
- Same card format as active leagues

### Your Sports Section

Sport navigation cards (Baseball, Football):

- Sport icon, title, description
- Football shows "Coming Soon" badge (opacity 0.6, not clickable)
- Click baseball card → `/baseball`

### On This Day in Baseball Section

- `OnThisDayFeed` component — historical player performance feed

---

## Getting Started View (new users)

### Hero Section

- Welcome greeting with user name
- Call-to-action paragraph
- **Buttons**: "Create League" → `/baseball/league/create` · "Join League" → `/baseball/league/join` · "How It Works" → opens onboarding tutorial modal

### Choose Your Sport Section

- Sport cards (expandable)
- Per sport: "View Leagues" button, "Create League" button (baseball only)
- Football: "Coming Soon" badge, buttons disabled

### On This Day in Baseball Section

- Only rendered if `defaultSport === 'baseball'`
- `OnThisDayFeed` component

### Explore Player Statistics CTA

- Badge icon, title, description
- **Button**: "View All Stats" → `/players/stats`

---

## Onboarding Tutorial

- Auto-shown for first-time users with no leagues
- Checks localStorage key: `ls_onboarding_complete_{userId}`
- Triggered by "How It Works" button

---

## GraphQL Queries

| Hook                                         | Data                    | Trigger                   |
| -------------------------------------------- | ----------------------- | ------------------------- |
| `useGetUserLeagueSummariesQuery`             | Active league summaries | On mount                  |
| `useGetArchivedUserLeagueSummariesLazyQuery` | Archived leagues        | On "Show archived" toggle |

**UserLeagueSummaryFragment fields**: `leagueId`, `leagueName`, `leaguePhase`, `draftStatus`, `draftMode`, `selectionMethod`, `wins`, `losses`, `ties`, `rank`, `totalTeams`, `currentWeekNumber`, `totalMatchups`, `draftScheduledAt`, `teamCount`, `matchupId`, `matchupStatus`, `userScore`, `opponentScore`, `opponentTeamName`

---

## Conditional Rendering Rules

| Element                     | Condition                                             |
| --------------------------- | ----------------------------------------------------- |
| Full-page spinner           | `auth.isLoading` OR `(auth.user && summariesLoading)` |
| Error card                  | `summariesError && !summariesLoading && !data`        |
| Returning Dashboard         | `hasLeagues === true`                                 |
| Getting Started             | `hasLeagues === false`                                |
| Archived leagues section    | After toggle click                                    |
| Football "Coming Soon"      | Always (football not yet available)                   |
| On This Day (new user view) | `defaultSport === 'baseball'`                         |
| Onboarding tutorial modal   | First visit + no leagues                              |
