# League Detail — Free Agents Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `free-agents`  
**Visibility**: All users

---

## Component

`LeagueFreeAgents` — players not on any team roster in the league.

---

## Sub-Tabs

| Tab      | Positions                       |
| -------- | ------------------------------- |
| Hitters  | C · 1B · 2B · 3B · SS · OF · DH |
| Pitchers | SP · RP                         |

---

## Hitter Columns

`Player Name · Team · Position · G · R · HR · RBI · SB · oWAR · AVG · OBP · SLG`

## Pitcher Columns

`Player Name · Team · Position · G · GS · IP · W · L · ERA · K/9 · WHIP · K · SV`

---

## Controls

| Control         | Description                                |
| --------------- | ------------------------------------------ |
| Sub-tab toggle  | Switch between Hitters / Pitchers          |
| Position filter | Filter by specific position within sub-tab |
| Name search     | Filter by player name                      |
| Pagination      | 50 players per page                        |

---

## Actions

| Action                | Availability                 |
| --------------------- | ---------------------------- |
| Claim / Waiver button | Members only                 |
| View player stats     | All users (click player row) |

---

## GraphQL

**Query**: `useGetPlayersWithStatsQuery`  
Returns available players not on any roster in the league, with full stat context.

---

## Notes

- Spectators can browse free agents but cannot claim
- Waiver type (standard vs FAAB) affects claim UI — FAAB shows bid input
