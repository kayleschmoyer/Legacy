/**
 * LS-7080 (PRF-009) — savePrefs must report the real write outcome so the save
 * banner never claims "Saved" after a storage failure.
 */
import { getDefaultPrefs, savePrefs } from './PreferencesPage';

describe('savePrefs', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  it('returns true when the write succeeds', () => {
    expect(savePrefs(getDefaultPrefs())).toBe(true);
  });

  it('returns false when storage throws (quota / private mode)', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(savePrefs(getDefaultPrefs())).toBe(false);
  });

  // LS-10782 — a stale tab must only write the fields it changed, so a value
  // another tab saved in the meantime survives.
  it('merges the changed fields onto the stored prefs', () => {
    localStorage.setItem(
      'ls_user_preferences',
      JSON.stringify({ ...getDefaultPrefs(), defaultSport: 'football' }),
    );

    savePrefs({ statsFormat: 'expanded' });

    const stored = JSON.parse(
      localStorage.getItem('ls_user_preferences') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored.defaultSport).toBe('football');
    expect(stored.statsFormat).toBe('expanded');
  });
});
