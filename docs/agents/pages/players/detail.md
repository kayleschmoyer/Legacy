# Player Detail Page — Reference

**Route**: `/players/:id`  
**File**: `apps/web/src/pages/players/PlayerStatsPage.tsx` (bottom `PlayerDetailPage` export)  
**Also opened as modal** from: player-stats, player-comparison, matchup-detail, roster views

---

## Layout (in order)

1. Back button — "← Back" (navigate back or fallback to `/players/stats`)
2. `PlayerDetailModal` — auto-opened as full-page modal

### Modal Header

- Player name (resolved from query)
- "{n} seasons" subtitle
- Position badge (color-coded by position)

### Modal Content

**Loading**: Spinner + "Loading player statistics…"  
**Error**: Red error banner with message  
**Empty**: "No season statistics found"

**When data loaded (in order)**:

1. **Eligible Positions row** — All position badges
2. **Hero Stats chips**:
   - Hitters: AVG · HR · RBI
   - Pitchers: W-L · SO
3. **Career Summary Cards**:
   - _Career Batting_ (hitters): Games · Batting Average (accent) · Home Runs · RBI · Hits · Stolen Bases
   - _Career Pitching_ (pitchers): Games · Record (accent, e.g., "245–198") · Innings Pitched · Strikeouts
4. **Tab bar** — dynamically built from available data
5. **Tab content**

---

## Tabs

| Tab        | Condition                           | Content                                                         |
| ---------- | ----------------------------------- | --------------------------------------------------------------- |
| Career Arc | `hasBattingArc \|\| hasPitchingArc` | Recharts line graph; Batting/Pitching toggle if player has both |
| Batting    | `battingTableRows.length > 0`       | Season batting stats table                                      |
| Pitching   | `pitchingTableRows.length > 0`      | Season pitching stats table                                     |
| Fielding   | `fieldingTableRows.length > 0`      | Season fielding stats table                                     |

If current tab becomes unavailable, auto-switches to first available tab.

---

## Season Batting Table

Newest-first. Columns: `YEAR · G · PA · AB · H · HR · RBI · SB · AVG · OBP · SLG`

Calculated on-the-fly:

- AVG = H / AB
- OBP = (H + BB) / PA
- SLG = (HR×4 + H) / AB

---

## Season Pitching Table

Columns: `YEAR · G · W-L · ERA · IP · SO · BB · WHIP`

ERA calculation: `(ER × 9) / decimalInnings` using `ipToDecimalInnings()` utility.

---

## Season Fielding Table

Columns: `YEAR · POS · G · INN · PO · A · E`

---

## Career Arc Chart

- Lazy-loaded Recharts line graph
- Shows stat trend over seasons
- Toggle: "Batting" / "Pitching" (only if player has both)

---

## GraphQL

| Hook                              | Purpose                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `useGetAllPlayerSeasonStatsQuery` | Season stats — variables: `{ playerId }` — skip if no ID or modal closed |
| `useGetPlayerCareerArcQuery`      | Career trend data for graph                                              |

Both use Apollo `previousData` to prevent re-flicker when switching players (LS-2308 optimization).

---

## Back Navigation

- If navigated from within the app: `navigate(-1)` (browser back)
- If opened directly via URL: `location.key === 'default'` → fallback to `/players/stats`

---

## States

| State                       | Display                                                   |
| --------------------------- | --------------------------------------------------------- |
| Loading (no prior data)     | Spinner + "Loading player statistics…"                    |
| Loading (prior data exists) | Previous player data shown while new loads (zero-flicker) |
| Error                       | Red error banner                                          |
| No seasons                  | "No season statistics found"                              |
| No career totals            | Career summary cards hidden                               |

---

## Notes

- Position colors: each position gets a specific background color via `getPositionColor()`
- Seasons sorted newest-first
- No premium gate on this page; accessible to all authenticated users
