export type TradeSystemMessageAction =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'vetoed';

// One template per action so each sentence names the correct actor and
// counterparty (LS-10679: cancelled used to name the proposer twice).
const TRADE_MESSAGE_TEMPLATES: Record<
  TradeSystemMessageAction,
  (proposingTeamName: string, receivingTeamName: string) => string
> = {
  proposed: (p, r) => `🔁 ${p} proposed a trade to ${r}`,
  accepted: (p, r) => `✅ ${r} accepted a trade with ${p}`,
  rejected: (p, r) => `❌ ${r} rejected a trade from ${p}`,
  cancelled: (p, r) => `↩️ ${p} cancelled their trade offer to ${r}`,
  vetoed: (p, r) => `🚫 Commissioner vetoed the trade between ${p} and ${r}`,
};

/** Text of the league-chat system message posted for a trade action. */
export function buildTradeSystemMessageText(
  action: TradeSystemMessageAction,
  proposingTeamName: string,
  receivingTeamName: string,
): string {
  return TRADE_MESSAGE_TEMPLATES[action](proposingTeamName, receivingTeamName);
}
