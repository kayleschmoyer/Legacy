# Feature: Draft Settings Section

**Jira:** LS-5367
**Page:** `create-league-baseball` (Epic LS-5262)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

The Draft Settings section of the Create Baseball League form lets a
commissioner configure how the league's draft will run: draft mode
(live/automated), selection method (standard/auction/random), draft order
(snake/linear), auction budget/minimum bid (auction only), pick-timer length
(live drafts only), and an optional draft date/time.

Selecting "Automated" for draft mode forces the selection method to
"Random" and shows a dismissible reset notice if a different method was
previously chosen. Auction budget/min-bid inputs only render when
"Auction" is the selection method and the draft is not automated. The pick
timer only renders for live drafts.

## Source

Extracted from: `docs/agents/pages/baseball/league/create.md`

## Implementation

**Component:** `apps/web/src/pages/baseball/LeagueCreatePage.tsx` — Draft
Settings is `CollapsibleSection` `id="draft"` (section 4).

**Draft date/time control:** `DateTimePicker` from
`lib/shared-components/src/components/DateTimePicker.tsx`, rendered with
`useNativeInput={false}` (the custom calendar/time popover, not the native
`<input type="datetime-local">` variant).

**Form state:** `draftMode`, `selectionMethod`, `draftOrder`, `auctionBudget`,
`auctionMinBid`, `pickTimeLimitSeconds`, `draftDate` on `CreateLeagueFormData`.
Selecting `draftMode: 'automated'` forces `selectionMethod` to `'random'`
(see `handleInputChange` in `LeagueCreatePage.tsx`).

## Test Coverage

### E2E tests (hermetic)

Files: `apps/web-e2e/src/tests/league-creation.spec.ts`,
`apps/web-e2e/src/tests/league-creation-advanced.spec.ts`

- Selecting "Automated Draft" during league creation and submitting persists
  the draft mode through the create-league mutation
- Draft settings selections (e.g. draft mode) survive unrelated form-state
  changes
- Live Draft / Automated Draft options are both visible
- Selecting Automated Draft disables selection-method buttons and forces
  "Random"; switching back to Live Draft re-enables them
- Standard, Auction, and Random selection methods are all visible
- Selecting Auction reveals the Auction Budget / Minimum Bid inputs
- **Selecting Auction is reflected in the Draft Settings collapsed summary
  (`formData.selectionMethod` persisted) — LS-5367**
- Snake and Linear draft order options are both visible
- **Selecting Linear draft order is reflected in the Draft Settings collapsed
  summary (`formData.draftOrder` persisted) — LS-5367**
- Draft Date & Time picker renders its placeholder trigger fields
- Timezone label is shown before a draft date is selected
- **Selecting a draft date/time via the calendar popover reflects the choice
  as resolved Local/UTC timestamp lines (`formData.draftDate` persisted) —
  LS-5367**

## Related

- **Epic:** LS-5262 — QA — Page: Create League — Baseball
- **Implementation ref:** `docs/agents/pages/baseball/league/create.md`
