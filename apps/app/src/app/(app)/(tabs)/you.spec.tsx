import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import YouTab from './you';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockLogout = jest.fn<Promise<void>, []>();
const mockDisableDeviceToken = jest.fn().mockResolvedValue({});
const mockGetExpoPushTokenAsync = jest
  .fn<Promise<{ data: string }>, [unknown?]>()
  .mockResolvedValue({ data: 'mock-token' });
let mockIsPhysicalDevice = false;
// Mutable so tests can toggle whether an EAS projectId is configured.
let mockEasProjectId: string | undefined = 'proj-test';

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('expo-notifications', () => ({
  // Lazy wrapper: the mock factory is hoisted above the const initialization,
  // so reference the typed mock at call time (not factory-eval time).
  getExpoPushTokenAsync: (options?: unknown) =>
    mockGetExpoPushTokenAsync(options),
}));

jest.mock('expo-constants', () => ({
  // __esModule: true keeps babel's _interopRequireDefault from double-wrapping
  // the default export (so Constants.expoConfig resolves), matching
  // apps/app/__mocks__/expo-constants.js.
  __esModule: true,
  default: {
    get expoConfig() {
      return {
        extra: mockEasProjectId ? { eas: { projectId: mockEasProjectId } } : {},
      };
    },
  },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../common/utilities/DeviceUtils', () => ({
  get isPhysicalDevice() {
    return mockIsPhysicalDevice;
  },
}));

jest.mock('../../../common/auth/AuthHooks', () => ({
  useAuthHandlers: () => ({ logout: mockLogout }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockUnreadCount = 0;

jest.mock('@legacy-sports/graphql', () => ({
  useGetUnreadNotificationCountQuery: () => ({
    data: { getUnreadNotificationCount: mockUnreadCount },
  }),
  useDisableDeviceTokenMutation: () => [mockDisableDeviceToken],
}));

jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');

  return {
    createTokens: (tokens: unknown) => tokens,
    Paragraph: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(Text, { testID }, children),
    Separator: ({ testID }: { testID?: string; [key: string]: unknown }) =>
      ReactActual.createElement(View, { testID: testID ?? 'separator' }),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => ReactActual.createElement(Text, { testID }, children),
    XStack: ({
      children,
      onPress,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      if (onPress) {
        return ReactActual.createElement(
          Pressable,
          { testID, onPress },
          children,
        );
      }
      return ReactActual.createElement(
        View as React.ComponentType<{
          testID?: string;
          children?: React.ReactNode;
        }>,
        { testID },
        children,
      );
    },
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) =>
      ReactActual.createElement(
        View as React.ComponentType<{
          testID?: string;
          children?: React.ReactNode;
        }>,
        { testID },
        children,
      ),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderYouTab(): void {
  render(<YouTab />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('YouTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnreadCount = 0;
    mockIsPhysicalDevice = false;
    mockEasProjectId = 'proj-test';
    mockLogout.mockResolvedValue(undefined);
    mockDisableDeviceToken.mockResolvedValue({});
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: 'mock-token' });
  });

  describe('account items rendering', () => {
    it('renders Profile row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-profile')).toBeTruthy();
    });

    it('renders Preferences row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-preferences')).toBeTruthy();
    });

    it('renders Notifications row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-notifications')).toBeTruthy();
    });

    it('renders Billing & Subscription row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-billing')).toBeTruthy();
    });

    it('renders Help & Support row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-help')).toBeTruthy();
    });

    it('renders About row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-about')).toBeTruthy();
    });

    it('renders Messages row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-messages')).toBeTruthy();
    });

    it('renders Management row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-management')).toBeTruthy();
    });

    it('renders Sign Out row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-logout')).toBeTruthy();
    });
  });

  describe('unread notification badge', () => {
    it('does not show a badge when unread count is 0', () => {
      mockUnreadCount = 0;
      renderYouTab();
      expect(screen.queryByText('0')).toBeNull();
    });

    it('shows the unread count badge when count is greater than 0', () => {
      mockUnreadCount = 7;
      renderYouTab();
      expect(screen.getByText('7')).toBeTruthy();
    });

    it('shows 99+ when unread count exceeds 99', () => {
      mockUnreadCount = 150;
      renderYouTab();
      expect(screen.getByText('99+')).toBeTruthy();
    });
  });

  describe('navigation', () => {
    it('navigates to profile-settings when Profile row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-profile'));
      expect(mockNavigate).toHaveBeenCalledWith('profile-settings');
    });

    it('navigates to preferences when Preferences row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-preferences'));
      expect(mockNavigate).toHaveBeenCalledWith('preferences');
    });

    it('navigates to notifications when Notifications row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-notifications'));
      expect(mockNavigate).toHaveBeenCalledWith('notifications');
    });

    it('navigates to subscription-settings when Billing row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-billing'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
    });

    it('navigates to help when Help row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-help'));
      expect(mockNavigate).toHaveBeenCalledWith('help');
    });

    it('navigates to about when About row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-about'));
      expect(mockNavigate).toHaveBeenCalledWith('about');
    });

    it('navigates to DirectMessages when Messages row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-messages'));
      expect(mockNavigate).toHaveBeenCalledWith('DirectMessages');
    });

    it('navigates to management when Management row is pressed', () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-management'));
      expect(mockNavigate).toHaveBeenCalledWith('management');
    });
  });

  describe('logout', () => {
    it('calls logout when Sign Out is pressed', async () => {
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-logout'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    it('deactivates the push token before logout on a physical device', async () => {
      mockIsPhysicalDevice = true;
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-logout'));
      await waitFor(() => {
        expect(mockDisableDeviceToken).toHaveBeenCalledWith({
          variables: { deviceToken: 'mock-token' },
        });
      });
      expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({
        projectId: 'proj-test',
      });
      expect(mockLogout).toHaveBeenCalled();
    });

    it('skips push token deactivation when no EAS projectId is configured', async () => {
      mockIsPhysicalDevice = true;
      mockEasProjectId = undefined;
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-logout'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
      expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
      expect(mockDisableDeviceToken).not.toHaveBeenCalled();
    });

    it('skips push token deactivation on non-physical devices', async () => {
      mockIsPhysicalDevice = false;
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-logout'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
      expect(mockDisableDeviceToken).not.toHaveBeenCalled();
    });

    it('still logs out if push token deactivation fails', async () => {
      mockIsPhysicalDevice = true;
      mockDisableDeviceToken.mockRejectedValue(new Error('network'));
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-logout'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    it('shows "Signing out…" label while logout is in progress', async () => {
      let resolveLogout!: () => void;
      mockLogout.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveLogout = resolve;
        }),
      );

      renderYouTab();
      fireEvent.press(screen.getByTestId('you-logout'));

      await waitFor(() => {
        expect(screen.getByText('Signing out…')).toBeTruthy();
      });

      resolveLogout();
    });
  });
});
