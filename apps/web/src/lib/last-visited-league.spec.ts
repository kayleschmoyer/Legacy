/**
 * LS-6694 — web last-visited-league localStorage wrapper.
 */
import {
  getLastVisitedLeague,
  getLastVisitedLeagueForUser,
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

  describe('user scoping (LS-10787)', () => {
    it('tags the entry with the user who opened the league', () => {
      setLastVisitedLeague(42, 'football', 7);
      expect(localStorage.getItem(KEY)).toBe(
        JSON.stringify({ leagueId: 42, sport: 'football', userId: 7 }),
      );
    });

    it('returns the entry only to the user who wrote it', () => {
      setLastVisitedLeague(42, 'football', 7);
      expect(getLastVisitedLeagueForUser(7)).toEqual({
        leagueId: 42,
        sport: 'football',
        userId: 7,
      });
      expect(getLastVisitedLeagueForUser(8)).toBeNull();
      expect(getLastVisitedLeagueForUser(null)).toBeNull();
    });

    it('ignores an entry with no owner', () => {
      setLastVisitedLeague(42, 'football');
      expect(getLastVisitedLeagueForUser(7)).toBeNull();
    });
  });
});
