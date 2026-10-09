import type { NotificationResponse } from 'expo-notifications';
import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
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
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('../../../common/utilities/DeviceUtils', () => ({
  isPhysicalDevice: false,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useRegisterDeviceTokenMutation: () => [jest.fn()],
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(
  data: Record<string, unknown>,
  identifier = 'test-id',
): NotificationResponse {
  return {
    notification: {
      request: {
        identifier,
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
      return { remove: jest.fn() };
    },
  );

  jest
    .mocked(expoNotifications.getLastNotificationResponseAsync)
    .mockResolvedValue(null);

  renderHook(() => usePushNotifications(1));

  return {
    tap: (data: Record<string, unknown>, identifier?: string) =>
      tapHandler?.(makeResponse(data, identifier)),
  };
}

/**
 * Renders the hook with a pending cold-start response so the mount-time
 * `getLastNotificationResponseAsync` branch drives navigation. Returns a
 * promise that resolves once the async cold-start handling has run.
 */
async function setupColdStart(data: Record<string, unknown>) {
  jest
    .mocked(expoNotifications.getLastNotificationResponseAsync)
    .mockResolvedValue(makeResponse(data));

  renderHook(() => usePushNotifications(1));

  await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // The LS-9541 registration fingerprint lives in AsyncStorage and survives
  // between tests in this file, which would make later registrations skip.
  await AsyncStorage.clear();

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

  // LS-10593: draft call-to-action pushes open the live draft room, which
  // serves both sports, rather than the sport-prefixed league screen.
  it.each([['baseball'], ['football'], [undefined]])(
    'navigates to the draft board on DRAFT_STARTED tap (sport=%s)',
    (sport) => {
      const { tap } = setupListeners();

      tap({
        notificationType: 'DRAFT_STARTED',
        leagueId: 3,
        ...(sport ? { sport } : {}),
      });

      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: '/DraftBoardPage',
        params: { leagueId: '3' },
      });
    },
  );

  it('navigates to the draft board on DRAFT_ON_THE_CLOCK tap', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'DRAFT_ON_THE_CLOCK', leagueId: 9 });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/DraftBoardPage',
      params: { leagueId: '9' },
    });
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

describe('usePushNotifications — cold-start tap routing', () => {
  it('routes from the notification that cold-started the app', async () => {
    await setupColdStart({
      notificationType: 'TRADE_OFFER',
      leagueId: 7,
      tradeOfferId: 42,
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/TradeCenterPage',
      params: { leagueId: '7', tradeOfferId: '42' },
    });
  });
});

describe('usePushNotifications — tap deduplication', () => {
  it('navigates only once when the same notification is delivered twice', () => {
    const { tap } = setupListeners();

    const data = { notificationType: 'DRAFT_STARTED', leagueId: 3 };
    tap(data, 'dup-id');
    tap(data, 'dup-id');

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('navigates again for a distinct notification id', () => {
    const { tap } = setupListeners();

    tap({ notificationType: 'DRAFT_STARTED', leagueId: 3 }, 'id-1');
    tap({ notificationType: 'DRAFT_STARTED', leagueId: 4 }, 'id-2');

    expect(mockNavigate).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenNthCalledWith(1, {
      pathname: '/DraftBoardPage',
      params: { leagueId: '3' },
    });
    expect(mockNavigate).toHaveBeenNthCalledWith(2, {
      pathname: '/DraftBoardPage',
      params: { leagueId: '4' },
    });
  });
});
