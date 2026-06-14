import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import BaseballPlayers from './players';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('tamagui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return {
    ...mocks.tamaguiMocks,
    YStack: ({
      children,
      onPress,
      testID,
    }: {
      children: import('react').ReactNode;
      onPress?: () => void;
      testID?: string;
      [key: string]: unknown;
    }) => {
      const { View, Pressable } =
        jest.requireActual<typeof import('react-native')>('react-native');
      if (onPress) {
        return createElement(Pressable, { onPress, testID }, children);
      }
      return createElement(View, { testID }, children);
    },
  };
});

const mockUseBaseballPlayersQuery = jest.fn();
jest.mock('../../../api/db/graphql.generated', () => ({
  useBaseballPlayersQuery: (...args: unknown[]) =>
    mockUseBaseballPlayersQuery(...args) as Record<string, unknown>,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BATTER = {
  id: 1,
  firstName: 'Babe',
  lastName: 'Ruth',
  eligiblePositions: ['RF', 'OF', 'P'],
  careerBatting: {
    battingAverage: 0.342,
    homeRuns: 714,
    rbi: 2214,
    stolenBases: 123,
    hits: 2873,
  },
  careerPitching: null,
};

const PITCHER = {
  id: 2,
  firstName: 'Walter',
  lastName: 'Johnson',
  eligiblePositions: ['SP'],
  careerBatting: null,
  careerPitching: {
    era: '2.17',
    wins: 417,
    losses: 279,
    strikeouts: 3509,
    saves: 34,
  },
};

const defaultQueryResult = {
  data: { players: [BATTER] },
  loading: false,
  error: undefined,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BaseballPlayers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBaseballPlayersQuery.mockReturnValue(defaultQueryResult);
  });

  describe('rendering', () => {
    it('renders all position filter pills', () => {
      render(<BaseballPlayers />);
      for (const pos of ['All', 'P', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH']) {
        expect(screen.getByTestId(`position-pill-${pos}`)).toBeTruthy();
      }
    });

    it('renders the search input', () => {
      render(<BaseballPlayers />);
      expect(screen.getByPlaceholderText('Search players...')).toBeTruthy();
    });

    it('renders player name for a returned player', () => {
      render(<BaseballPlayers />);
      expect(screen.getByText('Babe Ruth')).toBeTruthy();
    });

    it('renders batting stats for a batter', () => {
      render(<BaseballPlayers />);
      expect(screen.getByText('.342')).toBeTruthy();
      expect(screen.getByText('AVG')).toBeTruthy();
      expect(screen.getByText('714')).toBeTruthy();
      expect(screen.getByText('HR')).toBeTruthy();
      expect(screen.getByText('2,214')).toBeTruthy();
      expect(screen.getByText('RBI')).toBeTruthy();
    });

    it('renders pitching stats for a pitcher', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: { players: [PITCHER] },
      });
      render(<BaseballPlayers />);
      expect(screen.getByText('Walter Johnson')).toBeTruthy();
      expect(screen.getByText('2.17')).toBeTruthy();
      expect(screen.getByText('ERA')).toBeTruthy();
      expect(screen.getByText('417-279')).toBeTruthy();
      expect(screen.getByText('W-L')).toBeTruthy();
    });

    it('shows loading spinner when initial load is in progress', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        data: undefined,
        loading: true,
        error: undefined,
      });
      render(<BaseballPlayers />);
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows empty state when no players match', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        data: { players: [] },
        loading: false,
        error: undefined,
      });
      render(<BaseballPlayers />);
      expect(screen.getByText('No players found')).toBeTruthy();
    });

    it('shows error banner when query fails', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('Network error'),
      });
      render(<BaseballPlayers />);
      expect(
        screen.getByText('Failed to load players. Please try again.'),
      ).toBeTruthy();
    });

    it('shows "No stats available" for batter with no careerBatting', () => {
      const noStats = { ...BATTER, careerBatting: null };
      mockUseBaseballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: { players: [noStats] },
      });
      render(<BaseballPlayers />);
      expect(screen.getByText('No stats available')).toBeTruthy();
    });

    it('shows "No stats available" for pitcher with no careerPitching', () => {
      const noStats = { ...PITCHER, careerPitching: null };
      mockUseBaseballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: { players: [noStats] },
      });
      render(<BaseballPlayers />);
      expect(screen.getByText('No stats available')).toBeTruthy();
    });
  });

  describe('navigation (AC1)', () => {
    it('navigates to PlayerDetail screen when a player card is pressed', () => {
      render(<BaseballPlayers />);
      fireEvent.press(screen.getByTestId('player-row-1'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/PlayerDetail',
        params: { playerId: '1', playerName: 'Babe Ruth' },
      });
    });

    it('navigates to PlayerDetail for a pitcher when pressed', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        ...defaultQueryResult,
        data: { players: [PITCHER] },
      });
      render(<BaseballPlayers />);
      fireEvent.press(screen.getByTestId('player-row-2'));
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/PlayerDetail',
        params: { playerId: '2', playerName: 'Walter Johnson' },
      });
    });
  });

  describe('position filter', () => {
    function lastVariables(): Record<string, unknown> {
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: Record<string, unknown> },
      ];
      return lastCall[0].variables;
    }

    it('sends no position filter when "All" is selected (default)', () => {
      render(<BaseballPlayers />);
      expect(lastVariables().position).toBeUndefined();
    });

    it('sends position filter when a position pill is pressed', () => {
      render(<BaseballPlayers />);
      fireEvent.press(screen.getByTestId('position-pill-P'));
      expect(lastVariables().position).toBe('P');
    });

    it('clears position filter when "All" is pressed after selecting a position', () => {
      render(<BaseballPlayers />);
      fireEvent.press(screen.getByTestId('position-pill-P'));
      fireEvent.press(screen.getByTestId('position-pill-All'));
      expect(lastVariables().position).toBeUndefined();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('passes search term to query after debounce fires', () => {
      render(<BaseballPlayers />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'Ruth');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBe('Ruth');
    });

    it('passes undefined search when input is shorter than 2 chars', () => {
      render(<BaseballPlayers />);
      const input = screen.getByPlaceholderText('Search players...');
      fireEvent.changeText(input, 'R');
      void act(() => {
        jest.advanceTimersByTime(300);
      });
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { search?: string } },
      ];
      expect(lastCall[0].variables.search).toBeUndefined();
    });
  });

  describe('load more pagination', () => {
    const PAGE_SIZE = 50;
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      ...BATTER,
      id: i + 100,
      firstName: `Player`,
      lastName: `${i + 100}`,
    }));

    it('shows "Load more" button when the page is full (hasMore heuristic)', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        data: { players: fullPage },
        loading: false,
        error: undefined,
      });
      render(<BaseballPlayers />);
      expect(screen.getByText('Load more')).toBeTruthy();
    });

    it('does not show "Load more" when the page has fewer than PAGE_SIZE items', () => {
      render(<BaseballPlayers />);
      expect(screen.queryByText('Load more')).toBeNull();
    });

    it('sends incremented offset after pressing "Load more"', () => {
      mockUseBaseballPlayersQuery.mockReturnValue({
        data: { players: fullPage },
        loading: false,
        error: undefined,
      });
      render(<BaseballPlayers />);
      fireEvent.press(screen.getByText('Load more'));
      const calls = mockUseBaseballPlayersQuery.mock.calls;
      const lastCall = calls[calls.length - 1] as [
        { variables: { offset?: number } },
      ];
      expect(lastCall[0].variables.offset).toBe(PAGE_SIZE);
    });
  });
});
