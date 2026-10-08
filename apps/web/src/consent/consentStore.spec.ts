import {
  closeCookieSettings,
  CONSENT_MAX_AGE_MS,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  getConsentSnapshot,
  hasAnalyticsConsent,
  isConsentBannerVisible,
  openCookieSettings,
  resetConsentStoreForTests,
  saveConsent,
  subscribeConsent,
} from './consentStore';
import { isConsentRequiredRegion } from './consentRegion';

jest.mock('./consentRegion', () => ({
  isConsentRequiredRegion: jest.fn(),
}));

const mockRegion = isConsentRequiredRegion as jest.MockedFunction<
  typeof isConsentRequiredRegion
>;

function storeChoice(analytics: boolean, overrides: object = {}): void {
  localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({
      version: CONSENT_VERSION,
      analytics,
      savedAt: Date.now(),
      ...overrides,
    }),
  );
}

describe('consentStore (LS-10764)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetConsentStoreForTests();
  });

  describe('EU/UK visitor', () => {
    beforeEach(() => mockRegion.mockReturnValue(true));

    it('defaults analytics off and shows the banner', () => {
      const state = getConsentSnapshot();
      expect(state.analytics).toBe(false);
      expect(hasAnalyticsConsent()).toBe(false);
      expect(isConsentBannerVisible(state)).toBe(true);
    });

    it('accepting turns analytics on, hides the banner and persists', () => {
      saveConsent(true);
      expect(hasAnalyticsConsent()).toBe(true);
      expect(isConsentBannerVisible(getConsentSnapshot())).toBe(false);

      const stored = JSON.parse(
        localStorage.getItem(CONSENT_STORAGE_KEY) ?? '{}',
      ) as { version: number; analytics: boolean };
      expect(stored).toMatchObject({
        version: CONSENT_VERSION,
        analytics: true,
      });
    });

    it('restores a saved rejection on the next visit', () => {
      storeChoice(false);
      const state = getConsentSnapshot();
      expect(state.analytics).toBe(false);
      expect(state.decided).toBe(true);
      expect(isConsentBannerVisible(state)).toBe(false);
    });

    it('re-prompts when the saved choice is older than 12 months', () => {
      storeChoice(true, { savedAt: Date.now() - CONSENT_MAX_AGE_MS - 1000 });
      const state = getConsentSnapshot();
      expect(state.analytics).toBe(false);
      expect(isConsentBannerVisible(state)).toBe(true);
    });

    it('re-prompts when the consent version changes', () => {
      storeChoice(true, { version: CONSENT_VERSION - 1 });
      expect(isConsentBannerVisible(getConsentSnapshot())).toBe(true);
    });

    it('ignores a corrupt stored value', () => {
      localStorage.setItem(CONSENT_STORAGE_KEY, '{not json');
      expect(isConsentBannerVisible(getConsentSnapshot())).toBe(true);
    });

    it('applies the choice for the session when storage is blocked', () => {
      const setItem = jest
        .spyOn(Storage.prototype, 'setItem')
        .mockImplementation(() => {
          throw new Error('blocked');
        });
      saveConsent(true);
      expect(hasAnalyticsConsent()).toBe(true);
      setItem.mockRestore();

      // Next visit: nothing was stored, so the banner returns.
      resetConsentStoreForTests();
      expect(isConsentBannerVisible(getConsentSnapshot())).toBe(true);
    });

    it('hides the banner while the Manage panel is open', () => {
      openCookieSettings();
      const state = getConsentSnapshot();
      expect(state.settingsOpen).toBe(true);
      expect(isConsentBannerVisible(state)).toBe(false);

      closeCookieSettings();
      expect(isConsentBannerVisible(getConsentSnapshot())).toBe(true);
    });
  });

  describe('non-EU visitor', () => {
    beforeEach(() => mockRegion.mockReturnValue(false));

    it('defaults analytics on with no banner', () => {
      const state = getConsentSnapshot();
      expect(state.analytics).toBe(true);
      expect(isConsentBannerVisible(state)).toBe(false);
    });

    it('can opt out, and the opt-out persists', () => {
      openCookieSettings();
      saveConsent(false);
      expect(getConsentSnapshot().settingsOpen).toBe(false);
      resetConsentStoreForTests();
      expect(hasAnalyticsConsent()).toBe(false);
    });
  });

  it('notifies subscribers on change', () => {
    mockRegion.mockReturnValue(true);
    const listener = jest.fn();
    const unsubscribe = subscribeConsent(listener);
    saveConsent(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    saveConsent(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
