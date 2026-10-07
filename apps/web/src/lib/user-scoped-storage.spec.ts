/**
 * LS-10787 — explicit Sign Out clears per-user browser storage.
 */
import {
  clearUserScopedStorage,
  leagueRoleKey,
  makeScrollPositionSaver,
  scrollPositionKey,
} from './user-scoped-storage';
import {
  getLastVisitedLeague,
  setLastVisitedLeague,
} from './last-visited-league';
import { setLastReadChatMessageId } from '../utils/lastReadChatMessage';

describe('clearUserScopedStorage (LS-10787)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes the last-visited league, preferences and per-league entries', () => {
    setLastVisitedLeague(14109, 'baseball', 7);
    localStorage.setItem(
      'ls_user_preferences',
      JSON.stringify({ defaultSport: 'football' }),
    );
    localStorage.setItem(leagueRoleKey(14109), 'manager');
    setLastReadChatMessageId(14109, 55);

    clearUserScopedStorage();

    expect(getLastVisitedLeague()).toBeNull();
    expect(localStorage.getItem('ls_last_visited_league')).toBeNull();
    expect(localStorage.getItem('ls_user_preferences')).toBeNull();
    expect(localStorage.getItem('ls-v2-role:14109')).toBeNull();
    expect(localStorage.getItem('ls.lastReadChatMessage.14109')).toBeNull();
  });

  it('removes every scroll:* route key and the step-up window from sessionStorage', () => {
    sessionStorage.setItem(scrollPositionKey('/baseball/league/14109'), '320');
    sessionStorage.setItem(scrollPositionKey('/players'), '80');
    sessionStorage.setItem('ls_step_up_until', '9999999999');

    clearUserScopedStorage();

    expect(sessionStorage.getItem('scroll:/baseball/league/14109')).toBeNull();
    expect(sessionStorage.getItem('scroll:/players')).toBeNull();
    expect(sessionStorage.getItem('ls_step_up_until')).toBeNull();
  });

  it('keeps device settings such as the theme and column layout', () => {
    localStorage.setItem('ls_theme_preference', 'dark');
    localStorage.setItem('ls_prefs_sections_collapsed', '["audio"]');
    sessionStorage.setItem('chunk-load-reload-attempted', '1');
    setLastVisitedLeague(14109, 'baseball', 7);

    clearUserScopedStorage();

    expect(localStorage.getItem('ls_theme_preference')).toBe('dark');
    expect(localStorage.getItem('ls_prefs_sections_collapsed')).toBe(
      '["audio"]',
    );
    expect(sessionStorage.getItem('chunk-load-reload-attempted')).toBe('1');
  });

  it('does not throw when storage is unavailable', () => {
    const keySpy = jest
      .spyOn(Storage.prototype, 'key')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    localStorage.setItem('ls_last_visited_league', 'x');

    expect(() => clearUserScopedStorage()).not.toThrow();

    keySpy.mockRestore();
  });
});

describe('makeScrollPositionSaver (LS-10787)', () => {
  const signIn = () =>
    localStorage.setItem(
      'ls_user_profile',
      JSON.stringify({ id: 7, email: 'user7@example.com' }),
    );

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('saves the scroll position for a signed-in user', () => {
    signIn();
    const save = makeScrollPositionSaver('/baseball/league/14109');
    save();
    expect(
      sessionStorage.getItem('scroll:/baseball/league/14109'),
    ).not.toBeNull();
  });

  it('does not re-create the key after the session ended (sign-out unmount)', () => {
    signIn();
    const save = makeScrollPositionSaver('/baseball/league/14109');
    // Sign Out: AuthService drops the profile, then the cleanup runs.
    localStorage.removeItem('ls_user_profile');
    clearUserScopedStorage();
    save();
    expect(sessionStorage.getItem('scroll:/baseball/league/14109')).toBeNull();
  });

  it('still saves for signed-out browsing of public pages', () => {
    const save = makeScrollPositionSaver('/help');
    save();
    expect(sessionStorage.getItem('scroll:/help')).not.toBeNull();
  });
});
