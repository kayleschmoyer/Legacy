/**
 * Tests for the mobile football league creation page (LS-4158).
 * Covers rendering, form interactions, scoring/defensive format selectors,
 * mutation submission, and navigation.
 */
import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { Text as RNText, View as RNView } from 'react-native';

import { FootballLeagueCreatePage } from './create';

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

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../../__test-utils__/tamagui-mocks')
  >('../../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

const mockCreateLeagueMutate = jest.fn();
const mockCreateLeagueState = { loading: false, error: undefined };
jest.mock('../../../../api/db/graphql.generated', () => ({
  Sport: { Football: 'football' },
  useCreateLeagueMutation: (options?: {
    onCompleted?: (data: unknown) => void;
    onError?: (error: Error) => void;
  }) => {
    mockCreateLeagueMutate.mockImplementation((_args: unknown) => {
      if (options?.onCompleted) {
        options.onCompleted({
          createLeagueAndTeams: {
            league: { id: 99, name: 'Test Football League' },
          },
        });
      }
      return Promise.resolve({
        data: {
          createLeagueAndTeams: {
            league: { id: 99, name: 'Test Football League' },
          },
        },
      });
    });
    return [mockCreateLeagueMutate, mockCreateLeagueState];
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FootballLeagueCreatePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering ───────────────────────────────────────────────────────────────

  describe('form rendering', () => {
    it('renders the create football league header', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText(/Create Football League/)).toBeTruthy();
    });

    it('renders the league name input', () => {
      render(<FootballLeagueCreatePage />);
      expect(
        screen.getByPlaceholderText('Enter your league name'),
      ).toBeTruthy();
    });

    it('renders team count options', () => {
      render(<FootballLeagueCreatePage />);
      // 8, 10, 12 are unique; 14 appears in roster size too — use getAllByText
      expect(screen.getByText('8')).toBeTruthy();
      expect(screen.getByText('10')).toBeTruthy();
      expect(screen.getByText('12')).toBeTruthy();
      expect(screen.getAllByText('14').length).toBeGreaterThanOrEqual(1);
    });

    it('renders roster size options', () => {
      render(<FootballLeagueCreatePage />);
      // 13, 15-18 are unique; 14 appears in team count too
      expect(screen.getByText('13')).toBeTruthy();
      expect(screen.getAllByText('14').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('15')).toBeTruthy();
      expect(screen.getByText('16')).toBeTruthy();
      expect(screen.getByText('17')).toBeTruthy();
      expect(screen.getByText('18')).toBeTruthy();
    });

    it('renders player pool options', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText('All NFL')).toBeTruthy();
      expect(screen.getByText('AFC')).toBeTruthy();
      expect(screen.getByText('NFC')).toBeTruthy();
    });

    it('renders scoring format options', () => {
      render(<FootballLeagueCreatePage />);
      // 'Standard' also appears in selection method — use getAllByText; Half-PPR/PPR are unique
      expect(screen.getAllByText('Standard').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Half-PPR')).toBeTruthy();
      expect(screen.getByText('PPR')).toBeTruthy();
    });

    it('renders defensive format options', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText('D/ST')).toBeTruthy();
      expect(screen.getByText('IDP')).toBeTruthy();
    });

    it('renders draft mode options', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText('Live')).toBeTruthy();
      expect(screen.getByText('Auto')).toBeTruthy();
    });

    it('renders draft order options', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText('Snake')).toBeTruthy();
      expect(screen.getByText('Linear')).toBeTruthy();
    });

    it('renders the date picker', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByTestId('date-time-picker')).toBeTruthy();
    });

    it('renders Create League and Cancel buttons', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText('Create League')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('renders the info card explaining next steps', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText('What happens next?')).toBeTruthy();
    });

    it('defaults to PPR scoring format', () => {
      render(<FootballLeagueCreatePage />);
      expect(screen.getByText('PPR')).toBeTruthy();
    });

    it('defaults to D/ST defensive format and shows D/ST info text', () => {
      render(<FootballLeagueCreatePage />);
      expect(
        screen.getByText(
          /A single D\/ST slot is included in the default roster/,
        ),
      ).toBeTruthy();
    });
  });

  // ── Interactions ────────────────────────────────────────────────────────────

  describe('form interactions', () => {
    it('updates league name when typed', () => {
      render(<FootballLeagueCreatePage />);
      const input = screen.getByPlaceholderText('Enter your league name');
      fireEvent.changeText(input, 'My Football League');
      expect(input.props.value).toBe('My Football League');
    });

    it('cancel button navigates back', () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.press(screen.getByText('Cancel'));
      expect(mockBack).toHaveBeenCalled();
    });

    it('selecting IDP defensive format updates info card text', () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.press(screen.getByText('IDP'));
      expect(
        screen.getByText(/IDP roster slots \(DL\/LB\/DB\) will be configured/),
      ).toBeTruthy();
    });

    it('selecting D/ST restores default info card text after IDP was chosen', () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.press(screen.getByText('IDP'));
      fireEvent.press(screen.getByText('D/ST'));
      expect(
        screen.getByText(
          /A single D\/ST slot is included in the default roster/,
        ),
      ).toBeTruthy();
    });

    it('selecting Standard scoring format renders without error', () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.press(screen.getAllByText('Standard')[0]);
      // Scoring format changed — page still renders the create button
      expect(
        screen.getByRole('button', { name: 'Create League' }),
      ).toBeTruthy();
    });

    it('selecting Half-PPR scoring format renders without error', () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.press(screen.getByText('Half-PPR'));
      expect(
        screen.getByRole('button', { name: 'Create League' }),
      ).toBeTruthy();
    });
  });

  // ── Submission ──────────────────────────────────────────────────────────────

  describe('form submission', () => {
    it('calls createLeagueAndTeams with correct variables on valid submit', async () => {
      render(<FootballLeagueCreatePage />);

      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'My Football League',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
        type MutateCallArgs = {
          variables: {
            input: {
              leagueName: string;
              sport: string;
              defensiveFormat: string;
              scoringFormat: string;
            };
          };
        };
        const calls = mockCreateLeagueMutate.mock.calls as MutateCallArgs[][];
        const { input } = calls[0][0].variables;
        expect(input.leagueName).toBe('My Football League');
        expect(input.sport).toBe('football');
        expect(input.defensiveFormat).toBe('dst'); // default
        expect(input.scoringFormat).toBe('ppr'); // default
      });
    });

    it('submits full ISO datetime for startDate', async () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'My Football League',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        type MutateCallArgs = {
          variables: { input: { startDate: string } };
        };
        const calls = mockCreateLeagueMutate.mock.calls as MutateCallArgs[][];
        const { startDate } = calls[0][0].variables.input;
        // Must be a full ISO datetime, not truncated YYYY-MM-DD
        expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    it('navigates to new football league on successful creation', async () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'My Football League',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/football/league/99');
      });
    });

    it('does not call mutation when league name is too short', () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'AB',
      );
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));
      expect(mockCreateLeagueMutate).not.toHaveBeenCalled();
    });

    it('submits half_ppr scoringFormat when Half-PPR is selected', async () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'Half-PPR League',
      );
      fireEvent.press(screen.getByText('Half-PPR'));
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        type MutateCallArgs = {
          variables: { input: { scoringFormat: string } };
        };
        const calls = mockCreateLeagueMutate.mock.calls as MutateCallArgs[][];
        expect(calls[0][0].variables.input.scoringFormat).toBe('half_ppr');
      });
    });

    it('submits idp defensiveFormat when IDP is selected', async () => {
      render(<FootballLeagueCreatePage />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your league name'),
        'IDP Test League',
      );
      fireEvent.press(screen.getByText('IDP'));
      fireEvent.press(screen.getByRole('button', { name: 'Create League' }));

      await waitFor(() => {
        type MutateCallArgs = {
          variables: { input: { defensiveFormat: string } };
        };
        const calls = mockCreateLeagueMutate.mock.calls as MutateCallArgs[][];
        expect(calls[0][0].variables.input.defensiveFormat).toBe('idp');
      });
    });
  });
});
