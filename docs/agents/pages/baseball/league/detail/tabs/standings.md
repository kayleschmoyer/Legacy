# League Detail — Standings Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `standings`  
**Visibility**: All users

---

## Sections

1. League Standings Table
2. Playoff Bracket (conditional)

---

## League Standings Table

**Component**: `LeagueStandings`

### Columns

`Rank · Team Logo · Team Name · W · L · T · Win% · Points For · Points Against · Waiver Order (if applicable)`

### Rank Badges

| Rank | Badge Color |
| ---- | ----------- |
| 1st  | Gold        |
| 2nd  | Silver      |
| 3rd  | Gold        |
| 4th+ | Gray        |

### Interactions

- User's own team highlighted with accent
- Hover: eye icon appears on team row
- Click team row → `handleViewTeamRoster(teamId)` (opens Roster tab for that team)

### GraphQL

| Hook                     | Data                                         |
| ------------------------ | -------------------------------------------- |
| `useStandings()`         | Calculated standings (W, L, T, Win%, PF, PA) |
| `useGetLeagueTeamsQuery` | Team names and logos                         |

---

## Playoff Bracket

**Component**: `PlayoffBracketDisplay`

**Render conditions**:

- `league.playoffEnabled === true`
- `activeTab === 'standings'` (lazy — only fetched when this tab is active)

Shows bracket matchups and progression through playoff rounds.

**Query**: `useGetPlayoffBracketQuery` (skipped when not on Standings tab)

---

## Notes

- Waiver order column only shown if the league uses waiver order tracking
- Playoff bracket replaces or extends standings view once playoffs begin
