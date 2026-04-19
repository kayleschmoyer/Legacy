# Disclosure Game ("Who Am I?") — Reference

**Route**: `/games/disclosure`  
**Component**: `DisclosureGame` (`lib/shared-components/src/features/disclosure-game/DisclosureGame.tsx`)

---

## Game Flow

Three phases: **Idle** → **Playing** → **Result**

---

## Idle Phase

- Title: "Who Am I?"
- Description: "Baseball player facts are revealed one at a time. Guess the player with as few clues as possible for a higher score."
- **Buttons**: "Start Game" · Back

---

## Playing Phase

### Header Row

- "Who Am I?" title (left)
- Clue counter "{revealed}/{total}" (right, gray)

### Error Banner

- Red text — shown when `errorMsg` is set

### Clue Feed (scrollable)

- "Reveal the first clue to begin." (if no clues yet)
- Per revealed clue:
  - Metadata: "Clue {index} · {difficultyTier}" (small, gray)
  - Clue text (body size)
  - Gray background card

### Controls

| Control               | Condition                          | Detail                                                   |
| --------------------- | ---------------------------------- | -------------------------------------------------------- |
| "Next Clue" button    | `canReveal` (more clues available) | Shows "Revealing…" when loading                          |
| Guess text input      | After first clue revealed          | "Type player name…"                                      |
| Autocomplete dropdown | Suggestions exist                  | Player name suggestions                                  |
| "Submit Guess" button | Player selected                    | Disabled when no player or `guessing`; shows "Checking…" |
| "Give Up" button      | After first clue revealed          | Red theme; shows "Giving up…" when loading               |

---

## Result Phase

| Outcome    | Emoji | Headline                |
| ---------- | ----- | ----------------------- |
| `won`      | 🏆    | "Correct!"              |
| `given_up` | 🏳️    | "Better luck next time" |
| `lost`     | ❌    | "Out of clues"          |

**Data shown**:

- Score in points (only when `won`, blue text)
- "Clues used: {used} / {total}"
- "Correct player ID: {id}" (if `correctPlayerId` present)

**Buttons**: "Play Again" (resets to Idle) · Back

---

## Scoring

Higher score for fewer clues used. Score returned from `useSubmitGuessMutation`.

---

## GraphQL

| Hook                                                               | Purpose                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `useStartDisclosureGameMutation()`                                 | Start session — returns `{ sessionId, totalClues }`                              |
| `useNextClueMutation({ sessionId })`                               | Reveal next clue — returns `{ clueText, difficultyTier, clueIndex, isLastClue }` |
| `useSearchPlayersForDisclosureLazyQuery({ searchTerm, limit: 8 })` | Player search autocomplete (min 2 chars)                                         |
| `useSubmitGuessMutation({ sessionId, guessedPlayerId })`           | Submit guess — returns `{ correct, score, cluesUsed, correctPlayerId }`          |
| `useGiveUpDisclosureGameMutation({ sessionId })`                   | Give up — returns `{ correctPlayerId }`                                          |

---

## Error Messages

| Action      | Error Text                                       |
| ----------- | ------------------------------------------------ |
| Start       | "Could not start a game. Please try again."      |
| Next clue   | "Could not reveal clue. Please try again."       |
| Search      | "Could not search players. Please try again."    |
| Wrong guess | "Wrong guess — reveal more clues and try again." |
| Submit      | "Could not submit guess. Please try again."      |
| Give up     | "Could not give up. Please try again."           |

---

## States

| State            | Display                       |
| ---------------- | ----------------------------- |
| Starting         | "Starting…" button            |
| Revealing clue   | "Revealing…" button           |
| Searching        | "Searching…" text below input |
| Submitting guess | "Checking…" button            |
| Giving up        | "Giving up…" button           |
