# Join Season Draft Game — Reference

**Route**: `/games/season-draft/join/:inviteCode`  
**File**: `apps/web/src/pages/games/SeasonDraftJoinPage.tsx`

---

## Layout

### Invalid Invite Code State

When no `inviteCode` in URL:

- Red error text: "Invalid invite link."

### Valid Invite Code — Game Details Card

**Loading**: Centered spinner + "Loading game info…"

**Not Found**: Red error text "This invite link is invalid or the game no longer exists." + "Browse Games" button

**Game Info (loaded)**:

| Field         | Display                       |
| ------------- | ----------------------------- |
| `name`        | Game name (bold, large)       |
| `playerType`  | "Hitters" or "Pitchers"       |
| `statKey`     | Stat label (HR, SO, etc.)     |
| `gameMode`    | "Career" or "Season"          |
| `playerCount` | "{count} of 6 players joined" |

---

## Status-Based Warnings

| Status                    | Warning                                     |
| ------------------------- | ------------------------------------------- |
| `drafting`                | Amber: "This game has already started."     |
| `completed` / `cancelled` | "This game is no longer accepting players." |
| `setup`                   | No warning — join button enabled            |

---

## Actions

| Button                     | Behavior                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Cancel                     | Navigate to `/games/season-draft`                                                  |
| "Browse Games" (not found) | Navigate to `/games/season-draft`                                                  |
| Join Game                  | Call `useJoinSeasonDraftGameMutation` → navigate to `/games/season-draft/{gameId}` |

**Join button disabled**: When `joining` OR `status !== 'setup'`

---

## GraphQL

| Hook                                                     | Purpose                                     |
| -------------------------------------------------------- | ------------------------------------------- |
| `useGetSeasonDraftGameByInviteCodeQuery({ inviteCode })` | Load game info — skipped if no `inviteCode` |
| `useJoinSeasonDraftGameMutation({ inviteCode })`         | Join game — returns game ID                 |

**Join error handling**:

- "already started" → "This game has already started and is no longer accepting players."
- "full" → "This game is already full."
- Default → "Failed to join game. Please try again."

---

## States

| State             | Display                             |
| ----------------- | ----------------------------------- |
| Loading           | Spinner + "Loading game info…"      |
| Not found         | Red error + Browse Games button     |
| Game full/started | Warning card + Join button disabled |
| Joining           | "Joining…" button text, disabled    |
| Join error        | Red error text                      |
