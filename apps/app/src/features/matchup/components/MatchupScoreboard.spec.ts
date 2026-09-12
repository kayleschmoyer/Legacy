import { formatTeamRecord, type TeamStandingRecord } from './MatchupScoreboard';

// The module under test now resolves premium status to gate the score "+N"
// flourish (LS-6392). `useSubscription` reaches Expo native modules through
// the websocket/keychain layers, which this pure-logic spec has no runtime
// for — stub it so importing the module stays side-effect free.
jest.mock('../../subscription/useSubscription', () => ({
  useSubscription: () => ({ isPremium: false }),
}));

describe('formatTeamRecord', () => {
  const standings: readonly TeamStandingRecord[] = [
    { teamId: 10, wins: 5, losses: 2, ties: 0 },
    { teamId: 20, wins: 3, losses: 4, ties: 1 },
  ];

  it('formats a W-L record when the league does not allow ties', () => {
    expect(formatTeamRecord(10, standings)).toBe('5-2');
  });

  it('formats a W-L-T record when the team has at least one tie', () => {
    expect(formatTeamRecord(20, standings)).toBe('3-4-1');
  });

  it('returns undefined when teamId is null', () => {
    expect(formatTeamRecord(null, standings)).toBeUndefined();
  });

  it('returns undefined when teamId is undefined', () => {
    expect(formatTeamRecord(undefined, standings)).toBeUndefined();
  });

  it('returns undefined when no standing row exists for the team', () => {
    expect(formatTeamRecord(99, standings)).toBeUndefined();
  });

  it('returns undefined when standings is empty (not yet loaded)', () => {
    expect(formatTeamRecord(10, [])).toBeUndefined();
  });

  it('defaults missing wins/losses/ties to 0', () => {
    const sparse: readonly TeamStandingRecord[] = [{ teamId: 30 }];
    expect(formatTeamRecord(30, sparse)).toBe('0-0');
  });

  it('matches teamId across string/number types via numeric coercion', () => {
    const stringTeamId: readonly TeamStandingRecord[] = [
      { teamId: '10', wins: 5, losses: 2, ties: 0 },
    ];
    expect(formatTeamRecord(10, stringTeamId)).toBe('5-2');
  });
});
