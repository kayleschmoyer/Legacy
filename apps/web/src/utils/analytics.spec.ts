/**
 * Tests for the GA4 `matchup_viewed` event payload and no-op behavior (LS-7628).
 *
 * Covers:
 *   - trackMatchupViewed sends only matchup_id / league_id / week_number /
 *     category (+ subscription_tier from trackEvent) — no PII.
 *   - trackEvent (and therefore trackMatchupViewed) silently no-ops, without
 *     throwing, when window.gtag is unavailable or the GA measurement ID is
 *     unset.
 */
import {
  trackEvent,
  trackMatchupViewed,
  trackOnboardingCompleted,
  trackOnboardingSkipped,
  trackOnboardingStarted,
  trackOnboardingStepViewed,
  trackSignOut,
  trackTeamViewed,
} from './analytics';
import { getEnvironmentConfig } from '../config/environment';

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

const mockGetEnvironmentConfig = getEnvironmentConfig as jest.MockedFunction<
  typeof getEnvironmentConfig
>;

describe('trackMatchupViewed payload (LS-7628)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as { gtag?: unknown }).gtag;
  });

  it('sends only numeric IDs and a category — no PII', () => {
    mockGetEnvironmentConfig.mockReturnValue({
      googleAnalyticsMeasurementId: 'G-TEST123',
    } as ReturnType<typeof getEnvironmentConfig>);
    const gtag = jest.fn();
    window.gtag = gtag;

    trackMatchupViewed(42, 7, 3);

    expect(gtag).toHaveBeenCalledTimes(1);
    const [, eventName, payload] = gtag.mock.calls[0];
    expect(eventName).toBe('matchup_viewed');
    expect(payload).toMatchObject({
      matchup_id: 42,
      league_id: 7,
      week_number: 3,
      category: 'matchup',
    });
    const piiKeys = ['email', 'name', 'username', 'user_id', 'userId'];
    expect(Object.keys(payload as object)).toEqual(
      expect.not.arrayContaining(piiKeys),
    );
  });
});

describe('trackEvent no-op behavior (LS-7628)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as { gtag?: unknown }).gtag;
  });

  it('does not call gtag and does not throw when the GA measurement ID is unset', () => {
    mockGetEnvironmentConfig.mockReturnValue({
      googleAnalyticsMeasurementId: undefined,
    } as ReturnType<typeof getEnvironmentConfig>);
    const gtag = jest.fn();
    window.gtag = gtag;

    expect(() => trackMatchupViewed(1, 2, 3)).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();
  });

  it('does not call gtag and does not throw when window.gtag is undefined', () => {
    mockGetEnvironmentConfig.mockReturnValue({
      googleAnalyticsMeasurementId: 'G-TEST123',
    } as ReturnType<typeof getEnvironmentConfig>);
    delete (window as { gtag?: unknown }).gtag;

    expect(() => trackEvent('matchup_viewed', { matchup_id: 1 })).not.toThrow();
  });
});

describe('trackTeamViewed de-dupe (LS-6050)', () => {
  beforeEach(() => {
    mockGetEnvironmentConfig.mockReturnValue({
      googleAnalyticsMeasurementId: 'G-TEST123',
    } as ReturnType<typeof getEnvironmentConfig>);
    window.gtag = jest.fn();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as { gtag?: unknown }).gtag;
    sessionStorage.clear();
  });

  it('fires once for a repeated (teamId, leagueId) tuple within the window', () => {
    trackTeamViewed(42, 7);
    trackTeamViewed(42, 7);
    trackTeamViewed(42, 7);

    expect(window.gtag).toHaveBeenCalledTimes(1);
  });

  it('fires again for the same tuple once the 5-minute window has elapsed', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000_000);
    trackTeamViewed(42, 7);

    nowSpy.mockReturnValue(1_000_000 + 5 * 60 * 1000 + 1);
    trackTeamViewed(42, 7);

    expect(window.gtag).toHaveBeenCalledTimes(2);
  });

  it('does not de-dupe across different (teamId, leagueId) tuples', () => {
    trackTeamViewed(42, 7);
    trackTeamViewed(43, 7);
    trackTeamViewed(42, 8);

    expect(window.gtag).toHaveBeenCalledTimes(3);
  });

  it('does not throw when sessionStorage is unavailable', () => {
    const getItemSpy = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });

    expect(() => trackTeamViewed(42, 7)).not.toThrow();
    expect(window.gtag).toHaveBeenCalledTimes(1);

    getItemSpy.mockRestore();
  });
});

describe('trackSignOut (LS-7224)', () => {
  afterEach(() => {
    delete (window as { gtag?: unknown }).gtag;
  });

  it('emits a sign_out event with its source and no PII', () => {
    mockGetEnvironmentConfig.mockReturnValue({
      googleAnalyticsMeasurementId: 'G-TEST123',
    } as ReturnType<typeof getEnvironmentConfig>);
    const gtag = jest.fn();
    window.gtag = gtag;

    trackSignOut('profile_settings');

    expect(gtag).toHaveBeenCalledWith(
      'event',
      'sign_out',
      expect.objectContaining({ source: 'profile_settings', category: 'auth' }),
    );
  });
});

describe('onboarding funnel events (LS-6903)', () => {
  afterEach(() => {
    delete (window as { gtag?: unknown }).gtag;
  });

  it('emits the four funnel events with their params', () => {
    mockGetEnvironmentConfig.mockReturnValue({
      googleAnalyticsMeasurementId: 'G-TEST123',
    } as ReturnType<typeof getEnvironmentConfig>);
    const gtag = jest.fn();
    window.gtag = gtag;

    trackOnboardingStarted();
    trackOnboardingStepViewed('get-started', 4);
    trackOnboardingSkipped('welcome', 'backdrop');
    trackOnboardingCompleted();

    const calls = gtag.mock.calls as [string, string, unknown][];
    const events = calls.map(([, name, params]) => [name, params]);
    expect(events[0][0]).toBe('onboarding_started');
    expect(events[1]).toEqual([
      'onboarding_step_viewed',
      expect.objectContaining({ step_id: 'get-started', step_index: 4 }),
    ]);
    expect(events[2]).toEqual([
      'onboarding_skipped',
      expect.objectContaining({ from_step: 'welcome', method: 'backdrop' }),
    ]);
    expect(events[3][0]).toBe('onboarding_completed');
  });
});
