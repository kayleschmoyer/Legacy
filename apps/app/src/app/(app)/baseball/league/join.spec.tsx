import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import JoinLeagueByCodeScreen from './join';

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

// Mock tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../../__test-utils__/tamagui-mocks')
  >('../../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Mock the GraphQL hooks
const mockJoinLeague = jest.fn();
const mockValidateCode = jest.fn();
jest.mock('../../../../api/db/graphql.generated', () => ({
  useJoinLeagueByCodeMutation: () => [mockJoinLeague, { loading: false }],
  useValidateInviteCodeLazyQuery: () => [mockValidateCode, { loading: false }],
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('JoinLeagueByCodeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateCode.mockResolvedValue({ data: null });
  });

  describe('rendering', () => {
    it('renders the join league header', () => {
      render(<JoinLeagueByCodeScreen />);
      // Header contains emoji prefix; button also says "Join League"
      expect(screen.getByText(/🎟️ Join League/)).toBeTruthy();
    });

    it('renders the invite code input', () => {
      render(<JoinLeagueByCodeScreen />);
      expect(
        screen.getByPlaceholderText('Enter 8-character code'),
      ).toBeTruthy();
    });

    it('renders the team name input', () => {
      render(<JoinLeagueByCodeScreen />);
      expect(screen.getByPlaceholderText('Enter your team name')).toBeTruthy();
    });

    it('renders the Cancel button', () => {
      render(<JoinLeagueByCodeScreen />);
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('renders the how it works section', () => {
      render(<JoinLeagueByCodeScreen />);
      expect(screen.getByText(/How It Works/)).toBeTruthy();
      expect(
        screen.getByText(/Get an invite code from your league/),
      ).toBeTruthy();
    });
  });

  describe('form interactions', () => {
    it('uppercases invite code input', () => {
      render(<JoinLeagueByCodeScreen />);
      const input = screen.getByPlaceholderText('Enter 8-character code');
      fireEvent.changeText(input, 'abc12xyz');
      expect(input.props.value).toBe('ABC12XYZ');
    });

    it('updates team name input', () => {
      render(<JoinLeagueByCodeScreen />);
      const input = screen.getByPlaceholderText('Enter your team name');
      fireEvent.changeText(input, 'My Awesome Team');
      expect(input.props.value).toBe('My Awesome Team');
    });

    it('cancel button navigates back', () => {
      render(<JoinLeagueByCodeScreen />);
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('calls joinLeague mutation with correct variables', async () => {
      mockJoinLeague.mockResolvedValue({
        data: { joinLeagueByCode: { leagueId: 99 } },
      });

      render(<JoinLeagueByCodeScreen />);

      // Fill in invite code and team name
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC12XYZ',
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your team name'),
        'My Team',
      );

      // Submit
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));

      await waitFor(() => {
        expect(mockJoinLeague).toHaveBeenCalledWith({
          variables: {
            inviteCode: 'ABC12XYZ',
            teamName: 'My Team',
          },
        });
      });
    });

    it('navigates to league on successful join', async () => {
      mockJoinLeague.mockResolvedValue({
        data: { joinLeagueByCode: { leagueId: 99 } },
      });

      render(<JoinLeagueByCodeScreen />);

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

    it('disables submit when invite code is empty', () => {
      render(<JoinLeagueByCodeScreen />);

      fireEvent.changeText(
        screen.getByPlaceholderText('Enter your team name'),
        'My Team',
      );

      // Join League button should be disabled when invite code is empty
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));

      // Mutation should not be called
      expect(mockJoinLeague).not.toHaveBeenCalled();
    });

    it('disables submit when team name is empty', () => {
      render(<JoinLeagueByCodeScreen />);

      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC12XYZ',
      );

      // Join League button should be disabled when team name is empty
      fireEvent.press(screen.getByRole('button', { name: /Join League/ }));

      expect(mockJoinLeague).not.toHaveBeenCalled();
    });

    it('displays error message when join fails', async () => {
      mockJoinLeague.mockRejectedValue(new Error('Already a member'));

      render(<JoinLeagueByCodeScreen />);

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
      render(<JoinLeagueByCodeScreen />);
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

    it('debounces rapid input — only fires once after typing stops', async () => {
      render(<JoinLeagueByCodeScreen />);
      const input = screen.getByPlaceholderText('Enter 8-character code');

      fireEvent.changeText(input, 'ABC12XY');
      jest.advanceTimersByTime(200);
      fireEvent.changeText(input, 'ABC12XYZ');
      jest.advanceTimersByTime(400);

      await waitFor(() => {
        expect(mockValidateCode).toHaveBeenCalledTimes(1);
        expect(mockValidateCode).toHaveBeenCalledWith({
          variables: { code: 'ABC12XYZ' },
        });
      });
    });

    it('does not validate code shorter than 8 characters', () => {
      render(<JoinLeagueByCodeScreen />);
      fireEvent.changeText(
        screen.getByPlaceholderText('Enter 8-character code'),
        'ABC1',
      );

      jest.advanceTimersByTime(400);

      expect(mockValidateCode).not.toHaveBeenCalled();
    });
  });
});
