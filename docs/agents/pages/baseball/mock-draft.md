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

| Setting             | Options                     | Default | Selection Style                       |
| ------------------- | --------------------------- | ------- | ------------------------------------- |
| Number of Teams     | 4 · 6 · 8 · 10 · 12         | 8       | Red border + background when selected |
| Your Draft Position | 1–N (where N = numTeams)    | 1       | Gold border + background              |
| Draft Order         | Snake · Linear              | Snake   | Gold border + background              |
| Player Pool         | All MLB · NL Only · AL Only | All MLB | Gold border + background              |

**Draft position helper text**: Dynamically explains which picks user gets.  
Examples: "Snake draft — you pick first every odd round" · "at position 5 every round"

**Auto-adjustment**: When numTeams changes, `userPickPosition` is clamped to valid range.

### Footer Info Line

"Mock drafts don't affect any real leagues • AI opponents use ADP-based strategy"

---

## Actions

| Button           | Behavior                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Start Mock Draft | Validate → call `useCreateMockDraftMutation` → navigate to `/baseball/mock-draft/{draftId}` |
| Cancel           | Navigate to `/baseball`                                                                     |

---

## GraphQL

**Mutation**: `useCreateMockDraftMutation` (LS-10076 — replaces
`initializeMockDraft`, which created a throwaway league)  
Input variables:

- `sport: Sport` (BASEBALL | FOOTBALL)
- `numTeams: number` (2–12)
- `pickPosition: number` (1–numTeams)
- `pickTimeLimitSeconds: number` (ONLINE only; hardcoded: 90)
- `draftOrder: 'snake' | 'linear'`
- `playerPool: 'all' | 'nl' | 'al'`
- `mode: MockDraftMode` (OFFLINE | ONLINE)
- `controlAllTeams: boolean`, `isPublic: boolean`

Returns: `{ createMockDraft: { draftId, inviteCode, webSocketReady } }`

Roster size is **not** an input: a mock draft always runs the sport's default
roster (LS-10086).

**Query**: `GetMyMockDraftUsage` for the free-tier weekly allowance.

---

## After Draft Starts

On mutation success, navigates to `/baseball/mock-draft/{draftId}` — the same
draft board, loaded from `draftRoom(draftId)` rather than a league (LS-10076).
A mock draft creates no league, team or roster row. AI opponents make picks
automatically using ADP-based strategy; all draft board features apply (see
[live-draft-board.md](./live-draft-board.md)).

An ONLINE draft lands on its lobby (`MockDraftLobby`) until the host starts it;
joiners reach the same route via `joinMockDraft`, which returns the draft id.

---

## States

| State              | Display                                           |
| ------------------ | ------------------------------------------------- |
| Not premium        | Full-page premium gate modal                      |
| Loading (mutation) | "⏳ Starting…" button text, disabled, opacity 0.6 |
| Error              | Red error box above buttons with `error.message`  |
| Default            | All settings at defaults, Start button enabled    |
