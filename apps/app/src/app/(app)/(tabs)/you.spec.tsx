import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Platform } from 'react-native';

import YouTab from './you';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockLogout = jest.fn<Promise<void>, []>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

jest.mock('../../../common/auth/AuthHooks', () => ({
  useAuthHandlers: () => ({ logout: mockLogout }),
}));

let mockUnreadCount = 0;

jest.mock('../../../api/db/graphql.generated', () => ({
  useGetUnreadNotificationCountQuery: () => ({
    data: { getUnreadNotificationCount: mockUnreadCount },
  }),
}));

jest.mock('tamagui', () => {
  const { View, Text, Pressable } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');

  return {
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

function setPlatformOS(os: string): void {
  Object.defineProperty(Platform, 'OS', {
    get: () => os,
    configurable: true,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('YouTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnreadCount = 0;
    setPlatformOS('ios');
    mockLogout.mockResolvedValue(undefined);
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

    it('renders Sign Out row', () => {
      renderYouTab();
      expect(screen.getByTestId('you-logout')).toBeTruthy();
    });
  });

  describe('Check for Updates (platform-conditional)', () => {
    it('hides Check for Updates on iOS', () => {
      setPlatformOS('ios');
      renderYouTab();
      expect(screen.queryByTestId('you-update-check')).toBeNull();
    });

    it('shows Check for Updates on Android', () => {
      setPlatformOS('android');
      renderYouTab();
      expect(screen.getByTestId('you-update-check')).toBeTruthy();
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

    it('navigates to update-check when Check for Updates row is pressed (Android)', () => {
      setPlatformOS('android');
      renderYouTab();
      fireEvent.press(screen.getByTestId('you-update-check'));
      expect(mockNavigate).toHaveBeenCalledWith('update-check');
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
