/**
 * LS-7080 (PRF-009) — savePrefs must report the real write outcome so the save
 * banner never claims "Saved" after a storage failure.
 */
import { getDefaultPrefs, savePrefs } from './PreferencesPage';

describe('savePrefs', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns true when the write succeeds', () => {
    expect(savePrefs(getDefaultPrefs())).toBe(true);
  });

  it('returns false when storage throws (quota / private mode)', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(savePrefs(getDefaultPrefs())).toBe(false);
  });
});
