/**
 * GA4 consent gating (LS-10764): gtag.js is never requested and no events
 * are sent until analytics consent is granted; Consent Mode v2 defaults are
 * queued before `config`; ad signals are always denied.
 */
import { getEnvironmentConfig } from '../config/environment';
import { isConsentRequiredRegion } from '../consent/consentRegion';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../config/environment', () => ({
  getEnvironmentConfig: jest.fn(),
}));

jest.mock('../consent/consentRegion', () => ({
  isConsentRequiredRegion: jest.fn(),
}));

const mockEnv = getEnvironmentConfig as jest.MockedFunction<
  typeof getEnvironmentConfig
>;
const mockRegion = isConsentRequiredRegion as jest.MockedFunction<
  typeof isConsentRequiredRegion
>;

type AnalyticsModule = typeof import('./analytics');
type StoreModule = typeof import('../consent/consentStore');

function loadModules(): { analytics: AnalyticsModule; store: StoreModule } {
  let analytics!: AnalyticsModule;
  let store!: StoreModule;
  jest.isolateModules(() => {
    store = jest.requireActual<StoreModule>('../consent/consentStore');
    analytics = jest.requireActual<AnalyticsModule>('./analytics');
  });
  return { analytics, store };
}

function gtagScripts(): HTMLScriptElement[] {
  return Array.from(
    document.head.querySelectorAll<HTMLScriptElement>('script'),
  ).filter((s) => s.src.includes('googletagmanager.com'));
}

/** dataLayer entries are `arguments` objects; flatten them to arrays. */
function dataLayerCalls(): unknown[][] {
  return (window.dataLayer ?? []).map((entry) =>
    Array.from(entry as ArrayLike<unknown>),
  );
}

describe('GA4 consent gating (LS-10764)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
    delete window.dataLayer;
    delete window.gtag;
    mockEnv.mockReturnValue({
      googleAnalyticsMeasurementId: 'G-TEST123',
      isDev: false,
    } as ReturnType<typeof getEnvironmentConfig>);
  });

  describe('EU/UK visitor with no saved choice', () => {
    beforeEach(() => mockRegion.mockReturnValue(true));

    it('does not request gtag.js and queues denied Consent Mode defaults first', () => {
      const { analytics } = loadModules();
      analytics.initializeAnalytics();

      expect(gtagScripts()).toHaveLength(0);
      const calls = dataLayerCalls();
      expect(calls[0]).toEqual([
        'consent',
        'default',
        {
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
          analytics_storage: 'denied',
        },
      ]);
      expect(calls[1][0]).toBe('config');
    });

    it('drops events before consent instead of queueing them', () => {
      const { analytics } = loadModules();
      analytics.initializeAnalytics();
      const before = dataLayerCalls().length;

      analytics.trackPageView('/privacy');
      analytics.trackEvent('some_event');
      analytics.setUserProperties({ userId: 1, subscriptionTier: 'free' });

      expect(dataLayerCalls()).toHaveLength(before);
    });

    it('loads gtag.js and grants analytics_storage after Accept', () => {
      const { analytics, store } = loadModules();
      analytics.initializeAnalytics();

      store.saveConsent(true);

      expect(gtagScripts()).toHaveLength(1);
      expect(dataLayerCalls()).toContainEqual([
        'consent',
        'update',
        { analytics_storage: 'granted' },
      ]);

      analytics.trackPageView('/home');
      const calls = dataLayerCalls();
      expect(calls[calls.length - 1][1]).toBe('page_view');
    });

    it('never loads gtag.js after Reject', () => {
      const { analytics, store } = loadModules();
      analytics.initializeAnalytics();

      store.saveConsent(false);

      expect(gtagScripts()).toHaveLength(0);
    });
  });

  describe('non-EU visitor', () => {
    beforeEach(() => mockRegion.mockReturnValue(false));

    it('keeps current behaviour: loads gtag.js with analytics granted', () => {
      const { analytics } = loadModules();
      analytics.initializeAnalytics();

      expect(gtagScripts()).toHaveLength(1);
      expect(dataLayerCalls()[0][2]).toMatchObject({
        analytics_storage: 'granted',
        ad_storage: 'denied',
      });
    });

    it('on opt-out: denies analytics_storage, stops events and clears GA cookies', () => {
      document.cookie = '_ga=GA1.1.123; path=/';
      document.cookie = '_ga_TEST123=GS1.1.456; path=/';
      document.cookie = 'keep_me=1; path=/';
      const { analytics, store } = loadModules();
      analytics.initializeAnalytics();

      store.saveConsent(false);

      expect(dataLayerCalls()).toContainEqual([
        'consent',
        'update',
        { analytics_storage: 'denied' },
      ]);
      const before = dataLayerCalls().length;
      analytics.trackEvent('after_opt_out');
      expect(dataLayerCalls()).toHaveLength(before);

      expect(document.cookie).not.toMatch(/_ga/);
      expect(document.cookie).toMatch(/keep_me=1/);
    });
  });

  it('honours a saved opt-out for a non-EU visitor on the next visit', () => {
    mockRegion.mockReturnValue(false);
    localStorage.setItem(
      'ls_consent',
      JSON.stringify({ version: 1, analytics: false, savedAt: Date.now() }),
    );
    const { analytics } = loadModules();
    analytics.initializeAnalytics();

    expect(gtagScripts()).toHaveLength(0);
  });
});
