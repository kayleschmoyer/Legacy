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
import { trackEvent, trackMatchupViewed } from './analytics';
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
