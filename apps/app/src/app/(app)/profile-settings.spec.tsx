import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

// ── Component under test ─────────────────────────────────────────────────────
import ProfileSettingsScreen from './profile-settings';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLogout = jest.fn();
const mockUpdateUsername = jest.fn();
const mockUpdateAvatar = jest.fn();
const mockRefetchUser = jest.fn();
const mockNavigate = jest.fn();
const mockUseCurrentUserInfo = jest.fn();
const mockUseGetUserByIdQuery = jest.fn();

const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  avatarUrl: null as string | null,
  accessLevel: 'user',
};

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    navigate: (...args: unknown[]): void => {
      mockNavigate(...args);
    },
  }),
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    AvatarImage: () => React.createElement(View, { testID: 'avatar-image' }),
    AvatarPicker: () => React.createElement(View, { testID: 'avatar-picker' }),
  };
});

jest.mock('../../common/auth/AuthHooks', () => ({
  useAuthHandlers: () => ({
    logout: (...args: unknown[]): unknown => mockLogout(...args),
  }),
  useCurrentUserInfo: (...args: unknown[]): unknown =>
    mockUseCurrentUserInfo(...args),
}));

jest.mock('../../features/subscription', () => ({
  useSubscription: () => ({ isPremium: false, tier: null }),
}));

jest.mock('../../api/db/graphql.generated', () => ({
  useGetUserByIdQuery: (...args: unknown[]): unknown =>
    mockUseGetUserByIdQuery(...args),
  useUpdateUsernameMutation: () => [
    (...args: unknown[]): unknown => mockUpdateUsername(...args),
    { loading: false },
  ],
  useUpdateUserAvatarMutation: () => [
    (...args: unknown[]): unknown => mockUpdateAvatar(...args),
    { loading: false },
  ],
}));

jest.mock('tamagui', () => {
  const { View, Text, Pressable, TextInput } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    Button: ({
      children,
      onPress,
      disabled,
      testID,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      testID?: string;
      [key: string]: unknown;
    }) =>
      React.createElement(
        Text,
        { testID, onPress: disabled ? undefined : onPress },
        children,
      ),
    H1: ({
      children,
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement(Text, null, children),
    Input: ({
      value,
      onChangeText,
      testID,
      placeholder,
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      testID?: string;
      placeholder?: string;
      [key: string]: unknown;
    }) =>
      React.createElement(TextInput, {
        value,
        onChangeText,
        testID,
        placeholder,
      }),
    Paragraph: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(Text, { testID }, children),
    Separator: () => React.createElement(View, { testID: 'separator' }),
    Spinner: ({ testID }: { testID?: string; [key: string]: unknown }) =>
      React.createElement(View, { testID: testID ?? 'spinner' }),
    Text: ({
      children,
      testID,
    }: {
      children?: React.ReactNode;
      testID?: string;
      [key: string]: unknown;
    }) => React.createElement(Text, { testID }, children),
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
        return React.createElement(Pressable, { testID, onPress }, children);
      }
      return React.createElement(View, { testID }, children);
    },
    YStack: ({
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
        return React.createElement(Pressable, { testID, onPress }, children);
      }
      return React.createElement(View, { testID }, children);
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogout.mockResolvedValue(undefined);
    mockUpdateUsername.mockResolvedValue({});
    mockUpdateAvatar.mockResolvedValue({});
    mockRefetchUser.mockResolvedValue({});
    mockUseCurrentUserInfo.mockReturnValue({
      data: {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        isAdmin: false,
      },
    });
    mockUseGetUserByIdQuery.mockReturnValue({
      data: { user: mockUser },
      refetch: (...args: unknown[]): unknown => mockRefetchUser(...args),
    });
  });

  describe('initial rendering', () => {
    it('renders the Profile Settings heading', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Profile Settings')).toBeTruthy();
    });

    it('renders the username from user data', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getAllByText('testuser').length).toBeGreaterThanOrEqual(1);
    });

    it('renders the email address', () => {
      render(<ProfileSettingsScreen />);
      expect(
        screen.getAllByText('test@example.com').length,
      ).toBeGreaterThanOrEqual(1);
    });

    it('renders the user ID with a # prefix', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('#1')).toBeTruthy();
    });

    it('renders Google OAuth as the sign-in method', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Google OAuth')).toBeTruthy();
    });

    it('renders Active as the session status', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Active')).toBeTruthy();
    });
  });

  describe('avatar', () => {
    it('renders the avatar image', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByTestId('avatar-image')).toBeTruthy();
    });
  });

  describe('username editing', () => {
    it('renders an Edit button for the username field', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Edit')).toBeTruthy();
    });

    it('shows a text input and Save / Cancel buttons after pressing Edit', () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      expect(screen.getByDisplayValue('testuser')).toBeTruthy();
      expect(screen.getByText('Save')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('dismisses the editor and restores the Edit button when Cancel is pressed', () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.press(screen.getByText('Cancel'));
      expect(screen.queryByDisplayValue('testuser')).toBeNull();
      expect(screen.getByText('Edit')).toBeTruthy();
    });

    it('shows a validation error when the new username is shorter than 3 characters', async () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.changeText(screen.getByDisplayValue('testuser'), 'ab');
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => {
        expect(screen.getByText(/Username must be/)).toBeTruthy();
      });
    });

    it('calls the updateUsername mutation with the trimmed new username', async () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.changeText(
        screen.getByDisplayValue('testuser'),
        '  newusername  ',
      );
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => {
        expect(mockUpdateUsername).toHaveBeenCalledWith({
          variables: { username: 'newusername' },
        });
      });
    });
  });

  describe('sign out', () => {
    it('calls logout when the Sign Out button is pressed', async () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Sign Out'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });
  });

  describe('navigation', () => {
    it('navigates to subscription-settings when the billing section is pressed', () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Subscription & Billing'));
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
    });
  });
});
