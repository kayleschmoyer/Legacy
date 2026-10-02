import React from 'react';
import { BackHandler } from 'react-native';
import {
  act,
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

jest.mock('../../utils/analytics', () => ({
  trackSignOut: jest.fn(),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      navigate: (...args: unknown[]): void => {
        mockNavigate(...args);
      },
    }),
    // Run the focus effect on mount, like a focused screen would.
    useFocusEffect: (effect: () => void | (() => void)): void => {
      React.useEffect(effect, [effect]);
    },
  };
});

jest.mock('@legacy-sports/shared-components', () => {
  const { View, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    AvatarImage: () => React.createElement(View, { testID: 'avatar-image' }),
    AvatarPicker: () => React.createElement(View, { testID: 'avatar-picker' }),
    Dialog: ({
      open,
      title,
      confirmLabel,
      cancelLabel,
      onConfirm,
      onCancel,
    }: {
      open?: boolean;
      title: string;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm?: () => void;
      onCancel?: () => void;
    }) =>
      open
        ? React.createElement(
            View,
            { testID: 'confirm-dialog' },
            React.createElement(Text, null, title),
            React.createElement(
              Text,
              { testID: 'confirm-dialog-cancel', onPress: onCancel },
              cancelLabel,
            ),
            React.createElement(
              Text,
              { testID: 'confirm-dialog-confirm', onPress: onConfirm },
              confirmLabel,
            ),
          )
        : null,
    formatDisplayName: (username: string): string =>
      /^[^@]+@[^@]+\.[^@]+$/.test(username) ? username.split('@')[0] : username,
  };
});

jest.mock('../../common/auth/AuthHooks', () => ({
  useAuthHandlers: () => ({
    logout: (...args: unknown[]): unknown => mockLogout(...args),
  }),
  useCurrentUserInfo: (...args: unknown[]): unknown =>
    mockUseCurrentUserInfo(...args),
}));

let mockSubscriptionState: {
  isPremium: boolean;
  tier: string | null;
  subscription: Record<string, unknown> | null;
} = { isPremium: false, tier: null, subscription: null };

jest.mock('../../features/subscription', () => ({
  useSubscription: () => mockSubscriptionState,
  getSubscriptionWarning: jest.requireActual<
    typeof import('../../features/subscription/subscriptionWarning')
  >('../../features/subscription/subscriptionWarning').getSubscriptionWarning,
}));

jest.mock('@legacy-sports/graphql', () => ({
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
    createTokens: (tokens: unknown) => tokens,
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
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      accessibilityLabel?: string;
      [key: string]: unknown;
    }) => {
      if (onPress) {
        return React.createElement(
          Pressable,
          { testID, onPress, accessibilityLabel },
          children,
        );
      }
      return React.createElement(View, { testID }, children);
    },
    YStack: ({
      children,
      onPress,
      testID,
      accessibilityLabel,
      accessibilityState,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      accessibilityLabel?: string;
      accessibilityState?: { expanded?: boolean };
      [key: string]: unknown;
    }) => {
      if (onPress) {
        return React.createElement(
          Pressable,
          { testID, onPress, accessibilityLabel, accessibilityState },
          children,
        );
      }
      return React.createElement(View, { testID }, children);
    },
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionState = {
      isPremium: false,
      tier: null,
      subscription: null,
    };
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

    it('strips the email domain from the username when the backend username is an email address', () => {
      mockUseGetUserByIdQuery.mockReturnValue({
        data: {
          user: {
            ...mockUser,
            username: 'legacyplaywright@gmail.com',
            email: 'legacyplaywright@gmail.com',
          },
        },
        refetch: (...args: unknown[]): unknown => mockRefetchUser(...args),
      });
      render(<ProfileSettingsScreen />);
      // Stripped display name appears in the header and the Username field.
      expect(screen.getAllByText('legacyplaywright').length).toBe(2);
      // The full email still renders in its own subtitle/Email field spots
      // (unaffected), but is no longer duplicated into the Username field.
      expect(screen.getAllByText('legacyplaywright@gmail.com').length).toBe(2);
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

    it('exposes the expanded state on the Edit avatar button', () => {
      render(<ProfileSettingsScreen />);
      const button = screen.getByLabelText('Edit avatar');
      expect(button.props.accessibilityState).toEqual({ expanded: false });
      fireEvent.press(button);
      expect(screen.getByTestId('avatar-picker')).toBeTruthy();
      expect(
        screen.getByLabelText('Edit avatar').props.accessibilityState,
      ).toEqual({ expanded: true });
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

    // Boundary parity with web (LS-7671): both platforms share validateUsername.
    it.each([
      ['51 characters', 'a'.repeat(51)],
      ['emoji', 'user😀name'],
      ['interior whitespace', 'user name'],
    ])(
      'rejects a username with %s without calling the mutation',
      async (_label, value) => {
        mockUpdateUsername.mockClear();
        render(<ProfileSettingsScreen />);
        fireEvent.press(screen.getByText('Edit'));
        fireEvent.changeText(screen.getByDisplayValue('testuser'), value);
        fireEvent.press(screen.getByText('Save'));
        await waitFor(() => {
          expect(screen.getByText(/Username must be/)).toBeTruthy();
        });
        expect(mockUpdateUsername).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['3 characters', 'abc'],
      ['50 characters', 'a'.repeat(50)],
      ['a leading dot', '.hidden'],
    ])('accepts a username with %s', async (_label, value) => {
      mockUpdateUsername.mockClear();
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.changeText(screen.getByDisplayValue('testuser'), value);
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => {
        expect(mockUpdateUsername).toHaveBeenCalledWith({
          variables: { username: value },
        });
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

    it('shows the server error message when the updateUsername mutation rejects', async () => {
      mockUpdateUsername.mockRejectedValueOnce(new Error('Username is taken'));
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.changeText(screen.getByDisplayValue('testuser'), 'newusername');
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => {
        expect(screen.getByText('Username is taken')).toBeTruthy();
      });
      expect(screen.queryByText(/may already be taken/)).toBeNull();
    });

    it('falls back to a generic message when the rejection is not an Error', async () => {
      mockUpdateUsername.mockRejectedValueOnce('boom');
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.changeText(screen.getByDisplayValue('testuser'), 'newusername');
      fireEvent.press(screen.getByText('Save'));
      await waitFor(() => {
        expect(
          screen.getByText('Failed to update username. Please try again.'),
        ).toBeTruthy();
      });
    });
  });

  describe('sign out', () => {
    it('asks for confirmation instead of logging out immediately (LS-7221)', () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Sign Out'));
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('does not log out when the confirmation is cancelled (LS-7221)', () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Sign Out'));
      fireEvent.press(screen.getByTestId('confirm-dialog-cancel'));
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
      expect(mockLogout).not.toHaveBeenCalled();
    });

    it('calls logout once the sign-out is confirmed', async () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Sign Out'));
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));
      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    describe('hardware back during sign-out (LS-7223)', () => {
      const backHandlers: Array<() => boolean> = [];

      afterEach(() => {
        mockLogout.mockReset();
        jest.restoreAllMocks();
      });

      beforeEach(() => {
        backHandlers.length = 0;
        jest
          .spyOn(BackHandler, 'addEventListener')
          .mockImplementation((_event, handler) => {
            backHandlers.push(handler as () => boolean);
            return {
              remove: jest.fn(() => {
                const idx = backHandlers.indexOf(handler as () => boolean);
                if (idx !== -1) backHandlers.splice(idx, 1);
              }),
            };
          });
      });

      it('does not intercept hardware back when not signing out', () => {
        render(<ProfileSettingsScreen />);
        expect(backHandlers).toHaveLength(0);
      });

      it('swallows hardware back while signing out and releases it afterwards', async () => {
        let finishLogout: () => void = () => undefined;
        mockLogout.mockImplementation(
          () =>
            new Promise<void>((resolve) => {
              finishLogout = resolve;
            }),
        );
        render(<ProfileSettingsScreen />);
        fireEvent.press(screen.getByText('Sign Out'));
        fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));

        await waitFor(() => {
          expect(screen.getByText('Signing out...')).toBeTruthy();
        });
        expect(backHandlers).toHaveLength(1);
        expect(backHandlers[0]()).toBe(true);

        await act(() => {
          finishLogout();
        });
        await waitFor(() => {
          expect(backHandlers).toHaveLength(0);
        });
      });
    });
  });

  describe('subscription grace state (LS-7228)', () => {
    const premium = {
      isPremium: true,
      tier: 'monthly',
    };
    const baseSubscription = {
      status: 'active',
      tier: 'monthly',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: null,
      trialEndsAt: null,
    };

    it('shows no warning for a premium account in good standing', () => {
      mockSubscriptionState = { ...premium, subscription: baseSubscription };
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Premium (Monthly)')).toBeTruthy();
      expect(screen.queryByText(/Payment failed/)).toBeNull();
      expect(screen.queryByText(/Cancels/)).toBeNull();
      expect(
        screen.getByLabelText('Subscription and billing settings'),
      ).toBeTruthy();
    });

    it('warns with the billing deadline when the payment failed', () => {
      mockSubscriptionState = {
        ...premium,
        subscription: {
          ...baseSubscription,
          status: 'past_due',
          gracePeriodEndsAt: '2099-01-15T12:00:00.000Z',
        },
      };
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Premium (Monthly)')).toBeTruthy();
      expect(
        screen.getByText('Payment failed \u2014 update billing by Jan 15'),
      ).toBeTruthy();
      // The pressable's accessibilityLabel overrides its children for screen
      // readers, so the warning has to be part of the label itself.
      expect(
        screen.getByLabelText(
          'Subscription and billing settings. Payment failed \u2014 update billing by Jan 15',
        ),
      ).toBeTruthy();
    });

    it('warns when the subscription is set to cancel at period end', () => {
      mockSubscriptionState = {
        ...premium,
        subscription: {
          ...baseSubscription,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date(
            Date.now() + 4.5 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      };
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Cancels in 5 days')).toBeTruthy();
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
