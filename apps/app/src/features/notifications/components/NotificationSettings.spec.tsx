import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

// ── Component under test ─────────────────────────────────────────────────────
import { NotificationSettings } from './NotificationSettings';
import type { NotificationPreference } from '../../../api/db/graphql.generated';

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
    Card: Object.assign(
      ({
        children,
        testID,
      }: {
        children: React.ReactNode;
        testID?: string;
        elevate?: boolean;
        size?: string;
        bordered?: boolean;
        animation?: string;
      }) => <View testID={testID}>{children}</View>,
      {
        Header: ({
          children,
          padded: _padded,
        }: {
          children: React.ReactNode;
          padded?: boolean;
        }) => <View>{children}</View>,
      },
    ),
    H5: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Label: ({
      children,
      htmlFor: _htmlFor,
      flex: _flex,
    }: {
      children: React.ReactNode;
      htmlFor?: string;
      flex?: number;
    }) => <View>{children}</View>,
    Separator: () => <View testID="separator" />,
    Switch: ({
      id,
      checked,
      onCheckedChange,
      disabled,
    }: {
      id: string;
      checked: boolean;
      onCheckedChange: (v: boolean) => void;
      disabled?: boolean;
    }) => (
      <Text
        testID={`switch-${id}`}
        onPress={() => {
          if (!disabled) onCheckedChange(!checked);
        }}
      >
        {checked ? 'on' : 'off'}
      </Text>
    ),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      fontSize?: string | number;
      fontWeight?: string;
      color?: string;
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
    Settings: () => <View testID="settings-icon" />,
  };
});

// ── Test data ────────────────────────────────────────────────────────────────

const makePreferences = (
  overrides: Partial<NotificationPreference> = {},
): NotificationPreference => ({
  __typename: 'NotificationPreference',
  id: 1,
  userId: 1,
  matchupStartedEnabled: true,
  matchupEndedEnabled: true,
  matchupCloseGameEnabled: false,
  matchupReminderEnabled: true,
  pushEnabled: true,
  emailEnabled: false,
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationSettings', () => {
  const mockOnUpdate = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      render(
        <NotificationSettings
          preferences={makePreferences()}
          onUpdate={mockOnUpdate}
        />,
      );
      expect(screen.getByText('Notification Preferences')).toBeTruthy();
    });

    it('renders all notification type toggles', () => {
      render(
        <NotificationSettings
          preferences={makePreferences()}
          onUpdate={mockOnUpdate}
        />,
      );
      expect(screen.getByTestId('switch-matchup-started')).toBeTruthy();
      expect(screen.getByTestId('switch-matchup-ended')).toBeTruthy();
      expect(screen.getByTestId('switch-close-game')).toBeTruthy();
      expect(screen.getByTestId('switch-reminders')).toBeTruthy();
    });

    it('renders all channel toggles', () => {
      render(
        <NotificationSettings
          preferences={makePreferences()}
          onUpdate={mockOnUpdate}
        />,
      );
      expect(screen.getByTestId('switch-push-enabled')).toBeTruthy();
      expect(screen.getByTestId('switch-email-enabled')).toBeTruthy();
    });

    it('shows correct on/off state for each toggle', () => {
      render(
        <NotificationSettings
          preferences={makePreferences({
            matchupStartedEnabled: true,
            matchupCloseGameEnabled: false,
          })}
          onUpdate={mockOnUpdate}
        />,
      );
      expect(screen.getByTestId('switch-matchup-started')).toHaveTextContent(
        'on',
      );
      expect(screen.getByTestId('switch-close-game')).toHaveTextContent('off');
    });
  });

  describe('toggle interactions', () => {
    it('calls onUpdate when matchup-started toggle is pressed', () => {
      render(
        <NotificationSettings
          preferences={makePreferences({ matchupStartedEnabled: true })}
          onUpdate={mockOnUpdate}
        />,
      );
      fireEvent.press(screen.getByTestId('switch-matchup-started'));
      expect(mockOnUpdate).toHaveBeenCalledWith({
        matchupStartedEnabled: false,
      });
    });

    it('calls onUpdate when matchup-ended toggle is pressed', () => {
      render(
        <NotificationSettings
          preferences={makePreferences({ matchupEndedEnabled: false })}
          onUpdate={mockOnUpdate}
        />,
      );
      fireEvent.press(screen.getByTestId('switch-matchup-ended'));
      expect(mockOnUpdate).toHaveBeenCalledWith({ matchupEndedEnabled: true });
    });

    it('calls onUpdate when close-game toggle is pressed', () => {
      render(
        <NotificationSettings
          preferences={makePreferences({ matchupCloseGameEnabled: false })}
          onUpdate={mockOnUpdate}
        />,
      );
      fireEvent.press(screen.getByTestId('switch-close-game'));
      expect(mockOnUpdate).toHaveBeenCalledWith({
        matchupCloseGameEnabled: true,
      });
    });

    it('calls onUpdate when push-enabled toggle is pressed', () => {
      render(
        <NotificationSettings
          preferences={makePreferences({ pushEnabled: false })}
          onUpdate={mockOnUpdate}
        />,
      );
      fireEvent.press(screen.getByTestId('switch-push-enabled'));
      expect(mockOnUpdate).toHaveBeenCalledWith({ pushEnabled: true });
    });

    it('does not call onUpdate when disabled email toggle is pressed', () => {
      render(
        <NotificationSettings
          preferences={makePreferences({ emailEnabled: false })}
          onUpdate={mockOnUpdate}
        />,
      );
      // email is always disabled in the component
      fireEvent.press(screen.getByTestId('switch-email-enabled'));
      expect(mockOnUpdate).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows saving text when loading is true', () => {
      render(
        <NotificationSettings
          preferences={makePreferences()}
          onUpdate={mockOnUpdate}
          loading={true}
        />,
      );
      expect(screen.getByText('Saving preferences...')).toBeTruthy();
    });

    it('does not show saving text when not loading', () => {
      render(
        <NotificationSettings
          preferences={makePreferences()}
          onUpdate={mockOnUpdate}
          loading={false}
        />,
      );
      expect(screen.queryByText('Saving preferences...')).toBeNull();
    });
  });
});
