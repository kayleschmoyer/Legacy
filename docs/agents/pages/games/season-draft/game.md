# Season Draft Game (Active) — Reference

**Route**: `/games/season-draft/:gameId`  
**Component**: `SeasonDraftGame` (`lib/shared-components/src/features/season-draft/SeasonDraftGame.tsx`)

---

## Phases

The game renders different UI based on `status`:

| Status      | UI Shown                                                         |
| ----------- | ---------------------------------------------------------------- |
| `setup`     | Setup phase (invite + wait)                                      |
| `drafting`  | Draft interface (if `isMyTurn`) + scoreboard + rosters + history |
| `completed` | Scoreboard + rosters + history (read-only)                       |
| `cancelled` | Cancelled banner                                                 |

---

## Header (always visible)

- Back button (conditional)
- Game name (centered H2)
- Metadata: Pitcher/Hitter Draft · Stat label · Season/Career mode
- Current turn: "Turn: {PlayerName}" or status indicator

---

## Setup Phase (`status === 'setup'`)

Yellow background card:

| Element                        | Detail                                         |
| ------------------------------ | ---------------------------------------------- |
| Invite link                    | Monospace URL + "Copy Link" / "Copied!" button |
| Players joined                 | "{player1}, {player2}… ({count}/6)"            |
| Warning (creator, < 2 players) | "Share the invite link above…"                 |
| Waiting message (non-creator)  | Shown when waiting for others                  |

**Creator-only buttons**:

- "Start Draft" (green, disabled if < 2 players)
- "Cancel Game" (red)

---

## Draft Interface (`isMyTurn && status === 'drafting'`)

### Player Search Card

- "Search player name…" input
- Dropdown suggestions (max 10): player name + stats load status
- "Loading stats for {name}… Please wait." (orange card, if stats loading)

### Team/Season Picker _(hidden in `isMostTeamsMode`)_

- Label: "Select Team:" (career_team) or "Select Season:" (season)
- Scrollable horizontal button row of selectable options
- "Loading options…" while fetching

### Position Selection

- Label: "Pitcher Slot:" or "Position to Fill:"
- Scrollable horizontal button row (unfilled slots only)
- Format: "{position}" or "{position} {slotNumber + 1}"

### Preview Card _(blue, shown when `previewStatValue !== null`)_

- "Preview: {value} {statLabel}"
- Red warning if value === 0

### Submit

- "Confirm Pick" button (green)
- Disabled until: player selected + slot selected + option selected (if required) + not submitting

---

## Scoreboard Card (always visible during/after draft)

- Sorted by `totalScore` descending
- Per player: ranking · name · total score

---

## Rosters Card

Per player:

- Player name + total score
- Roster slots: position label · baseball player name (+ season/team) · stat value
- Green background if filled, gray if empty

---

## Draft History Card

Per pick: pick number · drafting player name · baseball player name · season/team · stat value  
"No picks yet" if empty.

---

## GraphQL

| Hook                                                                                                           | Purpose                                                                               |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `useGetSeasonDraftGameQuery({ gameId })`                                                                       | Full game state — polled every 5s while `status === 'setup'` or `'drafting'`          |
| `useSearchPlayersForDraftLazyQuery({ search, limit: 10 })`                                                     | Player name autocomplete                                                              |
| `useGetSeasonDraftGamePlayerOptionsLazyQuery({ playerId, gameMode, playerType })`                              | Team/season options for selected player                                               |
| `useGetSeasonDraftGameStatValueLazyQuery({ playerId, season, position, statKey, playerType, gameMode, team })` | Preview stat value                                                                    |
| `useMakeSeasonDraftPickMutation`                                                                               | Submit pick — variables: `{ gameId, rosterSlotId, playerId, season, position, team }` |
| `useTriggerSeasonDraftStatLoadingMutation({ playerId })`                                                       | Trigger stat loading; WebSocket notifies completion                                   |
| `useStartSeasonDraftGameMutation({ gameId })`                                                                  | Start draft (creator)                                                                 |
| `useCancelSeasonDraftGameMutation({ gameId })`                                                                 | Cancel game (creator)                                                                 |

---

## Actions

| Action                | Behavior                                                       |
| --------------------- | -------------------------------------------------------------- |
| Copy invite link      | Copy to clipboard, show "Copied!"                              |
| Start Draft (creator) | `useStartSeasonDraftGameMutation`                              |
| Cancel Game           | Opens confirmation dialog → `useCancelSeasonDraftGameMutation` |
| Player search         | Debounced (300ms) → suggestions dropdown                       |
| Select player         | Fetch options + trigger stat loading if needed                 |
| Select team/season    | `setSelectedOption(option)`                                    |
| Select position       | `setSelectedSlotId` + `setSelectedPosition`                    |
| Confirm Pick          | `useMakeSeasonDraftPickMutation`                               |

---

## States

| State           | Display                               |
| --------------- | ------------------------------------- |
| Initial load    | Spinner + "Loading game…"             |
| Game not found  | "Game not found" + Back button        |
| Cancelled       | Red "Game Cancelled" card             |
| Draft error     | Inline red card + dismiss button      |
| Stats loading   | Orange spinner card                   |
| Options loading | "Loading options…"                    |
| Submitting pick | Confirm Pick disabled + spinner       |
| Not my turn     | "Waiting for {PlayerName}…" indicator |
| My turn         | Green "Your Turn!" indicator          |
