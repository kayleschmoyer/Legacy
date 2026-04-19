# League Detail — Roster Tab (My Roster)

**Parent page**: [League Detail](../index.md)  
**Tab key**: `roster`  
**Visibility**: Members only

---

## Layout (in order)

1. Other Team Viewing Banner (conditional)
2. Week Selector Banner (multi-week leagues)
3. Historical Mode Info Banner (conditional)
4. Future Week Info Banner (conditional)
5. Pending Waiver Claims Card (conditional)
6. Pending Trade Offers Card (conditional)
7. League Roster Management (main content)

---

## Other Team Viewing Banner

**Condition**: User navigated to another team's roster (via standings or matchup click)

- Eye icon + "Viewing {teamName}'s roster"
- "Back to My Roster" button
- Roster becomes read-only

**Query**: `useGetTeamMembersLazyQuery`

---

## Week Selector Banner _(multi-week leagues)_

- Previous / Next week arrow buttons
- Week label with current/historical badge
- "vs {opponentTeam}" display
- "Current" reset button

**Queries**: `useCurrentWeek()`, `useMatchupsForLeague()`

---

## Status Banners (conditional)

| Banner          | Condition             | Message                              |
| --------------- | --------------------- | ------------------------------------ |
| Historical Mode | Viewing a past week   | Frozen lineup — editing disabled     |
| Future Week     | Viewing a future week | Changes apply to all future matchups |

---

## Pending Waiver Claims Card

**Component**: `PendingWaiverClaims`  
**Condition**: Current week only

Lists pending waiver claims for the user's team.

---

## Pending Trade Offers Card

**Component**: `PendingTradeOffers`  
**Condition**: Current week only

Lists pending trades involving the user's team.

---

## League Roster Management

**Component**: `LeagueRosterManagement`

Two-column layout: **positions** + **bench**

### Per Player Fields

| Field               | Description                                     |
| ------------------- | ----------------------------------------------- |
| Player name         | Full name                                       |
| Position(s)         | Eligible positions (e.g., C, 1B)                |
| MLB Team            | Current team                                    |
| Actual Score        | Points earned from games played                 |
| Projected Remaining | Estimated remaining score for matchup           |
| Games Played        | How many games played so far                    |
| Games Remaining     | How many left in the matchup window             |
| Lock Status         | Whether player is locked for current day        |
| Position Label      | Assigned roster slot (e.g., "C", "OF", "Bench") |

### Actions

| Action             | Behavior                         |
| ------------------ | -------------------------------- |
| Assign to position | Drag-and-drop or dropdown select |
| Swap two players   | Swap button between two slots    |
| Remove player      | Remove from roster               |
| Set nickname       | Custom display name for player   |

### Modes

- **Editable**: User's own team + current/future week
- **Read-only**: Viewing another team's roster OR historical week

### GraphQL

| Hook                            | Data                        |
| ------------------------------- | --------------------------- |
| `useGetTeamMembersQuery`        | User's own roster           |
| `useGetTeamMembersLazyQuery`    | Other team's roster         |
| `useGetPositionsForLeagueQuery` | League position definitions |
| `useGetMatchupPlayersQuery`     | Matchup scoring data        |

| Mutation                              | Action                    |
| ------------------------------------- | ------------------------- |
| `useUpdateTeamMemberPositionMutation` | Assign player to position |
| `useSwapTeamMemberPositionsMutation`  | Swap two players          |
| `useSetNicknameMutation`              | Set player nickname       |

---

## Min Career Gates

Players may be filtered or flagged based on `minCareerGames` and `minCareerSeasons` league settings.
