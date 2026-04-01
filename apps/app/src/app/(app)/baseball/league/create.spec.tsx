import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { LeagueCreatePage } from './create';

// ── Mock type helpers ────────────────────────────────────────────────────────

type RNComponents = {
  View: typeof RNView;
  Text: typeof RNText;
};

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

// Mock DateTimePicker from shared-components
jest.mock('@legacy-sports/shared-components', () => {
  const { View, Text } = jest.requireActual<RNComponents>('react-native');
  return {
    DateTimePicker: ({
      value,
      onChange: _onChange,
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
  };
});

// Mock tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../../__test-utils__/tamagui-mocks')
  >('../../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Mock the GraphQL mutation
const mockCreateLeagueMutate = jest.fn();
const mockCreateLeagueState = { loading: false, error: undefined };
jest.mock('../../../../api/db/graphql.generated', () => ({
  useCreateLeagueMutation: (options?: {
    onCompleted?: (data: unknown) => void;
    onError?: (error: unknown) => void;
  }) => {
    // Store the callbacks so tests can trigger them
    mockCreateLeagueMutate.mockImplementation((_args: unknown) => {
      if (options?.onCompleted) {
        options.onCompleted({
          createLeagueAndTeams: { league: { id: 42, name: 'Test League' } },
        });
      }
      return {
        data: {
          createLeagueAndTeams: { league: { id: 42, name: 'Test League' } },
        },
      };
    });
    return [mockCreateLeagueMutate, mockCreateLeagueState];
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeagueCreatePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('form rendering', () => {
    it('renders the create league header', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByText(/Create Baseball League/)).toBeTruthy();
    });

    it('renders the league name input', () => {
      render(<LeagueCreatePage />);
      expect(
        screen.getByPlaceholderText('Enter your league name'),
      ).toBeTruthy();
    });

    it('renders team count options', () => {
      render(<LeagueCreatePage />);
      for (const count of [4, 6, 8, 10, 12, 14, 16]) {
        expect(screen.getByText(String(count))).toBeTruthy();
      }
    });

    it('renders roster size options', () => {
      render(<LeagueCreatePage />);
      for (const size of [20, 22, 25, 30, 35, 40]) {
        expect(screen.getByText(String(size))).toBeTruthy();
      }
    });

    it('renders player pool options', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByText('All MLB')).toBeTruthy();
      expect(screen.getByText('NL Only')).toBeTruthy();
      expect(screen.getByText('AL Only')).toBeTruthy();
    });

    it('renders draft mode options', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByText('Live')).toBeTruthy();
      expect(screen.getByText('Auto')).toBeTruthy();
    });

    it('renders selection method options', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByText('Standard')).toBeTruthy();
      expect(screen.getByText('Auction')).toBeTruthy();
      expect(screen.getByText('Random')).toBeTruthy();
    });

    it('renders draft order options', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByText('Snake')).toBeTruthy();
      expect(screen.getByText('Linear')).toBeTruthy();
    });

    it('renders the date picker', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByTestId('date-time-picker')).toBeTruthy();
    });

    it('renders Create League and Cancel buttons', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByText('Create League')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('renders the info card explaining next steps', () => {
      render(<LeagueCreatePage />);
      expect(screen.getByText('What happens next?')).toBeTruthy();
      expect(
        screen.getByText(/You'll be set as the league commissioner/),
      ).toBeTruthy();
    });
  });

  describe('form interactions', () => {
    it('updates league name when typed', () => {
      render(<LeagueCreatePage />);
      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'My Test League');
      expect(input.props.value).toBe('My Test League');
    });

    it('cancel button navigates back', () => {
      render(<LeagueCreatePage />);
      fireEvent.press(screen.getByText('Cancel'));
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('calls createLeagueAndTeams mutation on valid submit', async () => {
      render(<LeagueCreatePage />);

      // Fill in a valid league name (3+ chars)
      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'My Test League');

      // Submit the form
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
        type MutateCallArgs = {
          variables: {
            input: {
              leagueName: string;
              numberOfTeams: number;
              playerPool: string;
              draftMode: string;
              selectionMethod: string;
              draftOrder: string;
              maxRosterSize: number;
            };
          };
        };
        const calls = mockCreateLeagueMutate.mock.calls as MutateCallArgs[][];
        const callArgs = calls[0][0];
        const input = callArgs.variables.input;
        expect(input).toEqual(
          expect.objectContaining({
            leagueName: 'My Test League',
            numberOfTeams: 12,
            playerPool: 'all',
            draftMode: 'live',
            selectionMethod: 'standard',
            draftOrder: 'snake',
            maxRosterSize: 25,
          }),
        );
      });
    });

    it('navigates to new league on successful creation', async () => {
      render(<LeagueCreatePage />);

      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'My Test League');
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/baseball/league/42');
      });
    });

    it('disables submit when league name is too short', () => {
      render(<LeagueCreatePage />);

      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'AB');
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      // The Create League button should be disabled when name < 3 chars
      // so the mutation should not be called
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
    });
  });

  describe('form validation', () => {
    it('disables Create League button when league name is too short', () => {
      render(<LeagueCreatePage />);

      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'AB');

      // Button should not trigger mutation when pressed (disabled)
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
    });

    it('enables Create League button when league name is valid', () => {
      render(<LeagueCreatePage />);

      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'Valid League Name');

      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));
      expect(mockCreateLeagueMutate).toHaveBeenCalled();
    });
  });
});
