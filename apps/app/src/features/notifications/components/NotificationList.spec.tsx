import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { NotificationList } from './NotificationList';
import type { NotificationHistoryItem } from '../../../api/db/graphql.generated';

// ── Mock type helpers ────────────────────────────────────────────────────────
type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('tamagui', () => {
  const { View, Text } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    Button: ({
      children,
      onPress,
      disabled,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
      size?: string;
      chromeless?: boolean;
      icon?: React.ComponentType;
    }) => (
      <Text testID={testID} onPress={disabled ? undefined : onPress}>
        {children}
      </Text>
    ),
    Card: ({
      children,
      onPress,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      elevate?: boolean;
      size?: string;
      bordered?: boolean;
      backgroundColor?: string;
      pressStyle?: Record<string, unknown>;
      animation?: string;
      margin?: string;
    }) => (
      <View testID={testID} onTouchEnd={onPress}>
        {children}
      </View>
    ),
    Circle: ({
      testID,
    }: {
      testID?: string;
      size?: string;
      backgroundColor?: string;
      marginLeft?: string;
    }) => <View testID={testID ?? 'unread-dot'} />,
    H6: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Text: ({
      children,
      testID,
      numberOfLines: _numberOfLines,
    }: {
      children?: React.ReactNode;
      testID?: string;
      numberOfLines?: number;
      fontSize?: string | number;
      color?: string;
      fontWeight?: string;
    }) => <Text testID={testID}>{children}</Text>,
    XStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
    YStack: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => <View testID={testID}>{children}</View>,
  };
});

jest.mock('@tamagui/lucide-icons', () => {
  const { View } = jest.requireActual<typeof import('react-native')>(
    'react-native',
  ) as RNComponents;
  return {
    Bell: ({ testID }: { testID?: string; size?: string; color?: string }) => (
      <View testID={testID ?? 'bell-icon'} />
    ),
    Check: () => <View testID="check-icon" />,
  };
});

// ── Test data ────────────────────────────────────────────────────────────────

const makeNotification = (
  overrides: Partial<NotificationHistoryItem> = {},
): NotificationHistoryItem => ({
  __typename: 'NotificationHistoryItem',
  id: '1',
  title: 'Matchup Started',
  message: 'Your matchup against Team Alpha has begun!',
  read: false,
  sentAt: new Date(Date.now() - 60000).toISOString(), // 1 min ago
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationList', () => {
  const mockMarkAsRead = jest.fn().mockResolvedValue(undefined);
  const mockMarkAllRead = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('empty state', () => {
    it('renders empty state when no notifications', () => {
      render(<NotificationList notifications={[]} />);
      expect(screen.getByText('No notifications')).toBeTruthy();
    });

    it('shows helpful message in empty state', () => {
      render(<NotificationList notifications={[]} />);
      expect(
        screen.getByText("You'll see notifications here when you receive them"),
      ).toBeTruthy();
    });

    it('does not show mark-all-as-read when no notifications', () => {
      render(
        <NotificationList notifications={[]} onMarkAllRead={mockMarkAllRead} />,
      );
      expect(screen.queryByText('Mark all as read')).toBeNull();
    });
  });

  describe('notification rendering', () => {
    it('renders a single notification with title and message', () => {
      render(<NotificationList notifications={[makeNotification()]} />);
      expect(screen.getByText('Matchup Started')).toBeTruthy();
      expect(
        screen.getByText('Your matchup against Team Alpha has begun!'),
      ).toBeTruthy();
    });

    it('renders multiple notifications', () => {
      const notifications = [
        makeNotification({ id: '1', title: 'Matchup Started' }),
        makeNotification({ id: '2', title: 'Matchup Ended', read: true }),
      ];
      render(<NotificationList notifications={notifications} />);
      expect(screen.getByText('Matchup Started')).toBeTruthy();
      expect(screen.getByText('Matchup Ended')).toBeTruthy();
    });

    it('shows unread dot for unread notifications', () => {
      render(
        <NotificationList
          notifications={[makeNotification({ read: false })]}
        />,
      );
      expect(screen.getByTestId('unread-dot')).toBeTruthy();
    });

    it('does not show unread dot for read notifications', () => {
      render(
        <NotificationList notifications={[makeNotification({ read: true })]} />,
      );
      expect(screen.queryByTestId('unread-dot')).toBeNull();
    });
  });

  describe('unread count header', () => {
    it('shows unread count and mark-all-read when there are unread notifications', () => {
      const notifications = [
        makeNotification({ id: '1', read: false }),
        makeNotification({ id: '2', read: false }),
      ];
      render(
        <NotificationList
          notifications={notifications}
          onMarkAllRead={mockMarkAllRead}
        />,
      );
      expect(screen.getByText('2 unread notifications')).toBeTruthy();
      expect(screen.getByText('Mark all as read')).toBeTruthy();
    });

    it('uses singular form for 1 unread notification', () => {
      render(
        <NotificationList
          notifications={[makeNotification({ read: false })]}
          onMarkAllRead={mockMarkAllRead}
        />,
      );
      expect(screen.getByText('1 unread notification')).toBeTruthy();
    });

    it('does not show unread header when all notifications are read', () => {
      render(
        <NotificationList
          notifications={[makeNotification({ read: true })]}
          onMarkAllRead={mockMarkAllRead}
        />,
      );
      expect(screen.queryByText(/unread notification/)).toBeNull();
    });
  });

  describe('mark as read', () => {
    it('shows mark-as-read button for unread notifications', () => {
      render(
        <NotificationList
          notifications={[makeNotification({ read: false })]}
          onMarkAsRead={mockMarkAsRead}
        />,
      );
      expect(screen.getByText('Mark as read')).toBeTruthy();
    });

    it('does not show mark-as-read button for read notifications', () => {
      render(
        <NotificationList
          notifications={[makeNotification({ read: true })]}
          onMarkAsRead={mockMarkAsRead}
        />,
      );
      expect(screen.queryByText('Mark as read')).toBeNull();
    });

    it('calls markAllRead when mark-all-as-read is pressed', async () => {
      render(
        <NotificationList
          notifications={[makeNotification({ read: false })]}
          onMarkAllRead={mockMarkAllRead}
        />,
      );
      fireEvent.press(screen.getByText('Mark all as read'));
      await waitFor(() => {
        expect(mockMarkAllRead).toHaveBeenCalled();
      });
    });

    it('calls onMarkAsRead with the notification id when mark-as-read is pressed', async () => {
      render(
        <NotificationList
          notifications={[makeNotification({ id: '42', read: false })]}
          onMarkAsRead={mockMarkAsRead}
        />,
      );
      fireEvent.press(screen.getByText('Mark as read'), {
        stopPropagation: jest.fn(),
      });
      await waitFor(() => {
        expect(mockMarkAsRead).toHaveBeenCalledWith(42);
      });
    });
  });

  describe('notification press', () => {
    it('does not crash when onNotificationPress is not provided', () => {
      render(<NotificationList notifications={[makeNotification()]} />);
      // Should render without error
      expect(screen.getByText('Matchup Started')).toBeTruthy();
    });
  });

  describe('null id handling', () => {
    it('renders without duplicate-key issues when item.id is null', () => {
      const notifications = [
        makeNotification({
          id: null as unknown as string,
          title: 'Notification A',
        }),
        makeNotification({
          id: null as unknown as string,
          title: 'Notification B',
        }),
      ];
      render(<NotificationList notifications={notifications} />);
      expect(screen.getByText('Notification A')).toBeTruthy();
      expect(screen.getByText('Notification B')).toBeTruthy();
    });
  });
});
