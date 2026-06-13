import type { NotificationResponse } from 'expo-notifications';
import { renderHook } from '@testing-library/react-native';

// ── Import under test (after mocks) ──────────────────────────────────────────

import * as expoNotifications from 'expo-notifications';
import { usePushNotifications } from './usePushNotifications';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'mock-token' }),
  AndroidImportance: { MAX: 5 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

jest.mock('expo-modules-core', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../../../common/utilities/DeviceUtils', () => ({
  isPhysicalDevice: false,
}));

jest.mock('../../../api/db/graphql.generated', () => ({
  useRegisterDeviceTokenMutation: () => [jest.fn()],
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(data: Record<string, unknown>): NotificationResponse {
  return {
    notification: {
      request: {
        identifier: 'test-id',
        content: {
          data,
          title: 'Test',
          body: 'Test',
          sound: null,
          badge: null,
          subtitle: null,
          categoryIdentifier: null,
          launchImageName: null,
          attachments: [],
        },
        trigger: { type: 'push' as const },
      },
      date: Date.now(),
    },
    actionIdentifier: 'com.apple.UNNotificationDefaultActionIdentifier',
  } as unknown as NotificationResponse;
}

function setupListeners() {
  let tapHandler: ((r: NotificationResponse) => void) | null = null;

  const mockedAddResponse = jest.mocked(
    expoNotifications.addNotificationResponseReceivedListener,
  );
  mockedAddResponse.mockImplementation(
    (handler: (r: NotificationResponse) => void) => {
      tapHandler = handler;
      return { remove: jest.fn() } as ReturnType<
        typeof expoNotifications.addNotificationResponseReceivedListener
      >;
    },
  );

  jest
    .mocked(expoNotifications.getLastNotificationResponseAsync)
    .mockResolvedValue(null);

  renderHook(() => usePushNotifications(1));

  return {
    tap: (data: Record<string, unknown>) => tapHandler?.(makeResponse(data)),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePushNotifications — navigateFromNotification', () => {
  it('navigates to /TradeCenterPage with leagueId and tradeOfferId on TRADE_OFFER tap', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'TRADE_OFFER', leagueId: 7, tradeOfferId: 42 });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/TradeCenterPage',
      params: { leagueId: '7', tradeOfferId: '42' },
    });
  });

  it('navigates to /TradeCenterPage without tradeOfferId when absent', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'TRADE_OFFER', leagueId: 7 });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/TradeCenterPage',
      params: { leagueId: '7' },
    });
  });

  it('falls back to /notifications when TRADE_OFFER has no leagueId', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'TRADE_OFFER' });

    expect(mockNavigate).toHaveBeenCalledWith('/notifications');
  });

  it('navigates to baseball league on DRAFT_STARTED tap with sport=baseball', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'DRAFT_STARTED', leagueId: 3, sport: 'baseball' });

    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/3');
  });

  it('navigates to football league on DRAFT_STARTED tap with sport=football', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'DRAFT_STARTED', leagueId: 3, sport: 'football' });

    expect(mockNavigate).toHaveBeenCalledWith('/football/league/3');
  });

  it('defaults to baseball league on DRAFT_STARTED tap when sport is absent', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'DRAFT_STARTED', leagueId: 3 });

    expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/3');
  });

  it('navigates to baseball matchup on matchupId+leagueId tap with sport=baseball', () => {
    const { tap } = setupListeners();

    tap({ leagueId: 3, matchupId: 99, sport: 'baseball' });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/baseball/matchup',
      params: { matchupId: '99', leagueId: '3' },
    });
  });

  it('navigates to football matchup on matchupId+leagueId tap with sport=football', () => {
    const { tap } = setupListeners();

    tap({ leagueId: 3, matchupId: 99, sport: 'football' });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/football/matchup',
      params: { matchupId: '99', leagueId: '3' },
    });
  });

  it('defaults to baseball matchup on matchupId+leagueId tap when sport is absent', () => {
    const { tap } = setupListeners();

    tap({ leagueId: 3, matchupId: 99 });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/baseball/matchup',
      params: { matchupId: '99', leagueId: '3' },
    });
  });

  it('falls back to /notifications for unknown notification type', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'UNKNOWN_TYPE' });

    expect(mockNavigate).toHaveBeenCalledWith('/notifications');
  });
});
