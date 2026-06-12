import { getApp } from '@react-native-firebase/app';
import {
  setUserId as fbSetUserId,
  getAnalytics,
  logEvent,
  setUserProperty,
} from '@react-native-firebase/analytics';

import { setUserId, setUserProperties, trackLogin } from './analytics';

// Mock the RN Firebase modular modules. Factories use inline jest.fn() (no
// references to outer-scope variables) so they are hoist-safe; return values
// are wired up in beforeEach.
jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(),
}));

jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(),
  logEvent: jest.fn(() => Promise.resolve()),
  setUserId: jest.fn(() => Promise.resolve()),
  setUserProperty: jest.fn(() => Promise.resolve()),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), warn: jest.fn() },
}));

// Stand-in Firebase app + analytics instance the modular getters resolve to.
const mockApp = { name: '[DEFAULT]' };
const mockAnalyticsInstance = { __brand: 'analytics' };

beforeEach(() => {
  jest.clearAllMocks();
  (getApp as jest.Mock).mockReturnValue(mockApp);
  (getAnalytics as jest.Mock).mockReturnValue(mockAnalyticsInstance);
});

describe('mobile analytics — v22 modular API', () => {
  it('resolves the analytics instance via getAnalytics(getApp())', async () => {
    await setUserId('user-1');

    expect(getApp).toHaveBeenCalled();
    expect(getAnalytics).toHaveBeenCalledWith(mockApp);
  });

  it('sets the user id through the modular setUserId(analytics, id)', async () => {
    await setUserId(42);

    expect(fbSetUserId).toHaveBeenCalledWith(mockAnalyticsInstance, '42');
  });

  it('sets the subscription_tier user property through modular setUserProperty', async () => {
    await setUserProperties({ subscriptionTier: 'premium' });

    expect(setUserProperty).toHaveBeenCalledWith(
      mockAnalyticsInstance,
      'subscription_tier',
      'premium',
    );
  });

  it('sets both property and user id when supplied together', async () => {
    await setUserProperties({ subscriptionTier: 'free', userId: 'u-7' });

    expect(setUserProperty).toHaveBeenCalledWith(
      mockAnalyticsInstance,
      'subscription_tier',
      'free',
    );
    expect(fbSetUserId).toHaveBeenCalledWith(mockAnalyticsInstance, 'u-7');
  });

  it('logs events through the modular logEvent(analytics, name, params)', async () => {
    trackLogin('google');
    // trackLogin fires void trackEvent(...) — let the microtask resolve.
    await Promise.resolve();

    expect(logEvent).toHaveBeenCalledWith(
      mockAnalyticsInstance,
      'login',
      expect.objectContaining({ method: 'google' }),
    );
  });
});
