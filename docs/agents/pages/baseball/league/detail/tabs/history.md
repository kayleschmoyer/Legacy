# League Detail — History Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `history`  
**Visibility**: All users

---

## Sections

1. Season Selector
2. Season Standings (for selected season)
3. All-Time Records

---

## Season Selector

- Dropdown (or button row) of past seasons
- Per season: season year + frozen status
- Default: most recent frozen season

---

## Season Standings

For the selected past season:

| Column         | Description          |
| -------------- | -------------------- |
| Team           | Team name + logo     |
| W              | Wins                 |
| L              | Losses               |
| T              | Ties                 |
| Win%           | Win percentage       |
| Points For     | Total points scored  |
| Points Against | Total points allowed |

---

## All-Time Records

Four record cards:

| Record                       | Icon       | Fields                              |
| ---------------------------- | ---------- | ----------------------------------- |
| Highest Single-Matchup Score | Zap        | Record holder, value, date achieved |
| Most Wins in a Season        | Trophy     | Record holder, value, date achieved |
| Most Points in a Season      | TrendingUp | Record holder, value, date achieved |
| Longest Win Streak           | Flame      | Record holder, value, date achieved |

---

## Actions

| Action          | Behavior                                    |
| --------------- | ------------------------------------------- |
| Season selector | Switch displayed standings to selected year |

---

## GraphQL

| Hook                         | Data                          |
| ---------------------------- | ----------------------------- |
| `useGetLeagueHistoryQuery`   | List of past seasons          |
| `useGetLeagueStandingsQuery` | Standings for selected season |
| `useGetAllTimeRecordsQuery`  | All-time record holders       |
