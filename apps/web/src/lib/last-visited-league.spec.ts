/**
 * LS-6694 — web last-visited-league localStorage wrapper.
 */
import {
  getLastVisitedLeague,
  setLastVisitedLeague,
} from './last-visited-league';

const KEY = 'ls_last_visited_league';

describe('web last-visited-league wrapper', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is stored', () => {
    expect(getLastVisitedLeague()).toBeNull();
  });

  it('persists and reads back a league', () => {
    setLastVisitedLeague(42, 'football');
    expect(getLastVisitedLeague()).toEqual({ leagueId: 42, sport: 'football' });
    expect(localStorage.getItem(KEY)).toBe(
      JSON.stringify({ leagueId: 42, sport: 'football' }),
    );
  });

  it('normalizes an unknown/null sport to baseball', () => {
    setLastVisitedLeague(7, null);
    expect(getLastVisitedLeague()).toEqual({ leagueId: 7, sport: 'baseball' });
  });

  it('ignores a non-positive or non-integer league id', () => {
    setLastVisitedLeague(0, 'baseball');
    setLastVisitedLeague(-3, 'baseball');
    setLastVisitedLeague(1.5, 'baseball');
    expect(getLastVisitedLeague()).toBeNull();
  });

  it('returns null when the stored value is corrupted', () => {
    localStorage.setItem(KEY, '{not json');
    expect(getLastVisitedLeague()).toBeNull();
  });
});
