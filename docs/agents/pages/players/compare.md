# Player Comparison Page — Reference

**Route**: `/players/compare`  
**File**: `apps/web/src/pages/players/PlayerComparisonPage.tsx`

---

## Premium Gate

Entire comparison feature wrapped in `PremiumGate`:

- Feature name: "Player Comparison"
- Description: "Compare up to 4 players side-by-side with career stats, scoring projections, and season breakdowns."

Unauthenticated users see a full-page lock screen with "Get Started Free" button.

---

## Layout (in order)

1. Page header — icon + "Compare Players" title + subtitle "Compare up to 4 players side-by-side…"
2. Separator
3. Player selection controls (search + chips)
4. Comparison table (when 2+ players selected)
5. Season-by-season breakdown (when 2+ players selected)
6. Empty state (when 0 players selected)

---

## Player Selection

- Search input (min 2 chars) → dropdown autocomplete (8 results max)
- Select player → adds to next empty slot (max 4)
- Per selected player: colored chip with name + X remove button
- Input disabled when 4 players selected
- "Add at least 2 players…" message when < 2 selected

**Player accent colors**:

| Slot | Color                  |
| ---- | ---------------------- |
| 0    | `#C5A55A` (BRAND_GOLD) |
| 1    | `#60A5FA` (blue)       |
| 2    | `#34D399` (green)      |
| 3    | `#F87171` (red)        |

---

## Comparison Table Sections

### Fantasy Scoring Projections

`Fantasy Score · Avg Pts/Game · Hitter Score · Pitcher Score · Field Score`

### Career Batting

`Games · Hits · Home Runs · RBI · Runs · Stolen Bases · Walks · Total Bases · oWAR · Avg Season AVG · Avg Season OBP · Avg Season SLG`

### Career Pitching _(only if any selected player is a pitcher)_

`Games · Wins · Losses · Saves · Strikeouts · Walks · Win% · ERA`

### Career Achievements

`All-Star Selections · MVP Awards · Cy Young Awards · Gold Gloves · Silver Sluggers · World Series Rings`

**"BEST" indicator**: Upward triangle + "BEST" label on the column with highest value per row.

---

## Season-by-Season Breakdown

Per selected player (color-coded header):

**Batting table** (hitters): `YEAR · G · PA · AB · H · HR · RBI · SB · AVG · OBP · SLG`  
**Pitching table** (pitchers): `YEAR · G · W-L · ERA · IP · SO · BB · WHIP`

---

## GraphQL

| Hook                                  | Purpose                                           |
| ------------------------------------- | ------------------------------------------------- |
| `useGetPlayersWithStatsQuery`         | Player search — variables: `{ search, limit: 8 }` |
| `useGetAllPlayerSeasonStatsQuery` × 4 | Season stats per slot — skip if slot empty        |

---

## States

| State           | Display                                                   |
| --------------- | --------------------------------------------------------- |
| Unauthenticated | Full-page lock screen                                     |
| Not premium     | Premium gate modal                                        |
| 0 players       | Large dashed empty state card                             |
| 1 player        | Selection controls only; "Add at least 2 players" message |
| 2–4 players     | Full comparison table + season breakdown                  |
| 4 players       | Search input disabled                                     |
| Player loading  | Spinner in table cells                                    |
