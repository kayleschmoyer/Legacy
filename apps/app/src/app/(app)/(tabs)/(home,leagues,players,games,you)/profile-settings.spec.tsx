import React from 'react';
import { Alert, BackHandler } from 'react-native';
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
const mockRefetchIdentities = jest.fn();
const mockUnlinkDiscordAccount = jest.fn();
const mockNavigate = jest.fn();
const mockUseCurrentUserInfo = jest.fn();
const mockUseGetUserByIdQuery = jest.fn();
const mockUseMyIdentitiesQuery = jest.fn();

const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  avatarUrl: null as string | null,
  accessLevel: 'none',
};

jest.mock('../../../../utils/analytics', () => ({
  trackSignOut: jest.fn(),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({
      navigate: (...args: unknown[]): void => {
        mockNavigate(...args);
      },
      back: (): void => {
        mockBack();
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
    BrandIcon: ({ name }: { name: string }) =>
      React.createElement(View, { testID: `brand-icon-${name}` }),
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

jest.mock('../../../../common/auth/AuthHooks', () => ({
  useAuthHandlers: () => ({
    logout: (...args: unknown[]): unknown => mockLogout(...args),
  }),
  useCurrentUserInfo: (...args: unknown[]): unknown =>
    mockUseCurrentUserInfo(...args),
  unlinkDiscordAccount: (...args: unknown[]): unknown =>
    mockUnlinkDiscordAccount(...args),
}));

let mockSubscriptionState: {
  isPremium: boolean;
  tier: string | null;
  subscription: Record<string, unknown> | null;
} = { isPremium: false, tier: null, subscription: null };

jest.mock('../../../../features/subscription', () => ({
  useSubscription: () => mockSubscriptionState,
  getSubscriptionWarning: jest.requireActual<
    typeof import('../../../../features/subscription/subscriptionWarning')
  >('../../../../features/subscription/subscriptionWarning')
    .getSubscriptionWarning,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: (...args: unknown[]): unknown =>
    mockUseGetUserByIdQuery(...args),
  useMyIdentitiesQuery: (...args: unknown[]): unknown =>
    mockUseMyIdentitiesQuery(...args),
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

const googleIdentity = {
  id: 10,
  provider: 'google',
  providerEmail: 'test@example.com',
  providerEmailVerified: true,
  providerUsername: null,
  providerAvatar: null,
  linkedAt: '2026-01-01T00:00:00Z',
};

const discordIdentity = {
  id: 11,
  provider: 'discord',
  providerEmail: 'disc@example.com',
  providerEmailVerified: false,
  providerUsername: 'discord_user',
  providerAvatar: null,
  linkedAt: '2026-01-02T00:00:00Z',
};

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
    mockRefetchIdentities.mockResolvedValue({});
    mockUnlinkDiscordAccount.mockResolvedValue(undefined);
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
    mockUseMyIdentitiesQuery.mockReturnValue({
      data: { myIdentities: [googleIdentity] },
      loading: false,
      error: undefined,
      refetch: (...args: unknown[]): unknown => mockRefetchIdentities(...args),
    });
  });

  describe('initial rendering', () => {
    it('renders the Profile Settings heading', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Profile Settings')).toBeTruthy();
    });

    it('labels a non-admin user Member, never Limited (LS-10650)', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Member')).toBeTruthy();
      expect(screen.queryByText('Limited')).toBeNull();
    });

    it('labels an admin user Administrator', () => {
      mockUseGetUserByIdQuery.mockReturnValue({
        data: { user: { ...mockUser, accessLevel: 'admin' } },
        refetch: (...args: unknown[]): unknown => mockRefetchUser(...args),
      });
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Administrator')).toBeTruthy();
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

    it('derives the sign-in method from linked identities', () => {
      mockUseMyIdentitiesQuery.mockReturnValue({
        data: { myIdentities: [googleIdentity, discordIdentity] },
        loading: false,
      });
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Google, Discord')).toBeTruthy();
      expect(screen.queryByText('Google OAuth')).toBeNull();
    });

    it('renders Active as the session status', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('Active')).toBeTruthy();
    });
  });

  describe('connected accounts (LS-10410)', () => {
    it('shows a loading state while identities load', () => {
      mockUseMyIdentitiesQuery.mockReturnValue({
        data: undefined,
        loading: true,
      });
      render(<ProfileSettingsScreen />);
      expect(screen.getByTestId('identities-loading')).toBeTruthy();
    });

    it('shows the empty state when there are no identities', () => {
      mockUseMyIdentitiesQuery.mockReturnValue({
        data: { myIdentities: [] },
        loading: false,
      });
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('No linked providers found.')).toBeTruthy();
      expect(screen.getByText('Not connected')).toBeTruthy();
    });

    it('treats a partial response without myIdentities as empty', () => {
      mockUseMyIdentitiesQuery.mockReturnValue({ data: {}, loading: false });
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('No linked providers found.')).toBeTruthy();
    });

    it('shows the Discord username and unverified suffix for a linked Discord identity', () => {
      mockUseMyIdentitiesQuery.mockReturnValue({
        data: { myIdentities: [discordIdentity] },
        loading: false,
      });
      render(<ProfileSettingsScreen />);
      expect(screen.getByText('discord_user (unverified)')).toBeTruthy();
      expect(screen.queryByText('Not connected')).toBeNull();
    });

    it('shows the provider email for non-Discord identities and Not connected for Discord', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.getByTestId('identity-row-google')).toBeTruthy();
      expect(
        screen.getByTestId('identity-row-discord-not-connected'),
      ).toBeTruthy();
    });

    it('shows an error state when the query fails', () => {
      mockUseMyIdentitiesQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('boom'),
      });
      render(<ProfileSettingsScreen />);
      expect(screen.getByTestId('identities-error')).toBeTruthy();
    });

    it('renders the same card for premium users', () => {
      mockSubscriptionState = {
        isPremium: true,
        tier: 'annual',
        subscription: null,
      };
      render(<ProfileSettingsScreen />);
      expect(screen.getByTestId('connected-accounts-card')).toBeTruthy();
    });
  });

  describe('disconnect Discord (LS-10413)', () => {
    const linkedDiscord = (): void => {
      mockUseMyIdentitiesQuery.mockReturnValue({
        data: { myIdentities: [googleIdentity, discordIdentity] },
        loading: false,
        refetch: (...args: unknown[]): unknown =>
          mockRefetchIdentities(...args),
      });
    };

    it('shows Disconnect only on a linked Discord row', () => {
      render(<ProfileSettingsScreen />);
      expect(screen.queryByTestId('disconnect-discord')).toBeNull();

      linkedDiscord();
      render(<ProfileSettingsScreen />);
      expect(screen.getByTestId('disconnect-discord')).toBeTruthy();
    });

    it('opens the confirmation without making a request', () => {
      linkedDiscord();
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByTestId('disconnect-discord'));
      expect(screen.getByText('Disconnect Discord?')).toBeTruthy();
      expect(screen.getByText('Keep connected')).toBeTruthy();
      expect(mockUnlinkDiscordAccount).not.toHaveBeenCalled();
    });

    it('cancel dismisses the confirmation and makes no request', () => {
      linkedDiscord();
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByTestId('disconnect-discord'));
      fireEvent.press(screen.getByTestId('confirm-dialog-cancel'));
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
      expect(mockUnlinkDiscordAccount).not.toHaveBeenCalled();
      expect(mockRefetchIdentities).not.toHaveBeenCalled();
    });

    it('confirming unlinks, then refetches identities and the user', async () => {
      linkedDiscord();
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByTestId('disconnect-discord'));
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => expect(mockRefetchIdentities).toHaveBeenCalled());
      expect(mockUnlinkDiscordAccount).toHaveBeenCalledTimes(1);
      expect(mockRefetchUser).toHaveBeenCalled();
      expect(screen.queryByTestId('unlink-error')).toBeNull();
    });

    it('shows the server message inline and skips the refetch on a 409', async () => {
      linkedDiscord();
      mockUnlinkDiscordAccount.mockRejectedValue(
        new Error('Cannot unlink your only sign-in method'),
      );
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByTestId('disconnect-discord'));
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));

      expect(
        await screen.findByText('Cannot unlink your only sign-in method'),
      ).toBeTruthy();
      expect(mockRefetchIdentities).not.toHaveBeenCalled();
    });

    it('disables Disconnect and shows a spinner while the request is in flight', async () => {
      linkedDiscord();
      let resolveUnlink: () => void = () => undefined;
      mockUnlinkDiscordAccount.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveUnlink = resolve;
        }),
      );
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByTestId('disconnect-discord'));
      fireEvent.press(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => expect(mockUnlinkDiscordAccount).toHaveBeenCalled());
      // The mocked Button drops onPress while disabled, so a second tap is inert.
      fireEvent.press(screen.getByTestId('disconnect-discord'));
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();

      await act(() => {
        resolveUnlink();
        return Promise.resolve();
      });
      await waitFor(() => expect(mockRefetchIdentities).toHaveBeenCalled());
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
        expect(mockUpdateUsername).toHaveBeenCalledWith(
          expect.objectContaining({ variables: { username: value } }),
        );
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
        expect(mockUpdateUsername).toHaveBeenCalledWith(
          expect.objectContaining({ variables: { username: 'newusername' } }),
        );
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

  describe('unsaved-changes guard (LS-7235)', () => {
    const backHandlers: Array<() => boolean> = [];
    let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

    beforeEach(() => {
      backHandlers.length = 0;
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {
        /* no-op */
      });
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

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('does not intercept back when not editing or when the input is unchanged', () => {
      render(<ProfileSettingsScreen />);
      expect(backHandlers).toHaveLength(0);
      fireEvent.press(screen.getByText('Edit'));
      expect(backHandlers).toHaveLength(0);
    });

    it('intercepts back once the username input is dirty and offers Keep editing / Discard', () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.changeText(screen.getByDisplayValue('testuser'), 'changed');
      expect(backHandlers).toHaveLength(1);

      expect(backHandlers[0]()).toBe(true);
      expect(alertSpy).toHaveBeenCalledWith(
        'Discard unsaved changes?',
        undefined,
        expect.arrayContaining([
          expect.objectContaining({ text: 'Keep editing' }),
          expect.objectContaining({ text: 'Discard' }),
        ]),
      );
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('discards the edit and navigates back when Discard is chosen', () => {
      render(<ProfileSettingsScreen />);
      fireEvent.press(screen.getByText('Edit'));
      fireEvent.changeText(screen.getByDisplayValue('testuser'), 'changed');
      backHandlers[0]();

      const buttons = alertSpy.mock.calls[0][2] ?? [];
      const discard = buttons.find((b) => b.text === 'Discard');
      void act(() => {
        void discard?.onPress?.();
      });
      expect(mockBack).toHaveBeenCalledTimes(1);
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

  describe('premium profile card (LS-7234)', () => {
    it('shows the gold Premium chip for premium users', () => {
      mockSubscriptionState = {
        isPremium: true,
        tier: 'monthly',
        subscription: null,
      };
      render(<ProfileSettingsScreen />);
      expect(screen.getByTestId('premium-chip')).toBeTruthy();
    });

    it('does not show the Premium chip for free users', () => {
      mockSubscriptionState = {
        isPremium: false,
        tier: null,
        subscription: null,
      };
      render(<ProfileSettingsScreen />);
      expect(screen.queryByTestId('premium-chip')).toBeNull();
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

    it.each([
      ['annual', 'Premium (Annual)'],
      ['lifetime', 'Premium (Lifetime)'],
      ['founders', 'Premium (founders)'],
    ])('labels the %s tier', (tier, label) => {
      mockSubscriptionState = {
        isPremium: true,
        tier,
        subscription: { ...baseSubscription, tier },
      };
      render(<ProfileSettingsScreen />);
      expect(screen.getByText(label)).toBeTruthy();
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
