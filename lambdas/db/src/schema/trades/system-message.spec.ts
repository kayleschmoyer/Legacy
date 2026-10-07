import { buildTradeSystemMessageText } from './system-message';

describe('buildTradeSystemMessageText', () => {
  const proposing = 'Team A';
  const receiving = 'Team B';

  it('names the receiving team as the counterparty when an offer is cancelled', () => {
    expect(buildTradeSystemMessageText('cancelled', proposing, receiving)).toBe(
      '↩️ Team A cancelled their trade offer to Team B',
    );
  });

  it.each([
    ['proposed', '🔁 Team A proposed a trade to Team B'],
    ['accepted', '✅ Team B accepted a trade with Team A'],
    ['rejected', '❌ Team B rejected a trade from Team A'],
    ['vetoed', '🚫 Commissioner vetoed the trade between Team A and Team B'],
  ] as const)('keeps the %s message unchanged', (action, expected) => {
    expect(buildTradeSystemMessageText(action, proposing, receiving)).toBe(
      expected,
    );
  });
});
