# Feature: Submit New Trade Offer

**Jira:** LS-5678
**Page:** `trade-center` (Epic LS-5299)
**Platforms:** web, mobile-web, android
**Entitlement:** all

## Description

Build and submit a new trade offer via the shared `TradingCenter` component. The
feature is a 4-step dialog (Propose Trade) that allows a team member to:

1. Select a target team from the other teams in the league.
2. Choose one or more players from their own roster to offer.
3. Choose one or more players from the target team's roster to request.
4. Optionally add a message and expiry, then confirm and send.

On Android the player-selection lists use touch-optimized press feedback
(`pressStyle` / `animation="quick"`). Submission fires the `ProposeTrade`
GraphQL mutation and optimistically writes the new offer into the Apollo cache
(both `GetTeamTradeOffers` and `GetLeagueTradeOffers`).

## Source

Extracted from: `docs/agents/pages/baseball/league/detail/tabs/trades.md`

## Implementation

**Component:** `lib/shared-components/src/features/leagues/TradingCenter.tsx`

The `ProposeTradeDialog` sub-component (internal to `TradingCenter`) manages the
four-step flow with local React state (`step`, `draft`). The parent `TradingCenter`
passes `leagueId`, `userTeamId`, and `isPastDeadline` in.

| Step          | State value | Key data loaded                        |
| ------------- | ----------- | -------------------------------------- |
| Team          | `"team"`    | `GetLeagueTeams` — other teams         |
| Your Players  | `"offer"`   | `GetTeamMembers(userTeamId)` lazy      |
| Their Players | `"request"` | `GetTeamMembers(receivingTeamId)` lazy |
| Confirm       | `"confirm"` | local draft state + optional message   |

**GraphQL mutation:** `ProposeTrade` (variables: `leagueId`, `receivingTeamId`,
`offeringPlayerIds`, `requestingPlayerIds`, `message?`, `expiresInDays?`).

**Cache update:** the `update` callback on the mutation writes the returned
`TradeOffer` fragment into both `GetTeamTradeOffers` (pending list) and
`GetLeagueTradeOffers` (commissioner + history view) without a network refetch.

**Trade deadline guard:** when `isPastDeadline === true` the "Propose Trade"
button is disabled and the submit step shows a warning banner; `handleSubmit`
also short-circuits with an error message.

## Platform coverage

| Platform | Harness    | Spec / Flow                                       | Status  |
| -------- | ---------- | ------------------------------------------------- | ------- |
| web      | Playwright | `apps/web-e2e/src/tests/submit-new-trade.spec.ts` | covered |
| android  | Maestro    | `maestro/flows/trade-center/trade-center.yaml`    | pending |

The Maestro flow opens the Propose Trade dialog and steps to team selection with
before/after screenshots; it does not yet assert the full 4-step submit journey,
so android stays `pending` until it does.

## Test Coverage

### Unit tests

File: `lib/shared-components/src/features/leagues/TradingCenter.spec.tsx`

`describe('TradingCenter — ProposeTradeDialog (LS-5678)')`:

- "Propose Trade" button is rendered when trade deadline is not past
- "Propose Trade" button is disabled when trade deadline has passed
- Dialog opens when "Propose Trade" is clicked
- Dialog shows the team-selection step first
- Clicking a team advances to the offer (player) step
- Clicking a player selects it and reveals the "Next" button
- Clicking "Next" advances to the request step
- Clicking a request player reveals "Review Trade" button
- Clicking "Review Trade" advances to the confirm step
- Confirm step renders the "Send Trade Offer" button (enabled)
- Submitting calls `useProposeTradeMutation` with correct variables
- Dialog closes on successful submission
- Error message shown on mutation failure
- "Send Trade Offer" button is disabled past trade deadline

### E2E tests (hermetic)

File: `apps/web-e2e/src/tests/submit-new-trade.spec.ts`

`describe('Submit New Trade Offer @regression')`:

- "Propose Trade" button is visible on the Trades tab
- Clicking "Propose Trade" opens the dialog
- Dialog shows "Select the team you want to trade with"
- Clicking a team button advances to the player-offer step
- Selecting an offering player shows the "Next — Select Their Players" button
- Navigating to request step shows the "give you" instruction
- Selecting a requesting player shows "Review Trade" button
- Review step shows "Send Trade Offer" button
- Submitting a valid trade closes the dialog
- Outgoing offer appears after successful submission

## Related

- **Epic:** LS-5299 — Trade Center (Standalone) QA
- **Implementation ref:** `docs/agents/pages/baseball/league/detail/tabs/trades.md`
- **Integration test (live backend):** `apps/web-e2e/src/integration/tests/trade-flow-ui.integration.spec.ts`
  — Phases 5–9 cover the full commissioner→manager→accept lifecycle via real API.
