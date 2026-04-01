import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { LeagueStandings } from './LeagueStandings';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../__test-utils__/tamagui-mocks')
  >('../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// ── Test data ────────────────────────────────────────────────────────────────

const MOCK_TEAMS = [
  { id: 1, name: 'Sluggers', leagueId: 10 },
  { id: 2, name: 'Home Runners', leagueId: 10 },
  { id: 3, name: 'The Underdogs', leagueId: 10 },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeagueStandings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading message when loading is true', () => {
      render(<LeagueStandings teams={[]} loading={true} />);
      expect(screen.getByText('Loading standings...')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty message when teams array is empty', () => {
      render(<LeagueStandings teams={[]} />);
      expect(screen.getByText('No teams in this league yet.')).toBeTruthy();
    });
  });

  describe('with teams', () => {
    it('renders the League Standings header', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      expect(screen.getByText('League Standings')).toBeTruthy();
    });

    it('renders all team names', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      expect(screen.getByText('Sluggers')).toBeTruthy();
      expect(screen.getByText('Home Runners')).toBeTruthy();
      expect(screen.getByText('The Underdogs')).toBeTruthy();
    });

    it('shows team count', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      expect(screen.getByText('3 teams in this league')).toBeTruthy();
    });

    it('shows rank numbers', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      // Rank column header
      expect(screen.getByText('Rank')).toBeTruthy();
    });

    it('shows column headers', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      expect(screen.getByText('Rank')).toBeTruthy();
      expect(screen.getByText('Team Name')).toBeTruthy();
      expect(screen.getByText('Points')).toBeTruthy();
    });

    it('shows info message about upcoming scoring', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      expect(screen.getByText(/Stats and scoring coming soon/)).toBeTruthy();
    });

    it('highlights user team when userTeamId is provided', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} userTeamId={2} />);
      expect(screen.getByText('(Your Team)')).toBeTruthy();
    });

    it('does not show Your Team label when userTeamId does not match', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} userTeamId={999} />);
      expect(screen.queryByText('(Your Team)')).toBeNull();
    });

    it('shows Tap to view roster hint', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      const hints = screen.getAllByText('Tap to view roster');
      expect(hints.length).toBe(3);
    });
  });

  describe('navigation', () => {
    it('navigates to team detail when team row is pressed', () => {
      render(<LeagueStandings teams={MOCK_TEAMS} />);
      // Press the Pressable wrapper, not the Text child (press events don't bubble in RNTL)
      fireEvent.press(screen.getByTestId('team-row-1'));
      expect(mockPush).toHaveBeenCalledWith('/baseball/team/1');
    });
  });
});
