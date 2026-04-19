# Season Draft Game Lobby — Reference

**Route**: `/games/season-draft`  
**Component**: `SeasonDraftGameLobby` (`lib/shared-components/src/features/season-draft/SeasonDraftGameLobby.tsx`)

---

## Layout (in order)

1. Header bar — Back button (conditional) · "Season Draft Games" title (centered) · "+ New Game" button (gold, right)
2. Empty state (when no games)
3. Active Games section
4. Past Games section
5. Refresh button

---

## Game Card Fields

| Field        | Description                                                                          |
| ------------ | ------------------------------------------------------------------------------------ |
| `name`       | Game name (bold, 18px)                                                               |
| `playerType` | Hitter / Pitcher                                                                     |
| `statKey`    | Stat being drafted (HR, H, RBI, SB, R, Doubles, Triples, BB, TB, W, SO, SV, SHO, CG) |
| `gameMode`   | Season / Career w/ Team                                                              |
| `status`     | Setup · In Progress · Completed · Cancelled                                          |
| `isMyTurn`   | Shows gold "YOUR TURN" badge when `isMyTurn && status === 'drafting'`                |

**Status colors**: Setup → amber · In Progress → green · Completed → blue · Cancelled → muted

---

## Sections

| Section                                                     | Condition                                 |
| ----------------------------------------------------------- | ----------------------------------------- |
| Empty state (trophy emoji + "No games yet" + Create button) | `games.length === 0`                      |
| Active Games                                                | Any game with active status               |
| Past Games                                                  | Any game with past status (muted opacity) |

---

## Actions

| Action         | Behavior                                                            |
| -------------- | ------------------------------------------------------------------- |
| Back button    | `onBack()` callback                                                 |
| "+ New Game"   | `onCreateGame()` → navigate to `/games/season-draft/create`         |
| Game card tap  | `onSelectGame(gameId)` → navigate to `/games/season-draft/{gameId}` |
| Refresh button | `refetch()`                                                         |

---

## GraphQL

**Query**: `useGetSeasonDraftGamesQuery()`  
Returns: `{ id, name, status, statKey, gameMode, playerType, isMyTurn }`

---

## States

| State                    | Display                                            |
| ------------------------ | -------------------------------------------------- |
| Loading (no cached data) | Full-screen spinner + "Loading games…"             |
| Empty                    | Trophy emoji + "No games yet" + Create Game button |
