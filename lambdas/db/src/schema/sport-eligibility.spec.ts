import { assertSportCompatibility } from './sport-eligibility';

describe('assertSportCompatibility (LS-4763)', () => {
  it('passes when all players match the league sport', () => {
    expect(() =>
      assertSportCompatibility(
        [
          { playerId: 1, sport: 'football' },
          { playerId: 2, sport: 'football' },
        ],
        'football',
      ),
    ).not.toThrow();
  });

  it('passes for a baseball league with all baseball players', () => {
    expect(() =>
      assertSportCompatibility(
        [{ playerId: 10, sport: 'baseball' }],
        'baseball',
      ),
    ).not.toThrow();
  });

  it('throws when a baseball player is offered into a football league', () => {
    expect(() =>
      assertSportCompatibility(
        [
          { playerId: 1, sport: 'football' },
          { playerId: 99, sport: 'baseball' },
        ],
        'football',
      ),
    ).toThrow(/Player 99 is a baseball player.*football league/);
  });

  it('throws when a football player is offered into a baseball league', () => {
    expect(() =>
      assertSportCompatibility(
        [{ playerId: 5, sport: 'football' }],
        'baseball',
      ),
    ).toThrow(/Player 5 is a football player.*baseball league/);
  });

  it('passes for an empty player list', () => {
    expect(() => assertSportCompatibility([], 'football')).not.toThrow();
  });
});
