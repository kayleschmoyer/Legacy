import {
  navigateFromNotification,
  type NotificationData,
} from './usePushNotifications';

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// Importing the module under test runs its top-level `setNotificationHandler`
// call and pulls in expo/native dependencies, so those imports must be mocked
// even though `navigateFromNotification` itself is a pure function that only
// touches the injected router. The mapping is tested in ISOLATION (AC3): the
// function is invoked directly with a stub router, not driven through the
// rendered hook and its notification listeners.

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
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

/** A minimal router stub — `navigateFromNotification` only calls `navigate`. */
function makeRouter() {
  const navigate = jest.fn();
  const router = { navigate } as unknown as Parameters<
    typeof navigateFromNotification
  >[0];
  return { router, navigate };
}

function route(data: NotificationData) {
  const { router, navigate } = makeRouter();
  navigateFromNotification(router, data);
  return navigate;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('navigateFromNotification (isolated payload → route mapping)', () => {
  describe('draft call-to-action notifications → live draft room (LS-10593)', () => {
    it.each([['DRAFT_STARTED'], ['DRAFT_ON_THE_CLOCK']])(
      'routes %s with a leagueId to the draft board',
      (notificationType) => {
        const navigate = route({ notificationType, leagueId: 3 });
        expect(navigate).toHaveBeenCalledWith({
          pathname: '/DraftBoardPage',
          params: { leagueId: '3' },
        });
      },
    );

    it('opens the same draft board regardless of sport', () => {
      const navigate = route({
        notificationType: 'DRAFT_ON_THE_CLOCK',
        leagueId: 8,
        sport: 'football',
      });
      expect(navigate).toHaveBeenCalledWith({
        pathname: '/DraftBoardPage',
        params: { leagueId: '8' },
      });
    });

    it.each([['DRAFT_STARTED'], ['DRAFT_ON_THE_CLOCK']])(
      'falls back to /notifications when a %s payload has no leagueId',
      (notificationType) => {
        const navigate = route({ notificationType });
        expect(navigate).toHaveBeenCalledWith('/notifications');
      },
    );
  });

  describe('draft notifications → league detail', () => {
    it.each([['DRAFT_PICK_MADE'], ['DRAFT_COMPLETED']])(
      'routes %s with a leagueId to the league screen',
      (notificationType) => {
        const navigate = route({ notificationType, leagueId: 3 });
        expect(navigate).toHaveBeenCalledWith('/baseball/league/3');
      },
    );

    it('uses the sport prefix from the payload', () => {
      const navigate = route({
        notificationType: 'DRAFT_COMPLETED',
        leagueId: 8,
        sport: 'football',
      });
      expect(navigate).toHaveBeenCalledWith('/football/league/8');
    });

    it('defaults the sport prefix to baseball when sport is absent', () => {
      const navigate = route({
        notificationType: 'DRAFT_PICK_MADE',
        leagueId: 5,
      });
      expect(navigate).toHaveBeenCalledWith('/baseball/league/5');
    });

    it('ignores a sport value outside the allowlist to prevent path traversal', () => {
      const navigate = route({
        notificationType: 'DRAFT_COMPLETED',
        leagueId: 3,
        sport: '../../evil',
      });
      expect(navigate).toHaveBeenCalledWith('/baseball/league/3');
    });

    it('falls back to /notifications when a draft payload has no leagueId', () => {
      const navigate = route({ notificationType: 'DRAFT_COMPLETED' });
      expect(navigate).toHaveBeenCalledWith('/notifications');
    });
  });

  describe('trade offers → trade center', () => {
    it('routes TRADE_OFFER with leagueId and tradeOfferId', () => {
      const navigate = route({
        notificationType: 'TRADE_OFFER',
        leagueId: 7,
        tradeOfferId: 42,
      });
      expect(navigate).toHaveBeenCalledWith({
        pathname: '/TradeCenterPage',
        params: { leagueId: '7', tradeOfferId: '42' },
      });
    });

    it('omits tradeOfferId param when it is absent', () => {
      const navigate = route({ notificationType: 'TRADE_OFFER', leagueId: 7 });
      expect(navigate).toHaveBeenCalledWith({
        pathname: '/TradeCenterPage',
        params: { leagueId: '7' },
      });
    });

    it('falls back to /notifications when TRADE_OFFER has no leagueId', () => {
      const navigate = route({
        notificationType: 'TRADE_OFFER',
        tradeOfferId: 42,
      });
      expect(navigate).toHaveBeenCalledWith('/notifications');
    });
  });

  describe('matchup notifications → matchup screen', () => {
    it('routes matchupId + leagueId to the matchup screen', () => {
      const navigate = route({ leagueId: 3, matchupId: 99 });
      expect(navigate).toHaveBeenCalledWith({
        pathname: '/baseball/matchup',
        params: { matchupId: '99', leagueId: '3' },
      });
    });

    it('uses the sport prefix for matchups', () => {
      const navigate = route({ leagueId: 3, matchupId: 99, sport: 'football' });
      expect(navigate).toHaveBeenCalledWith({
        pathname: '/football/matchup',
        params: { matchupId: '99', leagueId: '3' },
      });
    });

    it('falls back to /notifications when a matchup payload has no leagueId', () => {
      const navigate = route({ matchupId: 99 });
      expect(navigate).toHaveBeenCalledWith('/notifications');
    });
  });

  describe('default routing', () => {
    it('routes an unknown notificationType to /notifications', () => {
      const navigate = route({ notificationType: 'SOMETHING_NEW' });
      expect(navigate).toHaveBeenCalledWith('/notifications');
    });

    it('routes an empty payload to /notifications', () => {
      const navigate = route({});
      expect(navigate).toHaveBeenCalledWith('/notifications');
    });

    it('navigates exactly once per invocation', () => {
      const { router, navigate } = makeRouter();
      navigateFromNotification(router, {
        notificationType: 'TRADE_OFFER',
        leagueId: 1,
      });
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });
});
