# Create Season Draft Game — Reference

**Route**: `/games/season-draft/create`  
**File**: `apps/web/src/pages/games/SeasonDraftGameCreatePage.tsx`

---

## Layout (in order)

1. Header block — "🏆 New Season Draft Game" title + subtitle
2. Form card — "Game Settings"
3. Error message (conditional)
4. Action buttons — Cancel + Create Game

---

## Form Fields

| Field        | Type                   | Options                 | Notes                                           |
| ------------ | ---------------------- | ----------------------- | ----------------------------------------------- |
| `gameName`   | text                   | —                       | Required; placeholder "e.g., HR Challenge 2025" |
| `playerType` | toggle                 | Hitter / Pitcher        | Switching auto-changes `statKey` default        |
| `gameMode`   | toggle                 | Season / Career w/ Team | Helper text explains each                       |
| `statKey`    | button group (dynamic) | See below               | Options change based on `playerType`            |

**Hitter stat options**: `hr, h, rbi, sb, r, doubles, triples, bb, tb`  
**Pitcher stat options**: `w, so, sv, sho, cg`

---

## Stat Key Labels

`HR · H · RBI · SB · R · Doubles · Triples · BB · TB · W · SO · SV · SHO · CG`

---

## Actions

| Button                                                   | Behavior                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Cancel                                                   | Navigate to `/games/season-draft`                                                    |
| Create Game (disabled until `gameName.trim()` has value) | Call `useCreateSeasonDraftGameMutation` → navigate to `/games/season-draft/{gameId}` |

---

## GraphQL

**Mutation**: `useCreateSeasonDraftGameMutation()`  
Variables: `{ name, statKey, gameMode, playerType }`  
On success: navigate to `/games/season-draft/{gameId}`

---

## States

| State           | Display                           |
| --------------- | --------------------------------- |
| Submit loading  | "Creating…" button text, disabled |
| Error           | Red error text below form         |
| Create disabled | When `gameName.trim()` is empty   |

---

## Notes

- Switching `playerType` from Hitter → Pitcher auto-sets `statKey` to `'w'`
- Switching to Hitter auto-sets `statKey` to `'hr'`
