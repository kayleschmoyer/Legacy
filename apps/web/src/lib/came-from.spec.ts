/**
 * LGN-037 — came-from preservation across the Discord OAuth round-trip.
 */
import { consumeCameFrom, storeCameFrom } from './came-from';

const CAME_FROM_KEY = 'ls_login_came_from';

function setUrl(url: string) {
  window.history.replaceState({}, '', url);
}

describe('came-from', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUrl('/');
  });

  describe('storeCameFrom', () => {
    it('stores a meaningful deep-link with its query and hash', () => {
      setUrl('/league/123?tab=roster#standings');
      storeCameFrom();
      expect(sessionStorage.getItem(CAME_FROM_KEY)).toBe(
        '/league/123?tab=roster#standings',
      );
    });

    it('does not store the app root', () => {
      setUrl('/');
      storeCameFrom();
      expect(sessionStorage.getItem(CAME_FROM_KEY)).toBeNull();
    });

    it.each(['/login', '/signup', '/auth/discord/callback?code=abc'])(
      'does not store the auth entry / callback path %s',
      (url) => {
        setUrl(url);
        storeCameFrom();
        expect(sessionStorage.getItem(CAME_FROM_KEY)).toBeNull();
      },
    );
  });

  describe('consumeCameFrom', () => {
    it('returns the stored value and clears it (single-use)', () => {
      sessionStorage.setItem(CAME_FROM_KEY, '/league/123');
      expect(consumeCameFrom()).toBe('/league/123');
      expect(sessionStorage.getItem(CAME_FROM_KEY)).toBeNull();
      // A second read finds nothing.
      expect(consumeCameFrom()).toBeNull();
    });

    it('returns null when nothing was stored', () => {
      expect(consumeCameFrom()).toBeNull();
    });

    it('rejects (and clears) a tampered auth-entry value', () => {
      sessionStorage.setItem(CAME_FROM_KEY, '/login?next=/evil');
      expect(consumeCameFrom()).toBeNull();
      expect(sessionStorage.getItem(CAME_FROM_KEY)).toBeNull();
    });

    it('rejects a root value', () => {
      sessionStorage.setItem(CAME_FROM_KEY, '/');
      expect(consumeCameFrom()).toBeNull();
    });
  });

  it('round-trips a captured deep-link', () => {
    setUrl('/baseball/league/77/matchups/5');
    storeCameFrom();
    expect(consumeCameFrom()).toBe('/baseball/league/77/matchups/5');
  });
});
