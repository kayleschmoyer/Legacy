import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Alert } from 'react-native';
import type {
  Pressable as RNPressable,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
} from 'react-native';

import CreateLeagueScreen from './create';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
  TextInput: typeof RNTextInput;
  Pressable: typeof RNPressable;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockNavigate = jest.fn();
let mockSearchParams: { name?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    navigate: mockNavigate,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

let mockIsPremium = false;
let mockPremiumLoading = false;
jest.mock('../../../features/subscription', () => ({
  useSubscription: () => ({
    isPremium: mockIsPremium,
    loading: mockPremiumLoading,
  }),
  PremiumGate: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@legacy-sports/shared-components/leagues', () => {
  const { View, Text, TextInput, Pressable } =
    jest.requireActual<RNComponents>('react-native');
  // Real salary-cap bounds so the LS-8361 validation tests exercise the same
  // range the component enforces.
  const { MIN_SALARY_CAP, MAX_SALARY_CAP } = jest.requireActual<
    typeof import('../../../../../../lib/shared-components/src/features/leagues/premium/constants')
  >(
    '../../../../../../lib/shared-components/src/features/leagues/premium/constants',
  );
  return {
    MIN_SALARY_CAP,
    MAX_SALARY_CAP,
    EraFilterGrid: () => null,
    CustomEraRange: () => null,
    WaiverSystemField: () => null,
    FaabBudgetField: () => null,
    DraftSlotTradingField: () => null,
    // Lean stand-in exposing the toggle, amount input, and inline error used
    // by the salary-cap validation tests (LS-8361).
    SalaryCapField: ({
      enabled,
      amount,
      onToggleEnabled,
      onAmountChange,
      error,
    }: {
      enabled: boolean;
      amount?: number;
      onToggleEnabled: (v: boolean) => void;
      onAmountChange: (v: number | undefined) => void;
      error?: string;
    }) => (
      <View>
        <Pressable
          testID="salary-cap-toggle"
          onPress={() => onToggleEnabled(!enabled)}
        />
        {enabled && (
          <TextInput
            testID="salary-cap-input"
            value={amount !== undefined ? String(amount) : ''}
            onChangeText={(text: string) => {
              const n = parseInt(text, 10);
              onAmountChange(isNaN(n) ? undefined : n);
            }}
          />
        )}
        {error !== undefined && <Text testID="salary-cap-error">{error}</Text>}
      </View>
    ),
  };
});

jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// react-native's index re-exports `require('./Libraries/Alert/Alert').default`,
// so the mock must live on `default` for `import { Alert }` to resolve to it.
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
}));

jest.mock('@legacy-sports/shared-components', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  return {
    DateTimePicker: ({
      value,
      placeholder,
    }: {
      value?: Date;
      onChange: (date: Date) => void;
      placeholder?: string;
      disabled?: boolean;
      minDate?: Date;
    }) => (
      <View testID="date-time-picker">
        <Text>{placeholder ?? 'DateTimePicker'}</Text>
        <Text testID="date-value">
          {value ? value.toISOString() : 'no date'}
        </Text>
      </View>
    ),
    Skeleton: () => <View testID="skeleton" />,
  };
});

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

const mockCreateLeagueMutate = jest.fn();
const mockCreateLeagueState = { loading: false, error: undefined };
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Football: 'football' },
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  useCreateLeagueMutation: (options?: {
    onCompleted?: (data: unknown) => void;
    onError?: (error: unknown) => void;
  }) => {
    mockCreateLeagueMutate.mockImplementation((_args: unknown) => {
      if (options?.onCompleted) {
        options.onCompleted({
          createLeagueAndTeams: { league: { id: 42, name: 'Test League' } },
        });
      }
      return Promise.resolve({
        data: {
          createLeagueAndTeams: { league: { id: 42, name: 'Test League' } },
        },
      });
    });
    return [mockCreateLeagueMutate, mockCreateLeagueState];
  },
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CreateLeagueScreen (unified)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPremium = false;
    mockPremiumLoading = false;
    mockSearchParams = {};
  });

  describe('sport selector', () => {
    it('renders the baseball and football sport selector buttons', () => {
      render(<CreateLeagueScreen />);
      expect(screen.getByTestId('sport-selector-baseball')).toBeTruthy();
      expect(screen.getByTestId('sport-selector-football')).toBeTruthy();
    });

    it('defaults to baseball', () => {
      render(<CreateLeagueScreen />);
      // "All MLB" is baseball-specific; confirms sport defaults to baseball
      expect(screen.getByText('All MLB')).toBeTruthy();
    });

    it('switches to football fields when football is selected', () => {
      render(<CreateLeagueScreen />);
      fireEvent.press(screen.getByTestId('sport-selector-football'));
      expect(screen.getByText('All NFL')).toBeTruthy();
      expect(screen.getByText('Half-PPR')).toBeTruthy();
      expect(screen.getByText('D/ST')).toBeTruthy();
    });

    it('switches back to baseball fields when baseball is selected after football', () => {
      render(<CreateLeagueScreen />);
      fireEvent.press(screen.getByTestId('sport-selector-football'));
      fireEvent.press(screen.getByTestId('sport-selector-baseball'));
      expect(screen.getByText('All MLB')).toBeTruthy();
    });
  });

  describe('baseball form', () => {
    it('renders baseball player pool options by default', () => {
      render(<CreateLeagueScreen />);
      expect(screen.getByText('All MLB')).toBeTruthy();
      expect(screen.getByText('NL Only')).toBeTruthy();
      expect(screen.getByText('AL Only')).toBeTruthy();
    });

    it('renders baseball roster size options', () => {
      render(<CreateLeagueScreen />);
      for (const size of [20, 22, 25, 30, 35, 40]) {
        expect(screen.getByText(String(size))).toBeTruthy();
      }
    });

    it('renders the date picker', () => {
      render(<CreateLeagueScreen />);
      expect(screen.getByTestId('date-time-picker')).toBeTruthy();
    });

    it('renders Create League and Cancel buttons', () => {
      render(<CreateLeagueScreen />);
      expect(
        screen.getByRole('button', { name: 'Create League' }),
      ).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('updates league name when typed', () => {
      render(<CreateLeagueScreen />);
      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'My Test League');
      expect(input.props.value).toBe('My Test League');
    });

    it('cancel button navigates to /baseball (LS-5372)', () => {
      render(<CreateLeagueScreen />);
      fireEvent.press(screen.getByText('Cancel'));
      expect(mockNavigate).toHaveBeenCalledWith('/baseball');
    });

    it('pre-fills the league name from the ?name= route param (LS-5372)', () => {
      mockSearchParams = { name: 'Diamond Dynasty' };
      render(<CreateLeagueScreen />);
      const input = screen.getByPlaceholderText('Enter your league name');
      expect(input.props.value).toBe('Diamond Dynasty');
    });

    it('calls mutation with baseball input and navigates to baseball league on success', async () => {
      render(<CreateLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'My Baseball League',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith('/baseball/league/42');
      });
    });

    it('does not call mutation when league name is too short', () => {
      render(<CreateLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'AB',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
    });
  });

  describe('baseball salary cap validation (LS-8361)', () => {
    // Renders the screen with a valid league name and the salary cap enabled,
    // then types `amountText` into the cap input (skipped when undefined).
    const setUpWithSalaryCap = (amountText?: string) => {
      render(<CreateLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'My Baseball League',
      );
      fireEvent.press(screen.getByTestId('salary-cap-toggle'));
      if (amountText !== undefined) {
        fireEvent.changeText(
          screen.getByTestId('salary-cap-input'),
          amountText,
        );
      }
    };

    const submit = () =>
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

    it('rejects salaryCap 0 (previously passed the undefined-only check)', () => {
      setUpWithSalaryCap('0');
      submit();
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.stringMatching(/Salary cap must be between/),
      );
    });

    it('rejects a negative salaryCap', () => {
      setUpWithSalaryCap('-100');
      submit();
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.stringMatching(/Salary cap must be between/),
      );
    });

    it('rejects a salaryCap above the maximum', () => {
      setUpWithSalaryCap('9999999999');
      submit();
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        expect.stringMatching(/Salary cap must be between/),
      );
    });

    it('still requires an amount when the cap is enabled and empty', () => {
      setUpWithSalaryCap();
      submit();
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Please enter a salary cap amount',
      );
    });

    it('shows an inline validation error on the field for an invalid amount', () => {
      setUpWithSalaryCap('0');
      expect(screen.getByTestId('salary-cap-error')).toBeTruthy();
      expect(screen.getByText(/Salary cap must be between/)).toBeTruthy();
    });

    it('shows no inline error for a valid amount', () => {
      setUpWithSalaryCap('50000000');
      expect(screen.queryByTestId('salary-cap-error')).toBeNull();
    });

    it('accepts a valid salaryCap and submits it', async () => {
      setUpWithSalaryCap('50000000');
      submit();
      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
      });
      type MutateCallArgs = {
        variables: { input: { salaryCap?: number; salaryCapEnabled: boolean } };
      };
      const calls = mockCreateLeagueMutate.mock.calls as MutateCallArgs[][];
      expect(calls[0][0].variables.input.salaryCapEnabled).toBe(true);
      expect(calls[0][0].variables.input.salaryCap).toBe(50000000);
    });

    it('does not validate salaryCap when the cap is disabled', async () => {
      setUpWithSalaryCap('0');
      // Toggle the cap back off — the stale 0 amount must not block submit.
      fireEvent.press(screen.getByTestId('salary-cap-toggle'));
      submit();
      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
      });
    });
  });

  describe('premium settings entitlement loading (LS-8380)', () => {
    it('shows a loading placeholder instead of the upsell card while premiumLoading is true', () => {
      mockIsPremium = true;
      mockPremiumLoading = true;
      render(<CreateLeagueScreen />);
      expect(screen.getByTestId('premium-settings-loading')).toBeTruthy();
      expect(
        screen.queryByText(/Premium features. Free leagues use All Eras/),
      ).toBeNull();
    });

    it('does not show the non-premium upsell card for a premium user once loading resolves', () => {
      mockIsPremium = true;
      mockPremiumLoading = false;
      render(<CreateLeagueScreen />);
      expect(screen.queryByTestId('premium-settings-loading')).toBeNull();
      expect(
        screen.queryByText(/Premium features. Free leagues use All Eras/),
      ).toBeNull();
    });

    it('shows the non-premium upsell card for a free user once loading resolves', () => {
      mockIsPremium = false;
      mockPremiumLoading = false;
      render(<CreateLeagueScreen />);
      expect(screen.queryByTestId('premium-settings-loading')).toBeNull();
      expect(
        screen.getByText(/Premium features. Free leagues use All Eras/),
      ).toBeTruthy();
    });
  });

  describe('football form', () => {
    beforeEach(() => {
      render(<CreateLeagueScreen />);
      fireEvent.press(screen.getByTestId('sport-selector-football'));
    });

    it('renders football player pool options', () => {
      expect(screen.getByText('All NFL')).toBeTruthy();
      expect(screen.getByText('AFC')).toBeTruthy();
      expect(screen.getByText('NFC')).toBeTruthy();
    });

    it('renders scoring format options', () => {
      expect(screen.getAllByText('Standard').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Half-PPR')).toBeTruthy();
      expect(screen.getByText('PPR')).toBeTruthy();
    });

    it('renders defensive format options', () => {
      expect(screen.getByText('D/ST')).toBeTruthy();
      expect(screen.getByText('IDP')).toBeTruthy();
    });

    it('calls mutation with football sport and navigates to football league on success', async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'My Football League',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
        type MutateCallArgs = {
          variables: { input: { sport: string } };
        };
        const calls = mockCreateLeagueMutate.mock.calls as MutateCallArgs[][];
        expect(calls[0][0].variables.input.sport).toBe('football');
        expect(mockPush).toHaveBeenCalledWith('/football/league/42');
      });
    });

    it('shows D/ST info text by default in info card', () => {
      expect(
        screen.getByText(
          /A single D\/ST slot is included in the default roster/,
        ),
      ).toBeTruthy();
    });

    it('updates info card text when IDP is selected', () => {
      fireEvent.press(screen.getByText('IDP'));
      expect(
        screen.getByText(/IDP roster slots \(DL\/LB\/DB\) will be configured/),
      ).toBeTruthy();
    });
  });
});
