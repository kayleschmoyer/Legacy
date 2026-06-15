import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import JoinLeagueScreen from './join';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

const mockJoinLeague = jest.fn();
const mockValidateCode = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useJoinLeagueByCodeMutation: () => [mockJoinLeague, { loading: false }],
  useValidateInviteCodeLazyQuery: () => [mockValidateCode, { loading: false }],
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JoinLeagueScreen (unified)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateCode.mockResolvedValue({ data: null });
  });

  describe('rendering', () => {
    it('renders the join league header', () => {
      render(<JoinLeagueScreen />);
      expect(screen.getByText(/🎟️ Join League/)).toBeTruthy();
    });

    it('renders sport selector buttons', () => {
      render(<JoinLeagueScreen />);
      expect(screen.getByTestId('sport-selector-baseball')).toBeTruthy();
      expect(screen.getByTestId('sport-selector-football')).toBeTruthy();
    });

    it('renders the invite code input', () => {
      render(<JoinLeagueScreen />);
      expect(
        screen.getByPlaceholderText('Enter 8-character code'),
      ).toBeTruthy();
    });

    it('renders the team name input', () => {
      render(<JoinLeagueScreen />);
      expect(screen.getByPlaceholderText('Enter your team name')).toBeTruthy();
    });

    it('renders the Cancel button', () => {
      render(<JoinLeagueScreen />);
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('renders the how it works section', () => {
      render(<JoinLeagueScreen />);
      expect(screen.getByText(/How It Works/)).toBeTruthy();
      expect(
        screen.getByText(/Get an invite code from your league/),
      ).toBeTruthy();
    });
  });

  describe('form interactions', () => {
    it('uppercases invite code input', () => {
      render(<JoinLeagueScreen />);
      const input = screen.getByPlaceholderText('Enter 8-character code');
      fireEvent.changeText(input, 'abc12xyz');
      expect(input.props.value).toBe('ABC12XYZ');
    });

    it('updates team name input', () => {
      render(<JoinLeagueScreen />);
      const input = screen.getByPlaceholderText('Enter your team name');
      fireEvent.changeText(input, 'My Awesome Team');
      expect(input.props.value).toBe('My Awesome Team');
    });

    it('cancel button navigates back', () => {
      render(<JoinLeagueScreen />);
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('sport-aware navigation', () => {
    it('navigates to baseball league when baseball sport is selected (default)', async () => {
      mockJoinLeague.mockResolvedValue({
        data: { joinLeagueByCode: { leagueId: 99 } },
      });

      render(<JoinLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC12XYZ',
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your team name'),
        'My Team',
      );
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/99');
      });
    });

    it('navigates to football league when football sport is selected', async () => {
      mockJoinLeague.mockResolvedValue({
        data: { joinLeagueByCode: { leagueId: 77 } },
      });

      render(<JoinLeagueScreen />);

      fireEvent.press(screen.getByTestId('sport-selector-football'));

      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC12XYZ',
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your team name'),
        'My Team',
      );
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/football/league/77');
      });
    });
  });

  describe('form validation', () => {
    it('disables submit when invite code is empty', () => {
      render(<JoinLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your team name'),
        'My Team',
      );
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));
      expect(mockJoinLeague).not.toHaveBeenCalled();
    });

    it('disables submit when team name is empty', () => {
      render(<JoinLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC12XYZ',
      );
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));
      expect(mockJoinLeague).not.toHaveBeenCalled();
    });

    it('displays error message when join fails', async () => {
      mockJoinLeague.mockRejectedValue(new Error('Already a member'));

      render(<JoinLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC12XYZ',
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your team name'),
        'My Team',
      );
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));

      await waitFor(() => {
        expect(screen.getByText(/Already a member/)).toBeTruthy();
      });
    });
  });

  describe('invite code validation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('triggers code validation after debounce when 8 valid characters are entered', async () => {
      render(<JoinLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC12XYZ',
      );

      expect(mockValidateCode).not.toHaveBeenCalled();

      jest.advanceTimersByTime(400);

      await waitFor(() => {
        expect(mockValidateCode).toHaveBeenCalledWith({
          variables: { code: 'ABC12XYZ' },
        });
      });
    });

    it('does not validate code shorter than 8 characters', () => {
      render(<JoinLeagueScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC1',
      );

      jest.advanceTimersByTime(400);

      expect(mockValidateCode).not.toHaveBeenCalled();
    });
  });
});
