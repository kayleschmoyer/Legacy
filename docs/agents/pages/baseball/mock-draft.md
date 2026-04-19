# Mock Draft Simulator — Reference

**Route**: `/baseball/mock-draft`  
**File**: `apps/web/src/pages/draft/MockDraftPage.tsx`

---

## Premium Gate

Entire page is wrapped in `PremiumGate`. Non-premium users see an upgrade modal:

- Feature name: "Mock Draft Simulator"
- Description: "Practice your draft strategy with the full Mock Draft simulator before the real draft."
- Upsell CTA button

---

## Setup Screen (pre-draft)

### Header

- Practice mode badge (red, baseball emoji)
- Title: "Mock Draft Simulator" (36px, gold, weight 800)
- Description: "Practice your draft strategy against AI opponents without affecting any real league."

### Settings Card

| Setting              | Options                     | Default | Selection Style                       |
| -------------------- | --------------------------- | ------- | ------------------------------------- |
| Number of Teams      | 4 · 6 · 8 · 10 · 12         | 8       | Red border + background when selected |
| Rounds (Roster Size) | 5 · 8 · 10 · 15             | 10      | Green border + background             |
| Your Draft Position  | 1–N (where N = numTeams)    | 1       | Gold border + background              |
| Draft Order          | Snake · Linear              | Snake   | Gold border + background              |
| Player Pool          | All MLB · NL Only · AL Only | All MLB | Gold border + background              |

**Draft position helper text**: Dynamically explains which picks user gets.  
Examples: "Snake draft — you pick first every odd round" · "at position 5 every round"

**Auto-adjustment**: When numTeams changes, `userPickPosition` is clamped to valid range.

### Footer Info Line

"Mock drafts don't affect any real leagues • AI opponents use ADP-based strategy"

---

## Actions

| Button           | Behavior                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Start Mock Draft | Validate → call `useInitializeMockDraftMutation` → navigate to `/baseball/league/{id}/draft` |
| Cancel           | Navigate to `/baseball`                                                                      |

---

## GraphQL

**Mutation**: `useInitializeMockDraftMutation`  
Input variables:

- `numTeams: number` (4–12)
- `rosterSize: number` (5–15)
- `userPickPosition: number` (1–numTeams)
- `pickTimeLimitSeconds: number` (hardcoded: 90)
- `draftOrder: 'snake' | 'linear'`
- `playerPool: 'all' | 'nl' | 'al'`

Returns: `{ initializeMockDraft: { leagueId: number } }`

No queries — setup screen fetches no data.

---

## After Draft Starts

On mutation success, navigates to `/baseball/league/{leagueId}/draft` — same Live Draft Board page. AI opponents make picks automatically using ADP-based strategy. All draft board features apply (see [live-draft-board.md](./live-draft-board.md)).

---

## States

| State              | Display                                           |
| ------------------ | ------------------------------------------------- |
| Not premium        | Full-page premium gate modal                      |
| Loading (mutation) | "⏳ Starting…" button text, disabled, opacity 0.6 |
| Error              | Red error box above buttons with `error.message`  |
| Default            | All settings at defaults, Start button enabled    |
