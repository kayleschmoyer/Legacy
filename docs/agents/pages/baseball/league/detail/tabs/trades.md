# League Detail — Trades Tab

**Parent page**: [League Detail](../index.md)  
**Tab key**: `trades`  
**Visibility**: All users (non-members see empty state)

---

## Non-Member Empty State

Condition: `!userTeamId`

- Card with ArrowLeftRight icon
- Message: "Join this league to view and submit trade offers"

---

## Trading Center _(members only)_

**Component**: `TradingCenter` (wrapper for shared-components TradingCenter)

### Sections

| Section          | Description                            |
| ---------------- | -------------------------------------- |
| Pending Offers   | Incoming and outgoing trade proposals  |
| Submit New Trade | Team selection + player swap interface |
| Completed Trades | History of accepted/rejected trades    |

### Per Pending Offer

- Offering team name + players offered
- Receiving team name + players requested
- Accept / Reject buttons (if user is receiving party)
- Withdraw button (if user is offering party)
- Timestamps

### Submit New Trade Flow

1. Select target team from dropdown
2. Select players to offer (from user's roster)
3. Select players to request (from target team's roster)
4. Submit proposal
5. Target team receives notification (WebSocket)

---

## Real-Time

Trade notifications delivered via WebSocket (`LeagueWebSocketContext`). Pending offers update in real-time when other teams respond.

---

## GraphQL

Custom trading queries and mutations (internal to `TradingCenter` component):

- Fetch pending offers for user's team
- Fetch completed trade history
- `useProposeTradeMutation` — submit trade offer
- `useAcceptTradeMutation` — accept incoming trade
- `useRejectTradeMutation` — reject incoming trade
- `useWithdrawTradeMutation` — cancel own proposal
