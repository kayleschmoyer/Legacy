import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { CombinedGraphQLErrors } from '@apollo/client';

// ── Component under test ─────────────────────────────────────────────────────
import { LeagueDuesSetup } from './LeagueDuesSetup';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock tamagui to plain React Native primitives so the component renders without
// a TamaguiProvider/theme (mirrors SalaryCapManagementCard.spec.tsx).
jest.mock('tamagui', () => {
  const { View, Text, Pressable, TextInput } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const passthrough =
    (Component: React.ComponentType) =>
    ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      ReactActual.createElement(Component, null, children);
  const Switch = ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    [key: string]: unknown;
  }) =>
    ReactActual.createElement(Pressable, {
      accessibilityRole: 'switch',
      accessibilityState: { checked },
      onPress: () => onCheckedChange?.(!checked),
    });
  Switch.Thumb = () => null;
  return {
    createTokens: (tokens: unknown) => tokens,
    Card: passthrough(View),
    YStack: passthrough(View),
    XStack: passthrough(View),
    Separator: passthrough(View),
    Spinner: () => null,
    Text: passthrough(Text),
    Switch,
    Input: ({
      value,
      onChangeText,
      placeholder,
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      placeholder?: string;
      [key: string]: unknown;
    }) =>
      ReactActual.createElement(TextInput, {
        value,
        onChangeText,
        placeholder,
      }),
    Button: ({
      children,
      onPress,
      disabled,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      [key: string]: unknown;
    }) =>
      ReactActual.createElement(
        Pressable,
        { onPress, disabled, accessibilityRole: 'button' },
        ReactActual.createElement(Text, null, children),
      ),
  };
});

const mockUpdate = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDuesSettingsQuery: () => ({
    data: {
      leagueDuesSettings: {
        enabled: true,
        amountCents: 5000,
        reminderEnabled: false,
        reminderDayOfWeek: 1,
      },
    },
    loading: false,
  }),
  useUpdateDuesSettingsMutation: () => [mockUpdate, { loading: false }],
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const amountInput = () => screen.getByPlaceholderText('e.g. 50.00');
const saveButton = () => screen.getByRole('button', { name: 'Save Settings' });

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeagueDuesSetup amount validation (LS-10987)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts exactly $10,000', () => {
    render(<LeagueDuesSetup leagueId={1} />);

    fireEvent.changeText(amountInput(), '10000');

    expect(
      screen.queryByText('Dues amount cannot exceed $10,000'),
    ).not.toBeOnTheScreen();
    expect(saveButton()).toBeEnabled();
  });

  it.each(['10000.01', '25000', '99999999999'])(
    'shows the inline cap error and disables Save for $%s',
    (amount) => {
      render(<LeagueDuesSetup leagueId={1} />);

      fireEvent.changeText(amountInput(), amount);

      expect(
        screen.getByText('Dues amount cannot exceed $10,000'),
      ).toBeOnTheScreen();
      expect(saveButton()).toBeDisabled();
      fireEvent.press(saveButton());
      expect(mockUpdate).not.toHaveBeenCalled();
    },
  );

  it('keeps the greater-than-$0 check', () => {
    render(<LeagueDuesSetup leagueId={1} />);

    fireEvent.changeText(amountInput(), '0');

    expect(
      screen.getByText('Please enter a valid dues amount greater than $0'),
    ).toBeOnTheScreen();
    expect(saveButton()).toBeDisabled();
  });

  it('never forwards raw GraphQL coercion text to onError', async () => {
    mockUpdate.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          {
            message:
              'Int cannot represent non 32-bit signed integer value: 99999999999',
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      }),
    );
    const onError = jest.fn();
    render(<LeagueDuesSetup leagueId={1} onError={onError} />);

    fireEvent.changeText(amountInput(), '50');
    fireEvent.press(saveButton());

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          "Couldn't save dues settings. Please check the amount and try again.",
      }),
    );
  });

  it('forwards the friendly message from a resolver-raised input error', async () => {
    mockUpdate.mockRejectedValue(
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Dues amount cannot exceed $10,000',
            path: ['updateDuesSettings'],
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      }),
    );
    const onError = jest.fn();
    render(<LeagueDuesSetup leagueId={1} onError={onError} />);

    fireEvent.changeText(amountInput(), '50');
    fireEvent.press(saveButton());

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Dues amount cannot exceed $10,000',
      }),
    );
  });
});
