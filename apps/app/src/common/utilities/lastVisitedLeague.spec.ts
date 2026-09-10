/**
 * Coverage for the mobile last-visited-league AsyncStorage wrapper (LS-9292).
 *
 * `login.tsx`'s post-login redirect (LGN-037 / LS-6694) decides between
 * "returning user" (send them back to their last-opened league) and "no
 * prior session state" (send them to the general app home screen) purely by
 * whether `getLastVisitedLeague()` resolves to a value or `null`. `login.spec.tsx`
 * exercises that decision with the wrapper mocked away, so it never proves
 * the wrapper itself produces the right signal from real storage state. These
 * tests exercise `getLastVisitedLeague`/`setLastVisitedLeague`/
 * `clearLastVisitedLeague` against the in-memory `AsyncStorage` mock
 * (`../../test-setup.ts`) directly, distinguishing:
 *
 * - a fresh install (nothing ever written to the `ls_last_visited_league`
 *   key) — must resolve to `null` so the redirect falls through to home.
 * - a returning user (a valid league was persisted on a previous visit) —
 *   must resolve to that league so the redirect can send them back to it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearLastVisitedLeague,
  getLastVisitedLeague,
  setLastVisitedLeague,
} from './lastVisitedLeague';

describe('lastVisitedLeague (mobile AsyncStorage wrapper)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('fresh install (no prior session state)', () => {
    it('resolves to null when nothing has ever been persisted', async () => {
      expect(await getLastVisitedLeague()).toBeNull();
    });

    it('stays null after a reinstall wipes a previously-set malformed value', async () => {
      // Simulates storage left in a bad state (e.g. a schema change) rather
      // than trusting any non-empty value as a signal of a real prior visit.
      await AsyncStorage.setItem('ls_last_visited_league', 'not-json');
      expect(await getLastVisitedLeague()).toBeNull();
    });
  });

  describe('returning user (prior session state persisted)', () => {
    it('resolves to the league most recently set', async () => {
      setLastVisitedLeague(42, 'football');
      await Promise.resolve(); // let the fire-and-forget AsyncStorage.setItem settle

      expect(await getLastVisitedLeague()).toEqual({
        leagueId: 42,
        sport: 'football',
      });
    });

    it('overwrites the persisted league when a new one is visited', async () => {
      setLastVisitedLeague(1, 'baseball');
      await Promise.resolve();
      setLastVisitedLeague(2, 'football');
      await Promise.resolve();

      expect(await getLastVisitedLeague()).toEqual({
        leagueId: 2,
        sport: 'football',
      });
    });

    it('ignores an invalid league id and leaves prior state untouched', async () => {
      setLastVisitedLeague(5, 'baseball');
      await Promise.resolve();
      setLastVisitedLeague(-1, 'football');
      await Promise.resolve();

      expect(await getLastVisitedLeague()).toEqual({
        leagueId: 5,
        sport: 'baseball',
      });
    });
  });

  describe('clearLastVisitedLeague (logout — prevents a stale pointer surviving into the next sign-in)', () => {
    it('drops a persisted league back to the fresh-install null state', async () => {
      setLastVisitedLeague(9, 'baseball');
      await Promise.resolve();
      expect(await getLastVisitedLeague()).not.toBeNull();

      await clearLastVisitedLeague();

      expect(await getLastVisitedLeague()).toBeNull();
    });

    it('is a no-op when nothing was persisted', async () => {
      await expect(clearLastVisitedLeague()).resolves.toBeUndefined();
      expect(await getLastVisitedLeague()).toBeNull();
    });
  });
});
